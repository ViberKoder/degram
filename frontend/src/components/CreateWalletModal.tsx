import { useState } from 'react'
import nacl from 'tweetnacl'
import { mnemonicToWalletKey } from '@ton/crypto'
import { createLocalWalletFromMnemonic, generateMnemonic } from '../wallet/localWalletService'
import { saveLocalWallet } from '../utils/storage'
import { requestAuthChallenge, verifyAuthSession } from '../services/degramApi'
import { saveSession } from '../utils/sessionAuth'
import RevealSeedModal from './RevealSeedModal'

export default function CreateWalletModal(props: {
  onClose: () => void
  onCreated: (address: string) => void
  onSessionReady?: () => void
  onAuthError?: (message: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [createdAddress, setCreatedAddress] = useState<string | null>(null)
  const [wordsForSign, setWordsForSign] = useState<string[] | null>(null)

  const close = () => {
    props.onClose()
  }

  const startCreation = async () => {
    setError(null)
    setLoading(true)
    try {
      const words = await generateMnemonic(24)
      const localWallet = await createLocalWalletFromMnemonic({
        mnemonic: words,
        workchain: 0,
        kind: 'v4r2',
      })
      saveLocalWallet(localWallet)
      setCreatedAddress(localWallet.address)
      setWordsForSign(words)
      setSeedPhrase(words.join(' '))
    } catch (e) {
      setError((e as Error).message || 'Не удалось создать кошелёк.')
    } finally {
      setLoading(false)
    }
  }

  const finishSeed = () => {
    void (async () => {
      const addr = createdAddress
      const words = wordsForSign
      if (!addr || !words?.length) {
        setSeedPhrase(null)
        setWordsForSign(null)
        setCreatedAddress(null)
        close()
        return
      }
      try {
        const ch = await requestAuthChallenge(addr)
        const keyPair = await mnemonicToWalletKey(words)
        const pubHex = Buffer.from(keyPair.publicKey).toString('hex')
        const msg = new TextEncoder().encode(ch.message)
        const sig = nacl.sign.detached(msg, new Uint8Array(keyPair.secretKey))
        const simpleSignature = Buffer.from(sig).toString('base64')
        const { token, expiresAt } = await verifyAuthSession({
          address: addr,
          challengeId: ch.challengeId,
          publicKey: pubHex,
          simpleSignature,
        })
        saveSession({ address: addr, token, expiresAt })
        props.onSessionReady?.()
      } catch (e) {
        props.onAuthError?.(
          (e as Error).message ||
            'Кошелёк создан, но авто-вход не удался. Используйте «Войти снова» или TON Connect.',
        )
      } finally {
        setSeedPhrase(null)
        setWordsForSign(null)
        setCreatedAddress(null)
        props.onCreated(addr)
        close()
      }
    })()
  }

  if (seedPhrase && createdAddress) {
    return (
      <RevealSeedModal title="Recovery phrase (seed)" seedPhrase={seedPhrase} onClose={() => void finishSeed()} />
    )
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <h2>Создать новый TON кошелёк</h2>
          <button className="btn" onClick={close} type="button">
            Закрыть
          </button>
        </div>
        <div className="modalBody">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="small">
              Покажем seed phrase один раз. После сохранения вы сразу войдёте в Degram (подпись выполняется в браузере,
              seed на сервер не отправляется).
            </div>
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button className="btn" onClick={close} type="button">
                Отмена
              </button>
              <button className="btn primary" onClick={startCreation} type="button" disabled={loading}>
                {loading ? 'Создаём…' : 'Создать кошелёк'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
