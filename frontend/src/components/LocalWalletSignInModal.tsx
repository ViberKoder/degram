import { useState } from 'react'
import nacl from 'tweetnacl'
import { mnemonicToWalletKey } from '@ton/crypto'
import { requestAuthChallenge, verifyAuthSession } from '../services/degramApi'
import { saveSession } from '../utils/sessionAuth'

export default function LocalWalletSignInModal(props: {
  address: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [mnemonic, setMnemonic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    const words = mnemonic.trim().split(/\s+/).filter(Boolean)
    if (words.length < 12) {
      setError('Нужно минимум 12 слов.')
      return
    }
    setBusy(true)
    try {
      const ch = await requestAuthChallenge(props.address)
      const keyPair = await mnemonicToWalletKey(words)
      const pubHex = Buffer.from(keyPair.publicKey).toString('hex')
      const msg = new TextEncoder().encode(ch.message)
      const sig = nacl.sign.detached(msg, new Uint8Array(keyPair.secretKey))
      const simpleSignature = Buffer.from(sig).toString('base64')
      const { token, expiresAt } = await verifyAuthSession({
        address: props.address,
        challengeId: ch.challengeId,
        publicKey: pubHex,
        simpleSignature,
      })
      saveSession({ address: props.address, token, expiresAt })
      setMnemonic('')
      props.onSuccess()
      props.onClose()
    } catch (e) {
      setError((e as Error).message || 'Не удалось войти')
    } finally {
      setBusy(false)
      setMnemonic('')
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <h2>Вход локального кошелька</h2>
          <button className="btn" onClick={props.onClose} type="button">
            Закрыть
          </button>
        </div>
        <div className="modalBody">
          <div className="small" style={{ lineHeight: 1.5 }}>
            Сессия истекла. Введите seed только если доверяете этому сайту. Либо импортируйте кошелёк в Tonkeeper и
            подключите через TON Connect.
          </div>
          {error && <div className="error">{error}</div>}
          <textarea
            className="mono"
            style={{ minHeight: 100, width: '100%', padding: 10 }}
            placeholder="24 слова…"
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="row">
            <button className="btn" onClick={props.onClose} type="button">
              Отмена
            </button>
            <button className="btn primary" onClick={() => void submit()} type="button" disabled={busy}>
              {busy ? '…' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
