import { useState } from 'react'
import { mnemonicToWalletKey } from '@ton/crypto'
import nacl from 'tweetnacl'
import { verifyAuthSession } from '../services/degramApi'
import { saveSession } from '../utils/sessionAuth'

export default function LocalWalletSignInModal(props: {
  address: string
  challengeId: string
  message: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const words = mnemonic.trim().split(/\s+/).filter(Boolean)
      if (words.length < 12) {
        setError('Нужно минимум 12 слов seed phrase.')
        return
      }
      const keyPair = await mnemonicToWalletKey(words)
      const pubHex = Buffer.from(keyPair.publicKey).toString('hex')
      const msg = new TextEncoder().encode(props.message)
      const sig = nacl.sign.detached(msg, new Uint8Array(keyPair.secretKey))
      const simpleSignature = Buffer.from(sig).toString('base64')
      const { token, expiresAt } = await verifyAuthSession({
        address: props.address,
        challengeId: props.challengeId,
        publicKey: pubHex,
        simpleSignature,
      })
      saveSession({ address: props.address, token, expiresAt })
      props.onSuccess()
      props.onClose()
    } catch (e) {
      setError((e as Error).message || 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <h2>Вход по seed phrase</h2>
          <button className="btn" onClick={props.onClose} type="button">
            Закрыть
          </button>
        </div>
        <div className="modalBody">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="small">
              Фраза используется только в браузере для одной подписи и не сохраняется. Убедись, что никто не видит
              экран.
            </div>
            {error && <div className="error">{error}</div>}
            <textarea
              className="mono"
              style={{ minHeight: 100, width: '100%', padding: 10 }}
              placeholder="24 слова…"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              autoComplete="off"
            />
            <div className="row">
              <button className="btn" onClick={props.onClose} type="button">
                Отмена
              </button>
              <button className="btn primary" onClick={() => void submit()} type="button" disabled={busy}>
                {busy ? '…' : 'Подписать и войти'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
