import { mnemonicNew, mnemonicToWalletKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV4 } from '@ton/ton'

export type WalletKind = 'v4r2'

export type LocalWallet = {
  address: string
  workchain: number
  kind: WalletKind
  createdAt: number
}

export async function generateMnemonic(wordsCount = 24): Promise<string[]> {
  const mnemonic = await mnemonicNew(wordsCount)
  const ok = await mnemonicValidate(mnemonic)
  if (!ok) throw new Error('Generated mnemonic is not valid')
  return mnemonic
}

export async function createLocalWalletFromMnemonic(params: {
  mnemonic: string[]
  workchain?: number
  kind?: WalletKind
}): Promise<LocalWallet> {
  const { mnemonic, workchain = 0, kind = 'v4r2' } = params
  const keyPair = await mnemonicToWalletKey(mnemonic)
  const wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  })
  const address = wallet.address.toString({ urlSafe: true, bounceable: false })
  return {
    address,
    workchain,
    kind,
    createdAt: Date.now(),
  }
}
