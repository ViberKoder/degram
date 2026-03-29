import { Buffer } from 'node:buffer'
import nacl from 'tweetnacl'
import { Address } from '@ton/core'
import { WalletContractV4 } from '@ton/ton'

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
 * Подпись Ed25519 над UTF-8 challenge (локальный кошелёк / повторный вход).
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
