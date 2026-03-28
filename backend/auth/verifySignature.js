import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import nacl from 'tweetnacl'
import { Address } from '@ton/core'
import { WalletContractV4 } from '@ton/ton'

/**
 * TonConnect SignData (text) — hash as in
 * https://github.com/mois-ilya/ton-sign-data-reference
 */
export function createTextSignDataHash(payload, parsedAddr, domain, timestamp) {
  const wcBuffer = Buffer.alloc(4)
  wcBuffer.writeInt32BE(parsedAddr.workChain)

  const domainBuffer = Buffer.from(domain, 'utf8')
  const domainLenBuffer = Buffer.alloc(4)
  domainLenBuffer.writeUInt32BE(domainBuffer.length)

  const tsBuffer = Buffer.alloc(8)
  tsBuffer.writeBigUInt64BE(BigInt(timestamp))

  const typePrefix = Buffer.from('txt')
  const payloadBuffer = Buffer.from(payload.text, 'utf8')
  const payloadLenBuffer = Buffer.alloc(4)
  payloadLenBuffer.writeUInt32BE(payloadBuffer.length)

  const message = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect/sign-data/'),
    wcBuffer,
    parsedAddr.hash,
    domainLenBuffer,
    domainBuffer,
    tsBuffer,
    typePrefix,
    payloadLenBuffer,
    payloadBuffer,
  ])

  return crypto.createHash('sha256').update(message).digest()
}

function parseAllowedDomains() {
  const raw =
    process.env.SIGN_DATA_ALLOWED_DOMAINS ?? 'localhost,127.0.0.1'
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function domainAllowed(domain) {
  const d = (domain ?? '').trim().toLowerCase()
  if (!d) return false
  const allowed = parseAllowedDomains()
  return allowed.some((a) => d === a || d === `${a}` || d.endsWith(`.${a}`))
}

/**
 * @param {object} signData - TonConnect signData result: { signature, address, timestamp, domain, payload }
 * @param {Buffer} publicKey - 32 bytes
 */
export function verifyTonConnectTextSignData(signData, publicKey) {
  if (!signData || signData.payload?.type !== 'text') return false
  const ts = Number(signData.timestamp)
  if (!Number.isFinite(ts)) return false
  const maxAge = Number(process.env.SIGN_DATA_MAX_AGE_SEC ?? 900)
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxAge) return false
  if (!domainAllowed(String(signData.domain ?? ''))) return false

  let parsedAddr
  try {
    parsedAddr = Address.parse(signData.address)
  } catch {
    return false
  }

  const finalHash = createTextSignDataHash(signData.payload, parsedAddr, signData.domain, ts)
  let sig
  try {
    sig = Buffer.from(signData.signature, 'base64')
  } catch {
    return false
  }
  if (sig.length !== 64) return false

  return nacl.sign.detached.verify(new Uint8Array(finalHash), new Uint8Array(sig), new Uint8Array(publicKey))
}

/**
 * Адрес v4r2 (workchain 0) из публичного ключа — должен совпадать с account address.
 */
export function addressFromPublicKeyV4(publicKeyBuf) {
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: publicKeyBuf })
  return wallet.address.toString({ urlSafe: true, bounceable: false })
}

export function addressesEqual(a, b) {
  try {
    return Address.parse(a).equals(Address.parse(b))
  } catch {
    return false
  }
}

/**
 * Простая подпись: detached Ed25519 над UTF-8 строкой challenge (без префикса TonConnect).
 * Для локального кошелька (mnemonic в памяти на время подписи).
 */
export function verifySimpleDetached(message, signatureB64, publicKeyBuf, expectedAddress) {
  if (!message || !signatureB64 || !publicKeyBuf || publicKeyBuf.length !== 32) return false
  const derived = addressFromPublicKeyV4(publicKeyBuf)
  if (!addressesEqual(derived, expectedAddress)) return false
  let sig
  try {
    sig = Buffer.from(signatureB64, 'base64')
  } catch {
    return false
  }
  if (sig.length !== 64) return false
  const msgBuf = Buffer.from(message, 'utf8')
  return nacl.sign.detached.verify(new Uint8Array(msgBuf), new Uint8Array(sig), new Uint8Array(publicKeyBuf))
}
