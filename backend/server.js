import http from 'node:http'
import { URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT ?? 3002)
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

ensureDataDir()

const accountsFile = path.join(DATA_DIR, 'accounts.json')
const postsFile = path.join(DATA_DIR, 'posts.json')

let accounts = readJson(accountsFile, [])
let posts = readJson(postsFile, [])

function persistAccounts() {
  writeJsonAtomic(accountsFile, accounts)
}

function persistPosts() {
  writeJsonAtomic(postsFile, posts)
}

function jsonResponse(res, status, body) {
  const payload = body == null ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

function textResponse(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  return JSON.parse(raw)
}

function findAccountByAddress(address) {
  return accounts.find((a) => a.address === address) ?? null
}

function handleTaken(handle) {
  const h = handle.trim().toLowerCase()
  return accounts.find((a) => a.handle.toLowerCase() === h) ?? null
}

function createId() {
  if (globalThis.crypto && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function sortPostsByCreatedAtDesc(items) {
  return [...items].sort((a, b) => b.createdAt - a.createdAt)
}

function paginate(items, limit = 20, offset = 0) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  const safeOffset = Math.max(0, Number(offset) || 0)
  return items.slice(safeOffset, safeOffset + safeLimit)
}

function avatarFromHandle(handle) {
  // Keep in sync with frontend hashToHsl approximation is out of scope for backend.
  // We'll just return a neutral placeholder. Frontend already shows avatar by handle.
  return 'hsl(180 85% 55%)'
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const method = req.method ?? 'GET'

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      return res.end()
    }

    // Health
    if (method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse(res, 200, { ok: true })
    }

    // Accounts
    if (method === 'GET' && url.pathname === '/api/accounts/by-address') {
      const address = url.searchParams.get('address') ?? ''
      const acc = findAccountByAddress(address)
      return jsonResponse(res, 200, { account: acc })
    }

    if (method === 'POST' && url.pathname === '/api/accounts') {
      const body = await readBody(req)
      const address = (body?.address ?? '').trim()
      const handle = (body?.handle ?? '').trim()
      const displayName = (body?.displayName ?? '').trim()
      const avatarColor = (body?.avatarColor ?? avatarFromHandle(handle)).trim()

      if (!address || !handle) return jsonResponse(res, 400, { error: 'address and handle are required' })

      const existingByAddress = findAccountByAddress(address)
      const existingByHandle = handleTaken(handle)

      if (existingByHandle && (!existingByAddress || existingByHandle.address !== existingByAddress.address)) {
        return jsonResponse(res, 409, { error: 'handle_taken' })
      }

      const now = Date.now()
      const next = {
        address,
        handle: handle.toLowerCase().startsWith('@') ? handle.slice(1).toLowerCase() : handle.toLowerCase(),
        displayName: displayName || handle,
        avatarColor,
        createdAt: existingByAddress?.createdAt ?? now,
      }

      if (existingByAddress) {
        accounts = accounts.map((a) => (a.address === address ? next : a))
      } else {
        accounts.push(next)
      }
      persistAccounts()
      return jsonResponse(res, 201, { account: next })
    }

    // Posts
    if (method === 'GET' && url.pathname === '/api/posts') {
      const limit = url.searchParams.get('limit') ?? '20'
      const offset = url.searchParams.get('offset') ?? '0'
      const sorted = sortPostsByCreatedAtDesc(posts)
      const page = paginate(sorted, limit, offset)
      return jsonResponse(res, 200, { posts: page, total: posts.length })
    }

    if (method === 'GET' && url.pathname === '/api/posts/by-address') {
      const address = url.searchParams.get('address') ?? ''
      const limit = url.searchParams.get('limit') ?? '50'
      const offset = url.searchParams.get('offset') ?? '0'
      const items = posts.filter((p) => p.authorAddress === address)
      const page = paginate(sortPostsByCreatedAtDesc(items), limit, offset)
      return jsonResponse(res, 200, { posts: page, total: items.length })
    }

    if (method === 'POST' && url.pathname === '/api/posts') {
      const body = await readBody(req)
      const authorAddress = (body?.authorAddress ?? '').trim()
      const authorHandle = (body?.authorHandle ?? '').trim()
      const content = (body?.content ?? '').trim()
      const createdAt = body?.createdAt ? Number(body.createdAt) : Date.now()

      if (!authorAddress || !authorHandle || !content) {
        return jsonResponse(res, 400, { error: 'authorAddress, authorHandle, content are required' })
      }

      const post = {
        id: (body?.id ?? createId()).toString(),
        authorAddress,
        authorHandle: authorHandle.toLowerCase().startsWith('@') ? authorHandle.toLowerCase().slice(1) : authorHandle.toLowerCase(),
        content: content.slice(0, 500),
        createdAt,
      }

      posts.push(post)
      persistPosts()
      return jsonResponse(res, 201, { post })
    }

    // Recommended (very naive for MVP)
    if (method === 'GET' && url.pathname === '/api/recommended') {
      const limit = url.searchParams.get('limit') ?? '6'
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000
      const recent = posts.filter((p) => p.createdAt >= since)
      const counts = {}
      for (const p of recent) counts[p.authorHandle] = (counts[p.authorHandle] ?? 0) + 1
      const top = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, Number(limit) || 6)
        .map(([handle, count]) => ({ handle, count }))
      return jsonResponse(res, 200, { items: top })
    }

    return jsonResponse(res, 404, { error: 'not_found' })
  } catch (e) {
    const message = e && typeof e === 'object' && 'message' in e ? e.message : String(e)
    return jsonResponse(res, 500, { error: 'server_error', details: message })
  }
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Degram backend listening on http://localhost:${PORT}`)
})

