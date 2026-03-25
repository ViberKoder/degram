import { mnemonicNew, mnemonicToWalletKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV4 } from '@ton/ton'

export type EncryptedSeed = {
  ciphertextB64: string
  ivB64: string
  saltB64: string
  iterations: number
}

export type WalletKind = 'v4r2'

export type LocalWallet = {
  address: string
  workchain: number
  kind: WalletKind
  encryptedSeed: EncryptedSeed
  createdAt: number
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveAesKeyFromPassword(params: {
  password: string
  salt: Uint8Array
  iterations: number
}): Promise<CryptoKey> {
  const { password, salt, iterations } = params

  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBytes(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function generateMnemonic(wordsCount = 24): Promise<string[]> {
  const mnemonic = await mnemonicNew(wordsCount)
  const ok = await mnemonicValidate(mnemonic)
  if (!ok) throw new Error('Generated mnemonic is not valid')
  return mnemonic
}

export async function deriveWalletAddressFromMnemonic(params: {
  mnemonic: string[]
  workchain: number
}): Promise<{ address: string }> {
  const { mnemonic, workchain } = params

  const keyPair = await mnemonicToWalletKey(mnemonic)
  const wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  })
  return { address: wallet.address.toString() }
}

export async function encryptSeed(params: {
  seedPhrase: string
  password: string
  iterations?: number
}): Promise<EncryptedSeed> {
  const { seedPhrase, password, iterations = 160_000 } = params

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKeyFromPassword({ password, salt, iterations })

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    toBytes(seedPhrase),
  )

  return {
    ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
    ivB64: bytesToB64(iv),
    saltB64: bytesToB64(salt),
    iterations,
  }
}

export async function decryptSeed(params: {
  encryptedSeed: EncryptedSeed
  password: string
}): Promise<string> {
  const { encryptedSeed, password } = params
  const { ciphertextB64, ivB64, saltB64, iterations } = encryptedSeed

  const iv = b64ToBytes(ivB64)
  const salt = b64ToBytes(saltB64)
  const key = await deriveAesKeyFromPassword({ password, salt, iterations })

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    b64ToBytes(ciphertextB64),
  )

  return fromBytes(new Uint8Array(plaintext))
}

export async function createLocalWalletFromMnemonic(params: {
  mnemonic: string[]
  password: string
  workchain?: number
  kind?: WalletKind
}): Promise<LocalWallet> {
  const { mnemonic, password, workchain = 0, kind = 'v4r2' } = params

  const seedPhrase = mnemonic.join(' ')
  const { address } = await deriveWalletAddressFromMnemonic({ mnemonic, workchain })
  const encryptedSeed = await encryptSeed({ seedPhrase, password })

  return {
    address,
    workchain,
    kind,
    encryptedSeed,
    createdAt: Date.now(),
  }
}

