import crypto from 'node:crypto'
import { URL } from 'node:url'
import { query } from './db/pool.js'
import {
  createSignedTonProofPayload,
  verifyTonConnectProof,
} from './auth/verifyTonProof.js'
import {
  verifySimpleDetached,
  addressFromPublicKeyV4,
  addressesEqual,
} from './auth/verifySignature.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function loadAuthSecret() {
  const raw = (process.env.AUTH_SECRET ?? '').trim()
  if (raw.length >= 32) return raw
  if (IS_PRODUCTION) {
    throw new Error(
      'AUTH_SECRET must be set to a strong value (at least 32 characters) in production',
    )
  }
  if (raw.length > 0 && raw.length < 32) {
    console.warn('[degram] AUTH_SECRET is shorter than 32 characters; use a longer secret in production')
    return raw
  }
  console.warn(
    '[degram] AUTH_SECRET not set; using a fixed local-dev secret (set AUTH_SECRET in .env for stable sessions)',
  )
  return 'degram-local-dev-only-secret-min-32-chars!!'
}

function getCorsAllowOrigin(req) {
  const raw = (process.env.CORS_ORIGIN ?? '').trim()
  if (raw) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length === 1) return parts[0]
    const origin = req.headers.origin
    if (typeof origin === 'string' && parts.includes(origin)) return origin
    return parts[0]
  }
  if (IS_PRODUCTION) {
    const v = (process.env.VERCEL_URL ?? '').replace(/^https?:\/\//i, '').trim()
    if (v) return `https://${v}`
    throw new Error(
      'CORS_ORIGIN must be set in production when VERCEL_URL is missing (e.g. https://your-domain.com)',
    )
  }
  return '*'
}

const AUTH_SECRET = loadAuthSecret()

const MAX_BODY_BYTES = 128 * 1024
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const REQUESTS_PER_MINUTE = Number(process.env.REQUESTS_PER_MINUTE ?? 300)
const HOLDINGS_REQUESTS_PER_MINUTE = Number(process.env.HOLDINGS_REQUESTS_PER_MINUTE ?? 60)
// "Blockchain vitrine" (NFT / Jettons / DNS + USD valuation).
// These calls are read-only and executed on demand.
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY ?? ''
const TONCENTER_API_BASE = process.env.TONCENTER_API_BASE ?? 'https://toncenter.com/api/v3'
const TONCENTER_TIMEOUT_MS = Number(process.env.TONCENTER_TIMEOUT_MS ?? 9000)
const TONAPI_BASE = process.env.TONAPI_BASE ?? 'https://tonapi.io/v2'
const TONAPI_KEY = process.env.TONAPI_KEY ?? ''
const COINGECKO_TON_PRICE_URL =
  process.env.COINGECKO_TON_PRICE_URL ??
  'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd'
const DYOR_API_KEY = process.env.DYOR_API_KEY ?? ''

const HOLDINGS_NFT_LIMIT = Number(process.env.HOLDINGS_NFT_LIMIT ?? 12)
const HOLDINGS_JETTON_LIMIT = Number(process.env.HOLDINGS_JETTON_LIMIT ?? 10)
const HOLDINGS_DNS_LIMIT = Number(process.env.HOLDINGS_DNS_LIMIT ?? 12)

function nowMs() {
  return Date.now()
}

function createId() {
  return crypto.randomUUID()
}

function normalizeHandle(handle) {
  return handle.trim().replace(/^@+/, '').toLowerCase()
}

function parsePositiveInt(value, fallback, max = 100) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(max, Math.floor(n)))
}

function encodeCursor(post) {
  return Buffer.from(`${post.createdAt}|${post.id}`, 'utf8').toString('base64')
}

function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8')
    const [createdAtStr, id] = raw.split('|')
    const createdAt = Number(createdAtStr)
    if (!Number.isFinite(createdAt) || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body ?? {})
  const allowOrigin = res.degramCorsOrigin ?? '*'
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...securityHeaders(),
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  })
  res.end(payload)
}

function getIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

/**
 * PostgreSQL-backed rate limit (works across serverless instances).
 * @param {'global' | 'holdings'} kind
 */
async function checkRateLimit(ip, kind = 'global') {
  const max = kind === 'holdings' ? HOLDINGS_REQUESTS_PER_MINUTE : REQUESTS_PER_MINUTE
  const minute = Math.floor(nowMs() / 60_000)
  const safeIp = String(ip ?? 'unknown').slice(0, 256)
  const bucketKey = `${kind}:${safeIp}`
  try {
    const { rows } = await query(
      `INSERT INTO rate_limits (bucket_key, minute_epoch, hits)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket_key, minute_epoch)
       DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`,
      [bucketKey, minute],
    )
    const hits = Number(rows[0]?.hits ?? 0)
    if (Math.random() < 0.02) {
      await query(`DELETE FROM rate_limits WHERE minute_epoch < $1`, [minute - 15]).catch(() => {})
    }
    return hits <= max
  } catch (e) {
    console.error('rate_limit_error', e)
    return true
  }
}

function toNumberSafe(value, fallback = 0) {
  if (value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseNanoToTonParts(nanoString) {
  const nano = BigInt(nanoString ?? '0')
  const ton = nano / 1_000_000_000n
  const frac = nano % 1_000_000_000n
  // 6 decimals for UI.
  const frac6 = (frac / 1000n).toString().padStart(6, '0')
  return {
    tonStr: `${ton.toString()}.${frac6}`,
    tonApprox: Number(ton) + Number(frac6) / 1_000_000,
  }
}

async function withTimeout(fn, ms) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fn(controller)
  } finally {
    clearTimeout(t)
  }
}

async function toncenterGet(pathname, params) {
  const base = TONCENTER_API_BASE.endsWith('/') ? TONCENTER_API_BASE : `${TONCENTER_API_BASE}/`
  const clean = pathname.startsWith('/') ? pathname.slice(1) : pathname
  const url = new URL(clean, base)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue
      url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    headers: TONCENTER_API_KEY ? { 'X-API-Key': TONCENTER_API_KEY } : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`toncenter_${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

async function tonapiGet(pathname, params) {
  const base = TONAPI_BASE.endsWith('/') ? TONAPI_BASE : `${TONAPI_BASE}/`
  const clean = pathname.startsWith('/') ? pathname.slice(1) : pathname
  const url = new URL(clean, base)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue
      url.searchParams.set(k, String(v))
    }
  }
  const headers = {}
  if (TONAPI_KEY) headers.Authorization = `Bearer ${TONAPI_KEY}`
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`tonapi_${res.status}`)
  return res.json()
}

async function fetchPublicKeyFromTonapi(address) {
  const addr = address.trim()
  if (!addr) return null
  try {
    const json = await tonapiGet(`/accounts/${encodeURIComponent(addr)}`)
    const pk = json?.public_key ?? json?.publicKey
    if (typeof pk === 'string' && /^[0-9a-f]{64}$/i.test(pk)) {
      return Buffer.from(pk, 'hex')
    }
  } catch {
    /* ignore */
  }
  return null
}

function sanitizeNanoBalance(value) {
  const raw = String(value ?? '0').trim()
  return /^[0-9]+$/.test(raw) ? raw : '0'
}

function emptyHoldings(address, details = null) {
  return {
    address,
    fetchedAt: nowMs(),
    ton: {
      balanceNano: '0',
      balanceTon: '0.000000',
      balanceUsd: null,
      tonPriceUsd: null,
    },
    jettons: [],
    nfts: [],
    dns: [],
    totalUsd: null,
    pricing: {
      tonUsdSource: 'CoinGecko',
      jettonsUsdSource: DYOR_API_KEY ? 'DYOR' : null,
    },
    partial: true,
    error: details ?? 'holdings_unavailable',
  }
}

async function getTonPriceUsd() {
  try {
    const res = await fetch(COINGECKO_TON_PRICE_URL)
    if (!res.ok) return null
    const json = await res.json()
    // CoinGecko returns { "the-open-network": { "usd": <number> } }
    const topKey = Object.keys(json ?? {})[0]
    const usd = json?.[topKey]?.usd
    return usd == null ? null : toNumberSafe(usd, NaN)
  } catch {
    return null
  }
}

async function getWalletHoldings(address) {
  const addr = address.trim()
  if (!addr) throw new Error('address_required')

  let tonBalanceNano = '0'
  let tonPriceUsd = null
  let tonUsd = null

  // TON balance (nanoTON)
  let usedTonCenter = false
  try {
    const json = await withTimeout(
      async (controller) => {
        const url = `${TONCENTER_API_BASE}/walletStates?address=${encodeURIComponent(addr)}`
        const init = { signal: controller.signal, headers: {} }
        if (TONCENTER_API_KEY) init.headers['X-API-Key'] = TONCENTER_API_KEY
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(`walletStates_${res.status}`)
        return res.json()
      },
      TONCENTER_TIMEOUT_MS,
    )
    tonBalanceNano = sanitizeNanoBalance(json?.wallets?.[0]?.balance ?? '0')
    usedTonCenter = true
  } catch {
    // partial
  }

  tonPriceUsd = await getTonPriceUsd()
  const { tonApprox } = parseNanoToTonParts(sanitizeNanoBalance(tonBalanceNano))
  tonUsd = tonPriceUsd == null || !Number.isFinite(tonPriceUsd) ? null : tonApprox * tonPriceUsd

  // Jettons
  let jettons = []
  let toncenterJettonsOk = false
  try {
    const wallets = await toncenterGet('/jetton/wallets', {
      owner_address: addr,
      exclude_zero_balance: true,
      limit: 50,
      sort: 'desc',
    })
    const jettonWallets = wallets?.jetton_wallets ?? []
    const topWallets = jettonWallets.slice(0, 50)

    const masters = [...new Set(topWallets.map((w) => w.jetton).filter(Boolean))]
    const masterMeta = new Map()
    if (masters.length) {
      const url = new URL(`${TONCENTER_API_BASE}/jetton/masters`)
      url.searchParams.set('limit', String(Math.min(1024, masters.length)))
      for (const m of masters) url.searchParams.append('address', m)
      const init = { headers: {} }
      if (TONCENTER_API_KEY) init.headers['X-API-Key'] = TONCENTER_API_KEY
      const res = await fetch(url.toString(), init)
      if (res.ok) {
        const json = await res.json()
        for (const item of json?.jetton_masters ?? []) {
          masterMeta.set(item.address, item.jetton_content ?? {})
        }
      }
    }

    jettons = topWallets.slice(0, HOLDINGS_JETTON_LIMIT).map((w) => {
      const meta = masterMeta.get(w.jetton) ?? {}
      const balance = w.balance ?? '0'
      const decimals = meta?.decimals != null ? Number(meta.decimals) : null
      const symbol = meta?.symbol ?? null
      const image = meta?.image ?? null
      const name = meta?.name ?? null

      let amount = null
      try {
        if (decimals != null && Number.isFinite(decimals)) {
          const b = BigInt(balance)
          const div = 10n ** BigInt(decimals)
          const whole = b / div
          const frac = b % div
          const fracDigits = decimals > 6 ? 6 : decimals
          const fracScaled = frac / 10n ** BigInt(decimals - fracDigits)
          amount = `${whole.toString()}.${fracScaled.toString().padStart(fracDigits, '0')}`
        }
      } catch {
        // ignore
      }

      return {
        master: w.jetton,
        walletAddress: w.address,
        balance,
        amount, // human-ish
        symbol: symbol ?? undefined,
        name: name ?? undefined,
        image: image ?? undefined,
      }
    })
    toncenterJettonsOk = true
  } catch {
    // partial
  }

  // NFTs
  let nfts = []
  let toncenterNftsOk = false
  try {
    const nftJson = await toncenterGet('/nft/items', {
      owner_address: addr,
      limit: HOLDINGS_NFT_LIMIT,
      offset: 0,
    })
    nfts = (nftJson?.nft_items ?? []).slice(0, HOLDINGS_NFT_LIMIT).map((it) => {
      const collectionContent = it?.collection?.collection_content ?? {}
      return {
        itemAddress: it.address,
        collectionAddress: it.collection_address ?? it?.collection?.address ?? null,
        ownerAddress: it.owner_address ?? null,
        collectionName: collectionContent?.name ?? collectionContent?.symbol ?? undefined,
        image: collectionContent?.image ?? collectionContent?.thumb ?? undefined,
        onSale: Boolean(it.on_sale),
      }
    })
    toncenterNftsOk = true
  } catch {
    // partial
  }

  // DNS domains
  let dnsDomains = []
  let toncenterDnsOk = false
  try {
    const dnsJson = await toncenterGet('/dns/records', {
      wallet: addr,
      limit: HOLDINGS_DNS_LIMIT,
      offset: 0,
    })
    const records = dnsJson?.records ?? []
    const domains = records.map((r) => r.domain).filter(Boolean)
    dnsDomains = [...new Set(domains)].slice(0, HOLDINGS_DNS_LIMIT).map((domain) => ({ domain }))
    toncenterDnsOk = true
  } catch {
    // partial
  }

  // Fallback provider (TonAPI) when TonCenter is unavailable or rate-limited.
  const needFallback = !usedTonCenter || !toncenterJettonsOk || !toncenterNftsOk
  if (needFallback) {
    try {
      const accountJson = await tonapiGet(`/accounts/${encodeURIComponent(addr)}`)
      const apiNano = sanitizeNanoBalance(accountJson?.balance ?? '0')
      if (apiNano !== '0' || tonBalanceNano === '0') {
        tonBalanceNano = apiNano
        const { tonStr: t, tonApprox: a } = parseNanoToTonParts(tonBalanceNano)
        tonUsd = tonPriceUsd == null || !Number.isFinite(tonPriceUsd) ? null : a * tonPriceUsd
        if (t) {
          // Refresh tonStr-like value indirectly by keeping tonBalanceNano; final response recalculates display.
        }
      }
    } catch {
      // ignore
    }

    if (!toncenterJettonsOk || jettons.length === 0) {
      try {
        const jettonsJson = await tonapiGet(`/accounts/${encodeURIComponent(addr)}/jettons`, {
          currencies: 'usd',
          limit: HOLDINGS_JETTON_LIMIT,
        })
        const balances = jettonsJson?.balances ?? []
        jettons = balances.slice(0, HOLDINGS_JETTON_LIMIT).map((b) => ({
          master: b?.jetton?.address ?? b?.jetton_address ?? '',
          walletAddress: b?.wallet_address ?? '',
          balance: String(b?.balance ?? '0'),
          amount: b?.balance ?? null,
          symbol: b?.jetton?.symbol ?? undefined,
          name: b?.jetton?.name ?? undefined,
          image: b?.jetton?.image ?? undefined,
        }))
      } catch {
        // ignore
      }
    }

    if (!toncenterNftsOk || nfts.length === 0) {
      try {
        const nftsJson = await tonapiGet(`/accounts/${encodeURIComponent(addr)}/nfts`, {
          limit: HOLDINGS_NFT_LIMIT,
        })
        const items = nftsJson?.nft_items ?? nftsJson?.items ?? []
        nfts = items.slice(0, HOLDINGS_NFT_LIMIT).map((it) => ({
          itemAddress: it?.address ?? '',
          collectionAddress: it?.collection?.address ?? null,
          ownerAddress: it?.owner?.address ?? null,
          collectionName: it?.collection?.name ?? undefined,
          image: it?.preview?.image ?? it?.metadata?.image ?? undefined,
          onSale: Boolean(it?.sale),
        }))
      } catch {
        // ignore
      }
    }

    if (!toncenterDnsOk && dnsDomains.length === 0) {
      try {
        const dnsJson = await tonapiGet(`/dns/${encodeURIComponent(addr)}`)
        const names = []
        if (typeof dnsJson?.name === 'string') names.push(dnsJson.name)
        if (Array.isArray(dnsJson?.domains)) {
          for (const d of dnsJson.domains) {
            if (typeof d?.name === 'string') names.push(d.name)
          }
        }
        dnsDomains = [...new Set(names)].slice(0, HOLDINGS_DNS_LIMIT).map((domain) => ({ domain }))
      } catch {
        // ignore
      }
    }
  }

  // USD valuation (best effort):
  // - TON: CoinGecko
  // - Jettons: DYOR (optional)
  let jettonsUsd = 0
  if (DYOR_API_KEY && tonUsd != null && jettons.length) {
    for (const j of jettons) {
      if (!j.master || j.amount == null) continue
      try {
        const url = new URL(`https://api.dyor.io/v1/jettons/${encodeURIComponent(j.master)}/price`)
        url.searchParams.set('currency', 'usd')
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${DYOR_API_KEY}` },
        })
        if (!res.ok) continue
        const priceJson = await res.json()
        const unitUsd = toNumberSafe(priceJson?.price?.usd, NaN)
        if (!Number.isFinite(unitUsd)) continue
        const qty = Number(j.amount)
        if (!Number.isFinite(qty)) continue
        jettonsUsd += qty * unitUsd
      } catch {
        // ignore
      }
    }
  }

  const totalUsd = tonUsd == null ? null : tonUsd + (Number.isFinite(jettonsUsd) ? jettonsUsd : 0)
  const { tonStr } = parseNanoToTonParts(sanitizeNanoBalance(tonBalanceNano))

  return {
    address: addr,
    fetchedAt: nowMs(),
    ton: {
      balanceNano: tonBalanceNano,
      balanceTon: tonStr,
      balanceUsd: tonUsd,
      tonPriceUsd,
    },
    jettons,
    nfts,
    dns: dnsDomains,
    totalUsd,
    pricing: {
      tonUsdSource: 'CoinGecko',
      jettonsUsdSource: DYOR_API_KEY ? 'DYOR' : null,
    },
  }
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('payload_too_large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid_json')
  }
}

function mapUser(row) {
  if (!row) return null
  return {
    address: row.wallet_address,
    handle: row.handle,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: Number(row.created_at),
  }
}

function mapPost(row) {
  if (!row) return null
  return {
    id: row.id,
    authorAddress: row.author_wallet_address,
    authorHandle: row.author_handle,
    content: row.content,
    replyToPostId: row.reply_to_post_id ?? null,
    createdAt: Number(row.created_at),
  }
}

async function findAccountByAddress(address) {
  const { rows } = await query('SELECT * FROM users WHERE wallet_address = $1', [address])
  return mapUser(rows[0])
}

async function findAccountByHandle(handle) {
  const { rows } = await query('SELECT * FROM users WHERE handle = $1', [normalizeHandle(handle)])
  return mapUser(rows[0])
}

async function findPostById(postId) {
  const { rows } = await query(
    `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
     FROM posts WHERE id = $1`,
    [postId],
  )
  return mapPost(rows[0])
}

async function enrichPosts(posts, viewerAddress) {
  if (!posts.length) return []
  const ids = posts.map((p) => p.id)

  const likesCounts = new Map()
  const { rows: likeRows } = await query(
    `SELECT post_id, COUNT(*)::int AS c FROM likes WHERE post_id = ANY($1::text[]) GROUP BY post_id`,
    [ids],
  )
  for (const row of likeRows) likesCounts.set(row.post_id, Number(row.c))

  const repliesCounts = new Map()
  const { rows: replyRows } = await query(
    `SELECT reply_to_post_id AS pid, COUNT(*)::int AS c FROM posts
     WHERE reply_to_post_id = ANY($1::text[]) GROUP BY reply_to_post_id`,
    [ids],
  )
  for (const row of replyRows) {
    if (row.pid) repliesCounts.set(row.pid, Number(row.c))
  }

  const likedSet = new Set()
  if (viewerAddress) {
    const { rows: likedRows } = await query(
      `SELECT post_id FROM likes WHERE wallet_address = $1 AND post_id = ANY($2::text[])`,
      [viewerAddress, ids],
    )
    for (const row of likedRows) likedSet.add(row.post_id)
  }

  const parentIds = [...new Set(posts.map((p) => p.replyToPostId).filter(Boolean))]
  const parentMap = new Map()
  if (parentIds.length) {
    const { rows: parentRows } = await query(
      `SELECT id, author_handle, content FROM posts WHERE id = ANY($1::text[])`,
      [parentIds],
    )
    for (const row of parentRows) {
      const prev = row.content
      const contentPreview = prev.length > 100 ? `${prev.slice(0, 100)}…` : prev
      parentMap.set(row.id, {
        id: row.id,
        authorHandle: row.author_handle,
        contentPreview,
      })
    }
  }

  return posts.map((p) => ({
    ...p,
    likesCount: likesCounts.get(p.id) ?? 0,
    repliesCount: repliesCounts.get(p.id) ?? 0,
    likedByViewer: viewerAddress ? likedSet.has(p.id) : false,
    replyTo: p.replyToPostId ? parentMap.get(p.replyToPostId) ?? null : null,
  }))
}

async function getAccountStats(address) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM follows WHERE followee_wallet_address = $1) AS followers,
       (SELECT COUNT(*)::int FROM follows WHERE follower_wallet_address = $2) AS following,
       (SELECT COUNT(*)::int FROM posts WHERE author_wallet_address = $3) AS posts`,
    [address, address, address],
  )
  const row = rows[0]
  return {
    followersCount: Number(row?.followers ?? 0),
    followingCount: Number(row?.following ?? 0),
    postsCount: Number(row?.posts ?? 0),
  }
}

function createSessionToken(address) {
  const exp = nowMs() + SESSION_TTL_MS
  const nonce = createId()
  const payload = `${address}|${exp}|${nonce}`
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}|${sig}`, 'utf8').toString('base64')
}

function verifySessionToken(token) {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8')
    const [address, expStr, nonce, sig] = raw.split('|')
    const exp = Number(expStr)
    if (!address || !nonce || !sig || !Number.isFinite(exp)) return null
    if (exp < nowMs()) return null
    const payload = `${address}|${exp}|${nonce}`
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex')
    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
    return { address, exp, nonce }
  } catch {
    return null
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization
  if (!auth || typeof auth !== 'string') return null
  const [scheme, token] = auth.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

function requireAddressAuth(req) {
  const token = getBearerToken(req)
  if (!token) return null
  const parsed = verifySessionToken(token)
  return parsed ? parsed.address : null
}

function parsePublicKeyHex(hex) {
  try {
    const s = String(hex ?? '').replace(/^0x/i, '').trim()
    if (!s) return null
    const b = Buffer.from(s, 'hex')
    return b.length === 32 ? b : null
  } catch {
    return null
  }
}

/**
 * Все мутации требуют валидный Bearer session token.
 */
function requireBearerAuth(req, res) {
  const addr = requireAddressAuth(req)
  if (!addr) {
    jsonResponse(res, 401, { error: 'auth_required' })
    return null
  }
  return addr
}

async function maybeCleanupAuth() {
  if (Math.random() > 0.02) return
  const now = nowMs()
  await query('DELETE FROM auth_challenges WHERE expires_at <= $1 OR used_at IS NOT NULL', [now])
  await query('DELETE FROM sessions WHERE expires_at <= $1', [now])
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleRequest(req, res) {
  try {
    res.degramCorsOrigin = getCorsAllowOrigin(req)

    const ip = getIp(req)
    if (!(await checkRateLimit(ip, 'global'))) return jsonResponse(res, 429, { error: 'rate_limited' })

    const host = req.headers.host ?? 'localhost'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const method = req.method ?? 'GET'

    if (method === 'OPTIONS') return jsonResponse(res, 204, {})

    await maybeCleanupAuth()

    if (method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse(res, 200, {
        ok: true,
        storage: 'postgresql',
        version: 6,
      })
    }

    if (method === 'GET' && url.pathname === '/api/wallet/holdings') {
      if (!(await checkRateLimit(ip, 'holdings'))) {
        return jsonResponse(res, 429, { error: 'rate_limited_holdings' })
      }
      const address = (url.searchParams.get('address') ?? '').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })
      try {
        const holdings = await getWalletHoldings(address)
        return jsonResponse(res, 200, holdings)
      } catch (e) {
        const message = e && typeof e === 'object' && 'message' in e ? e.message : String(e)
        return jsonResponse(res, 200, emptyHoldings(address, message))
      }
    }

    if (method === 'GET' && url.pathname === '/api/ready') {
      await query('SELECT 1 AS ok')
      return jsonResponse(res, 200, { ok: true })
    }

    if (method === 'GET' && url.pathname === '/api/auth/ton-proof-payload') {
      const { payload, expiresAt } = createSignedTonProofPayload(AUTH_SECRET)
      return jsonResponse(res, 200, { payload, expiresAt })
    }

    if (method === 'POST' && url.pathname === '/api/auth/ton-proof') {
      const body = await readBody(req)
      const address = String(body?.address ?? '').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })

      const ok = await verifyTonConnectProof(body, AUTH_SECRET, fetchPublicKeyFromTonapi)
      if (!ok) return jsonResponse(res, 401, { error: 'ton_proof_invalid' })

      const token = createSessionToken(address)
      const expiresAt = nowMs() + SESSION_TTL_MS
      await query(
        `INSERT INTO sessions (id, wallet_address, token, issued_at, expires_at, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [createId(), address, token, nowMs(), expiresAt, ip],
      )

      return jsonResponse(res, 200, { token, expiresAt })
    }

    if (method === 'POST' && url.pathname === '/api/auth/challenge') {
      const body = await readBody(req)
      const address = (body?.address ?? '').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })

      const challengeId = createId()
      const nonce = createId()
      const issuedAt = nowMs()
      const expiresAt = issuedAt + CHALLENGE_TTL_MS
      const message = `Degram auth challenge\nAddress: ${address}\nNonce: ${nonce}\nExpiresAt: ${expiresAt}`

      await query(
        `INSERT INTO auth_challenges (id, wallet_address, nonce, message, issued_at, expires_at, used_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
        [challengeId, address, nonce, message, issuedAt, expiresAt],
      )
      return jsonResponse(res, 200, { challengeId, message, expiresAt })
    }

    if (method === 'POST' && url.pathname === '/api/auth/verify') {
      const body = await readBody(req)
      const address = (body?.address ?? '').trim()
      const challengeId = (body?.challengeId ?? '').trim()
      const publicKeyHex = String(body?.publicKey ?? body?.public_key ?? '').replace(/^0x/i, '').trim()
      const simpleSignature = (body?.simpleSignature ?? body?.simple_signature ?? '').trim()

      if (!address || !challengeId || !publicKeyHex) {
        return jsonResponse(res, 400, { error: 'address_challenge_pubkey_required' })
      }

      const pk = parsePublicKeyHex(publicKeyHex)
      if (!pk) return jsonResponse(res, 400, { error: 'invalid_public_key' })

      const derivedFromPk = addressFromPublicKeyV4(pk)
      if (!addressesEqual(derivedFromPk, address)) {
        return jsonResponse(res, 400, { error: 'public_key_address_mismatch' })
      }

      const { rows } = await query('SELECT * FROM auth_challenges WHERE id = $1 AND wallet_address = $2', [
        challengeId,
        address,
      ])
      const challenge = rows[0]
      if (!challenge) return jsonResponse(res, 401, { error: 'invalid_challenge' })
      if (Number(challenge.expires_at) < nowMs()) return jsonResponse(res, 401, { error: 'challenge_expired' })
      if (challenge.used_at != null) return jsonResponse(res, 401, { error: 'challenge_already_used' })

      const message = String(challenge.message ?? '')
      if (!simpleSignature) {
        return jsonResponse(res, 400, { error: 'simple_signature_required' })
      }

      const ok = verifySimpleDetached(message, simpleSignature, pk, address)
      if (!ok) {
        return jsonResponse(res, 401, { error: 'signature_verification_failed' })
      }

      const consumed = await query(
        `UPDATE auth_challenges SET used_at = $1 WHERE id = $2 AND used_at IS NULL RETURNING id`,
        [nowMs(), challengeId],
      )
      if (!consumed.rows[0]) {
        return jsonResponse(res, 401, { error: 'challenge_already_used' })
      }

      const token = createSessionToken(address)
      const expiresAt = nowMs() + SESSION_TTL_MS
      await query(
        `INSERT INTO sessions (id, wallet_address, token, issued_at, expires_at, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [createId(), address, token, nowMs(), expiresAt, ip],
      )

      return jsonResponse(res, 200, { token, expiresAt })
    }

    if (method === 'GET' && url.pathname === '/api/accounts/by-address') {
      const address = (url.searchParams.get('address') ?? '').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })
      return jsonResponse(res, 200, { account: await findAccountByAddress(address) })
    }

    if (method === 'GET' && url.pathname === '/api/accounts/by-handle') {
      const handle = normalizeHandle(url.searchParams.get('handle') ?? '')
      if (!handle) return jsonResponse(res, 400, { error: 'handle_required' })
      return jsonResponse(res, 200, { account: await findAccountByHandle(handle) })
    }

    if (method === 'GET' && url.pathname === '/api/accounts/stats') {
      const address = (url.searchParams.get('address') ?? '').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })
      return jsonResponse(res, 200, { stats: await getAccountStats(address) })
    }

    if (method === 'GET' && url.pathname === '/api/follows/status') {
      const follower = (url.searchParams.get('follower') ?? '').trim()
      const followee = (url.searchParams.get('followee') ?? '').trim()
      if (!follower || !followee) return jsonResponse(res, 400, { error: 'follower_followee_required' })
      const { rows } = await query(
        `SELECT 1 AS ok FROM follows WHERE follower_wallet_address = $1 AND followee_wallet_address = $2`,
        [follower, followee],
      )
      return jsonResponse(res, 200, { following: Boolean(rows[0]) })
    }

    if (method === 'GET' && url.pathname === '/api/posts/by-id') {
      const id = (url.searchParams.get('id') ?? '').trim()
      const viewer = (url.searchParams.get('viewer') ?? '').trim()
      if (!id) return jsonResponse(res, 400, { error: 'id_required' })
      const p = await findPostById(id)
      if (!p) return jsonResponse(res, 404, { error: 'not_found' })
      const enriched = await enrichPosts([p], viewer)
      return jsonResponse(res, 200, { post: enriched[0] })
    }

    if (method === 'POST' && url.pathname === '/api/accounts') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return

      const address = (body?.address ?? '').trim()
      const handle = normalizeHandle(body?.handle ?? '')
      const displayName = (body?.displayName ?? '').trim()
      const avatarColor = (body?.avatarColor ?? 'hsl(180 85% 55%)').trim()

      if (!address || !handle) return jsonResponse(res, 400, { error: 'address_handle_required' })
      if (!/^[a-z0-9_]{3,20}$/.test(handle)) return jsonResponse(res, 400, { error: 'invalid_handle' })
      if (authAddress !== address) return jsonResponse(res, 403, { error: 'address_mismatch' })

      const existingByAddress = await findAccountByAddress(address)
      const existingByHandle = await findAccountByHandle(handle)

      if (existingByHandle && (!existingByAddress || existingByHandle.address !== existingByAddress.address)) {
        return jsonResponse(res, 409, { error: 'handle_taken' })
      }

      const now = nowMs()
      if (existingByAddress) {
        await query(
          `UPDATE users
           SET handle = $1, display_name = $2, avatar_color = $3, updated_at = $4
           WHERE wallet_address = $5`,
          [handle, displayName || handle, avatarColor, now, address],
        )
      } else {
        await query(
          `INSERT INTO users (wallet_address, handle, display_name, avatar_color, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [address, handle, displayName || handle, avatarColor, now, now],
        )
      }
      const next = await findAccountByAddress(address)
      return jsonResponse(res, 201, { account: next })
    }

    if (method === 'GET' && url.pathname === '/api/posts') {
      const limit = parsePositiveInt(url.searchParams.get('limit') ?? '20', 20, 100)
      const cursor = url.searchParams.get('cursor')
      const offsetParam = url.searchParams.get('offset')
      const viewer = (url.searchParams.get('viewer') ?? '').trim()

      const { rows: cRows } = await query('SELECT COUNT(*)::int AS c FROM posts')
      const total = Number(cRows[0]?.c ?? 0)

      if (offsetParam != null) {
        const offset = Math.max(0, Number(offsetParam) || 0)
        const { rows } = await query(
          `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
           FROM posts ORDER BY created_at DESC, id DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset],
        )
        const page = rows.map((r) => mapPost(r))
        return jsonResponse(res, 200, {
          posts: await enrichPosts(page, viewer),
          total,
          nextCursor: page.length === limit ? encodeCursor(page[page.length - 1]) : null,
        })
      }

      const c = decodeCursor(cursor)
      const { rows } = c
        ? await query(
            `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
             FROM posts
             WHERE (created_at < $1) OR (created_at = $1 AND id < $2)
             ORDER BY created_at DESC, id DESC
             LIMIT $3`,
            [c.createdAt, c.id, limit],
          )
        : await query(
            `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
             FROM posts ORDER BY created_at DESC, id DESC
             LIMIT $1`,
            [limit],
          )
      const page = rows.map((r) => mapPost(r))
      const nextCursor = page.length === limit ? encodeCursor(page[page.length - 1]) : null
      return jsonResponse(res, 200, {
        posts: await enrichPosts(page, viewer),
        total,
        nextCursor,
      })
    }

    if (method === 'GET' && url.pathname === '/api/posts/by-address') {
      const address = (url.searchParams.get('address') ?? '').trim()
      const limit = parsePositiveInt(url.searchParams.get('limit') ?? '20', 20, 100)
      const cursor = url.searchParams.get('cursor')
      const offsetParam = url.searchParams.get('offset')
      const viewer = (url.searchParams.get('viewer') ?? '').trim()

      if (!address) return jsonResponse(res, 400, { error: 'address_required' })

      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS c FROM posts WHERE author_wallet_address = $1`,
        [address],
      )
      const total = Number(countRows[0]?.c ?? 0)

      if (offsetParam != null) {
        const offset = Math.max(0, Number(offsetParam) || 0)
        const { rows } = await query(
          `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
           FROM posts WHERE author_wallet_address = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2 OFFSET $3`,
          [address, limit, offset],
        )
        const page = rows.map((r) => mapPost(r))
        return jsonResponse(res, 200, {
          posts: await enrichPosts(page, viewer),
          total,
          nextCursor: page.length === limit ? encodeCursor(page[page.length - 1]) : null,
        })
      }

      const c = decodeCursor(cursor)
      const { rows } = c
        ? await query(
            `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
             FROM posts
             WHERE author_wallet_address = $1
               AND ((created_at < $2) OR (created_at = $2 AND id < $3))
             ORDER BY created_at DESC, id DESC
             LIMIT $4`,
            [address, c.createdAt, c.id, limit],
          )
        : await query(
            `SELECT id, author_wallet_address, author_handle, content, reply_to_post_id, created_at
             FROM posts WHERE author_wallet_address = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2`,
            [address, limit],
          )
      const page = rows.map((r) => mapPost(r))
      const nextCursor = page.length === limit ? encodeCursor(page[page.length - 1]) : null
      return jsonResponse(res, 200, {
        posts: await enrichPosts(page, viewer),
        total,
        nextCursor,
      })
    }

    if (method === 'POST' && url.pathname === '/api/posts') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return

      const authorAddress = (body?.authorAddress ?? '').trim()
      const authorHandle = normalizeHandle(body?.authorHandle ?? '')
      const content = (body?.content ?? '').trim()
      const replyToPostId = (body?.replyToPostId ?? '').trim() || null
      const createdAt = Number(body?.createdAt ?? nowMs())

      if (!authorAddress || !authorHandle || !content) {
        return jsonResponse(res, 400, { error: 'authorAddress_authorHandle_content_required' })
      }
      if (authAddress !== authorAddress) return jsonResponse(res, 403, { error: 'address_mismatch' })
      if (content.length > 500) return jsonResponse(res, 400, { error: 'content_too_long' })

      const account = await findAccountByAddress(authorAddress)
      if (!account) return jsonResponse(res, 404, { error: 'account_not_found' })
      if (normalizeHandle(account.handle) !== authorHandle) return jsonResponse(res, 403, { error: 'handle_mismatch' })
      if (replyToPostId && !(await findPostById(replyToPostId)))
        return jsonResponse(res, 404, { error: 'reply_target_not_found' })

      const post = {
        id: createId(),
        authorAddress,
        authorHandle,
        content,
        replyToPostId,
        createdAt: Number.isFinite(createdAt) ? createdAt : nowMs(),
      }
      await query(
        `INSERT INTO posts (id, author_wallet_address, author_handle, content, reply_to_post_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [post.id, post.authorAddress, post.authorHandle, post.content, post.replyToPostId, post.createdAt],
      )
      const enriched = (await enrichPosts([post], authorAddress))[0]
      return jsonResponse(res, 201, { post: enriched })
    }

    if (method === 'GET' && url.pathname === '/api/feed/home') {
      const address = (url.searchParams.get('address') ?? '').trim()
      const limit = parsePositiveInt(url.searchParams.get('limit') ?? '20', 20, 100)
      const cursor = url.searchParams.get('cursor')
      const viewer = (url.searchParams.get('viewer') ?? '').trim() || address
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })

      const homeWhere = `(
          p.author_wallet_address = $1
          OR p.author_wallet_address IN (
              SELECT followee_wallet_address FROM follows WHERE follower_wallet_address = $2
          )
        )`

      const { rows: totalRows } = await query(
        `SELECT COUNT(*)::int AS c FROM posts p WHERE ${homeWhere}`,
        [address, address],
      )
      const total = Number(totalRows[0]?.c ?? 0)

      const c = decodeCursor(cursor)
      const { rows: homeRows } = c
        ? await query(
            `SELECT p.id, p.author_wallet_address, p.author_handle, p.content, p.reply_to_post_id, p.created_at
             FROM posts p
             WHERE ${homeWhere}
               AND ((p.created_at < $3) OR (p.created_at = $3 AND p.id < $4))
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT $5`,
            [address, address, c.createdAt, c.id, limit],
          )
        : await query(
            `SELECT p.id, p.author_wallet_address, p.author_handle, p.content, p.reply_to_post_id, p.created_at
             FROM posts p
             WHERE ${homeWhere}
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT $3`,
            [address, address, limit],
          )
      const page = homeRows.map((r) => mapPost(r))
      const nextCursor = page.length === limit ? encodeCursor(page[page.length - 1]) : null
      return jsonResponse(res, 200, {
        posts: await enrichPosts(page, viewer),
        total,
        nextCursor,
      })
    }

    if (method === 'POST' && url.pathname === '/api/follows') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return
      const followerAddress = (body?.followerAddress ?? '').trim()
      const followeeAddress = (body?.followeeAddress ?? '').trim()
      if (!followerAddress || !followeeAddress) return jsonResponse(res, 400, { error: 'follower_followee_required' })
      if (followerAddress === followeeAddress) return jsonResponse(res, 400, { error: 'cannot_follow_self' })
      if (authAddress !== followerAddress) return jsonResponse(res, 403, { error: 'address_mismatch' })
      if (!(await findAccountByAddress(followerAddress)) || !(await findAccountByAddress(followeeAddress))) {
        return jsonResponse(res, 404, { error: 'account_not_found' })
      }

      await query(
        `INSERT INTO follows (follower_wallet_address, followee_wallet_address, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [followerAddress, followeeAddress, nowMs()],
      )
      return jsonResponse(res, 200, { ok: true })
    }

    if (method === 'POST' && url.pathname === '/api/follows/remove') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return
      const followerAddress = (body?.followerAddress ?? '').trim()
      const followeeAddress = (body?.followeeAddress ?? '').trim()
      if (!followerAddress || !followeeAddress) return jsonResponse(res, 400, { error: 'follower_followee_required' })
      if (authAddress !== followerAddress) return jsonResponse(res, 403, { error: 'address_mismatch' })
      await query(`DELETE FROM follows WHERE follower_wallet_address = $1 AND followee_wallet_address = $2`, [
        followerAddress,
        followeeAddress,
      ])
      return jsonResponse(res, 200, { ok: true })
    }

    if (method === 'GET' && url.pathname === '/api/follows/by-address') {
      const address = (url.searchParams.get('address') ?? '').trim()
      const direction = (url.searchParams.get('direction') ?? 'following').trim()
      if (!address) return jsonResponse(res, 400, { error: 'address_required' })

      if (direction === 'followers') {
        const { rows } = await query(
          `SELECT follower_wallet_address AS wallet_address, created_at
           FROM follows WHERE followee_wallet_address = $1
           ORDER BY created_at DESC`,
          [address],
        )
        return jsonResponse(res, 200, { items: rows })
      }

      const { rows } = await query(
        `SELECT followee_wallet_address AS wallet_address, created_at
         FROM follows WHERE follower_wallet_address = $1
         ORDER BY created_at DESC`,
        [address],
      )
      return jsonResponse(res, 200, { items: rows })
    }

    if (method === 'POST' && url.pathname === '/api/likes') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return
      const postId = (body?.postId ?? '').trim()
      const walletAddress = (body?.walletAddress ?? '').trim()
      if (!postId || !walletAddress) return jsonResponse(res, 400, { error: 'post_wallet_required' })
      if (authAddress !== walletAddress) return jsonResponse(res, 403, { error: 'address_mismatch' })
      if (!(await findAccountByAddress(walletAddress))) return jsonResponse(res, 404, { error: 'account_not_found' })
      if (!(await findPostById(postId))) return jsonResponse(res, 404, { error: 'post_not_found' })

      await query(
        `INSERT INTO likes (post_id, wallet_address, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [postId, walletAddress, nowMs()],
      )
      return jsonResponse(res, 200, { ok: true })
    }

    if (method === 'POST' && url.pathname === '/api/likes/remove') {
      const body = await readBody(req)
      const authAddress = requireBearerAuth(req, res)
      if (!authAddress) return
      const postId = (body?.postId ?? '').trim()
      const walletAddress = (body?.walletAddress ?? '').trim()
      if (!postId || !walletAddress) return jsonResponse(res, 400, { error: 'post_wallet_required' })
      if (authAddress !== walletAddress) return jsonResponse(res, 403, { error: 'address_mismatch' })

      await query(`DELETE FROM likes WHERE post_id = $1 AND wallet_address = $2`, [postId, walletAddress])
      return jsonResponse(res, 200, { ok: true })
    }

    if (method === 'GET' && url.pathname === '/api/likes/by-post') {
      const postId = (url.searchParams.get('postId') ?? '').trim()
      if (!postId) return jsonResponse(res, 400, { error: 'post_id_required' })
      const { rows } = await query(`SELECT COUNT(*)::int AS c FROM likes WHERE post_id = $1`, [postId])
      return jsonResponse(res, 200, { postId, likesCount: Number(rows[0]?.c ?? 0) })
    }

    if (method === 'GET' && url.pathname === '/api/recommended') {
      const limit = parsePositiveInt(url.searchParams.get('limit') ?? '6', 6, 50)
      const since = nowMs() - 7 * 24 * 60 * 60 * 1000
      const { rows } = await query(
        `SELECT author_handle AS handle, COUNT(*)::int AS count
         FROM posts
         WHERE created_at >= $1
         GROUP BY author_handle
         ORDER BY count DESC
         LIMIT $2`,
        [since, limit],
      )
      const items = rows.map((r) => ({ handle: r.handle, count: Number(r.count) }))
      return jsonResponse(res, 200, { items })
    }

    return jsonResponse(res, 404, { error: 'not_found' })
  } catch (e) {
    const message = e && typeof e === 'object' && 'message' in e ? e.message : String(e)
    if (message === 'invalid_json') return jsonResponse(res, 400, { error: 'invalid_json' })
    if (message === 'payload_too_large') return jsonResponse(res, 413, { error: 'payload_too_large' })
    console.error(e)
    const isProd = process.env.NODE_ENV === 'production'
    return jsonResponse(res, 500, isProd ? { error: 'server_error' } : { error: 'server_error', details: message })
  }
}
