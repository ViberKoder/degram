import { useMemo, useState } from 'react'
import { decryptSeed } from '../wallet/localWalletService'

type EncryptedSeed = {
  ciphertextB64: string
  ivB64: string
  saltB64: string
  iterations: number
}

export default function RevealSeedModal(props: {
  title?: string
  encryptedSeed: EncryptedSeed
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [seedPhrase, setSeedPhrase] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)

  const words = useMemo(() => seedPhrase ?? [], [seedPhrase])

  const reveal = async () => {
    setError(null)
    setLoading(true)
    try {
      const seedText = await decryptSeed({ encryptedSeed: props.encryptedSeed, password })
      const words = seedText.trim().split(/\s+/).filter(Boolean)
      if (words.length < 12) throw new Error('Seed-фраза выглядит неверно.')
      setSeedPhrase(words)
    } catch (e) {
      setError((e as Error).message || 'Не удалось расшифровать seed. Проверь пароль.')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    try {
      const text = words.join(' ')
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <h2>{props.title ?? 'Recovery phrase'}</h2>
          <button className="btn" onClick={props.onClose} type="button">
            Закрыть
          </button>
        </div>
        <div className="modalBody">
          {seedPhrase == null ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="small">
                Для расшифровки seed нужен пароль, которым она шифровалась при создании кошелька.
              </div>
              <div className="field">
                <label>Пароль</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Введите пароль"
                />
              </div>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" onClick={props.onClose} type="button">
                  Отмена
                </button>
                <button className="btn primary" onClick={reveal} type="button" disabled={loading || password.length < 1}>
                  {loading ? 'Расшифровка…' : 'Показать seed'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="seedGrid mono">
                {words.map((w, i) => (
                  <div key={i} className="seedWord">
                    {i + 1}. {w}
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn" onClick={copy} type="button">
                  Скопировать
                </button>
                <button className="btn primary" onClick={props.onClose} type="button">
                  Готово
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

