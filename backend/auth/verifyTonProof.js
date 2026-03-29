import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { sha256 } from '@ton/crypto'
import { Address, Cell, contractAddress, loadStateInit } from '@ton/core'
import nacl from 'tweetnacl'
import {
  WalletContractV1R3,
  WalletContractV2R2,
  WalletContractV3R2,
  WalletContractV4,
} from '@ton/ton'

const tonProofPrefix = Buffer.from('ton-proof-item-v2/', 'utf8')
const tonConnectPrefix = Buffer.from('ton-connect', 'utf8')

function loadWalletV1Data(cs) {
  cs.loadUint(32)
  return { publicKey: cs.loadBuffer(32) }
}

function loadWalletV2Data(cs) {
  cs.loadUint(32)
  return { publicKey: cs.loadBuffer(32) }
}

function loadWalletV3Data(cs) {
  cs.loadUint(32)
  cs.loadUint(32)
  return { publicKey: cs.loadBuffer(32) }
}

function loadWalletV4Data(cs) {
  cs.loadUint(32)
  cs.loadUint(32)
  return { publicKey: cs.loadBuffer(32) }
}

const knownWallets = [
  { contract: WalletContractV1R3, loadData: loadWalletV1Data },
  { contract: WalletContractV2R2, loadData: loadWalletV2Data },
  { contract: WalletContractV3R2, loadData: loadWalletV3Data },
  { contract: WalletContractV4, loadData: loadWalletV4Data },
].map(({ contract, loadData }) => ({
  loadData,
  wallet: contract.create({ workchain: 0, publicKey: Buffer.alloc(32) }),
}))

/**
 * @param {import('@ton/core').StateInit} stateInit
 * @returns {Buffer | null}
 */
export function tryParsePublicKeyFromStateInit(stateInit) {
  if (!stateInit.code || !stateInit.data) return null
  for (const { wallet, loadData } of knownWallets) {
    try {
      if (wallet.init.code.equals(stateInit.code)) {
        return Buffer.from(loadData(stateInit.data.beginParse()).publicKey)
      }
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Stateless tonProof payload: v1|expiresAtMs|nonce|hmacHex
 */
export function createSignedTonProofPayload(authSecret) {
  const expiresAt = Date.now() + 15 * 60 * 1000
  const nonce = crypto.randomBytes(16).toString('hex')
  const h = crypto.createHmac('sha256', authSecret).update(`v1|${expiresAt}|${nonce}`).digest('hex')
  const payload = `v1|${expiresAt}|${nonce}|${h}`
  return { payload, expiresAt }
}

export function verifyTonProofPayloadString(payload, authSecret) {
  if (typeof payload !== 'string' || payload.length > 512) return false
  const parts = payload.split('|')
  if (parts.length !== 4 || parts[0] !== 'v1') return false
  const exp = Number(parts[1])
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  const nonce = parts[2]
  const sig = parts[3]
  if (!/^[0-9a-f]{32,128}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(sig)) return false
  const expected = crypto.createHmac('sha256', authSecret).update(`v1|${exp}|${nonce}`).digest('hex')
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function parseAllowedProofDomains() {
  const fromEnv = (process.env.TON_PROOF_ALLOWED_DOMAINS ?? process.env.SIGN_DATA_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const defaults = ['localhost', '127.0.0.1']
  const vercel = (process.env.VERCEL_URL ?? '').replace(/^https?:\/\//i, '').trim().toLowerCase()
  if (vercel) defaults.push(vercel)
  const site = (process.env.SITE_HOST ?? process.env.PUBLIC_SITE_HOST ?? '')
    .replace(/^https?:\/\//i, '')
    .trim()
    .toLowerCase()
  if (site) defaults.push(site)
  return [...new Set([...fromEnv, ...defaults])]
}

function proofDomainAllowed(value) {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return false
  const allowed = parseAllowedProofDomains()
  return allowed.some((a) => {
    if (!a) return false
    if (v === a) return true
    if (v.startsWith(`${a}:`)) return true
    return v.endsWith(`.${a}`)
  })
}

const PROOF_MAX_AGE_SEC = Number(process.env.TON_PROOF_MAX_AGE_SEC ?? 900)

/**
 * @param {object} body
 * @param {string} body.address
 * @param {string} body.public_key
 * @param {object} body.proof
 * @param {(addr: string) => Promise<Buffer | null>} [fetchPublicKey]
 */
export async function verifyTonConnectProof(body, authSecret, fetchPublicKey) {
  try {
    const address = String(body?.address ?? '').trim()
    const publicKeyHex = String(body?.public_key ?? body?.publicKey ?? '')
      .replace(/^0x/i, '')
      .trim()
    const proof = body?.proof
    if (!address || !publicKeyHex || !proof || typeof proof !== 'object') return false

    const payloadStr = String(proof.payload ?? '')
    if (!verifyTonProofPayloadString(payloadStr, authSecret)) return false

    const wantedPublicKey = Buffer.from(publicKeyHex, 'hex')
    if (wantedPublicKey.length !== 32) return false

    const stateInit = loadStateInit(Cell.fromBase64(String(proof.state_init ?? proof.stateInit ?? '')).beginParse())

    let publicKey = tryParsePublicKeyFromStateInit(stateInit)
    if (!publicKey && typeof fetchPublicKey === 'function') {
      publicKey = await fetchPublicKey(address)
    }
    if (!publicKey) return false
    if (!publicKey.equals(wantedPublicKey)) return false

    const wantedAddress = Address.parse(address)
    const resolved = contractAddress(wantedAddress.workChain, stateInit)
    if (!resolved.equals(wantedAddress)) return false

    const domainValue = String(proof.domain?.value ?? '')
    if (!proofDomainAllowed(domainValue)) return false
    const lenBytes = Number(proof.domain?.lengthBytes)
    if (!Number.isFinite(lenBytes) || Buffer.byteLength(domainValue, 'utf8') !== lenBytes) return false

    const ts = Number(proof.timestamp)
    if (!Number.isFinite(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    if (now - PROOF_MAX_AGE_SEC > ts || ts > now + 120) return false

    const wc = Buffer.alloc(4)
    wc.writeUInt32BE(wantedAddress.workChain, 0)
    const tsBuf = Buffer.alloc(8)
    tsBuf.writeBigUInt64LE(BigInt(ts), 0)
    const dl = Buffer.alloc(4)
    dl.writeUInt32LE(lenBytes, 0)

    const msg = Buffer.concat([
      tonProofPrefix,
      wc,
      wantedAddress.hash,
      dl,
      Buffer.from(domainValue, 'utf8'),
      tsBuf,
      Buffer.from(payloadStr, 'utf8'),
    ])

    const msgHash = Buffer.from(await sha256(msg))
    const fullMsg = Buffer.concat([Buffer.from([0xff, 0xff]), tonConnectPrefix, msgHash])
    const result = Buffer.from(await sha256(fullMsg))

    let signature
    try {
      signature = Buffer.from(String(proof.signature ?? ''), 'base64')
    } catch {
      return false
    }
    if (signature.length !== 64) return false

    return nacl.sign.detached.verify(new Uint8Array(result), new Uint8Array(signature), new Uint8Array(publicKey))
  } catch {
    return false
  }
}
