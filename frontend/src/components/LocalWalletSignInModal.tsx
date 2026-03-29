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
  const [riskAccepted, setRiskAccepted] = useState(false)

  const submit = async () => {
    setError(null)
    if (!riskAccepted) {
      setError('Подтвердите, что понимаете риски, чтобы продолжить.')
      return
    }
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
          <h2>Вход по seed phrase</h2>
          <button className="btn" onClick={props.onClose} type="button">
            Закрыть
          </button>
        </div>
        <div className="modalBody">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="small" style={{ lineHeight: 1.5 }}>
              <strong>Важно.</strong> Ввод seed phrase в любом сайте несёт риск кражи средств (фишинг, вредоносные
              расширения, XSS). Предпочтительно войти через TonConnect (кошелёк подписывает сообщение сам). Используйте
              seed только если понимаете риск и доверяете этому домену.
            </div>
            <label className="small" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={riskAccepted}
                onChange={(e) => setRiskAccepted(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>Я понимаю риски и ввожу seed только на официальном сайте Degram.</span>
            </label>
            {error && <div className="error">{error}</div>}
            <textarea
              className="mono"
              style={{ minHeight: 100, width: '100%', padding: 10 }}
              placeholder="24 слова…"
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
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
