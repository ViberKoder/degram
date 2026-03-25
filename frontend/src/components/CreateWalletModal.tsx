import { useMemo, useState } from 'react'
import { createLocalWalletFromMnemonic, generateMnemonic } from '../wallet/localWalletService'
import { saveLocalWallet } from '../utils/storage'

type Step = 'password' | 'show' | 'confirm'

export default function CreateWalletModal(props: { onClose: () => void; onCreated: (address: string) => void }) {
  const [step, setStep] = useState<Step>('password')
  const [password1, setPassword1] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [mnemonic, setMnemonic] = useState<string[] | null>(null)
  const [ackSaved, setAckSaved] = useState(false)

  const [expectedWords, setExpectedWords] = useState<string[]>([])
  const [confirmInputs, setConfirmInputs] = useState<string[]>(['', '', ''])

  const canContinue = useMemo(() => {
    if (step === 'password') return password1.length >= 8 && password1 === password2
    if (step === 'show') return ackSaved
    if (step === 'confirm') return confirmInputs.every((v) => v.trim().length > 0)
    return false
  }, [step, password1, password2, ackSaved, confirmInputs])

  const close = () => {
    props.onClose()
  }

  const startCreation = async () => {
    setError(null)
    if (password1.length < 8) {
      setError('Пароль должен быть минимум 8 символов.')
      return
    }
    if (password1 !== password2) {
      setError('Пароли не совпадают.')
      return
    }

    try {
      const words = await generateMnemonic(24)
      setMnemonic(words)

      // Pick 3 random distinct indices to confirm
      const indices = new Set<number>()
      while (indices.size < 3) indices.add(Math.floor(Math.random() * words.length))
      const idx = Array.from(indices)
      setExpectedWords(idx.map((i) => words[i].toLowerCase()))

      setConfirmInputs(['', '', ''])
      setAckSaved(false)
      setStep('show')
    } catch (e) {
      setError((e as Error).message || 'Не удалось создать кошелёк.')
    }
  }

  const confirm = async () => {
    if (!mnemonic) return
    setError(null)

    const inputsNormalized = confirmInputs.map((v) => v.trim().toLowerCase())
    const ok = inputsNormalized.length === 3 && inputsNormalized.every((v, i) => v === expectedWords[i])
    if (!ok) {
      setError('Введённые слова не совпадают. Попробуй ещё раз.')
      return
    }

    try {
      const localWallet = await createLocalWalletFromMnemonic({
        mnemonic,
        password: password1,
        workchain: 0,
        kind: 'v4r2',
      })
      saveLocalWallet(localWallet)
      props.onCreated(localWallet.address)
      close()
    } catch (e) {
      setError((e as Error).message || 'Не удалось сохранить локальный кошелёк.')
    }
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
          {step === 'password' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="small">
                Это self-custody. Seed-фраза будет зашифрована паролем в твоём браузере.
              </div>
              <div className="field">
                <label>Пароль для шифрования seed</label>
                <input
                  value={password1}
                  onChange={(e) => setPassword1(e.target.value)}
                  type="password"
                  placeholder="Минимум 8 символов"
                />
              </div>
              <div className="field">
                <label>Повтори пароль</label>
                <input
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  type="password"
                  placeholder="Повтор пароля"
                />
              </div>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" onClick={close} type="button">
                  Отмена
                </button>
                <button className="btn primary" onClick={startCreation} type="button" disabled={!canContinue}>
                  Создать кошелёк
                </button>
              </div>
            </div>
          )}

          {step === 'show' && mnemonic && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="small">
                Сохрани seed-фразу. Ни при каких обстоятельствах не отправляй её никому.
              </div>
              <div className="seedGrid mono">
                {mnemonic.map((w, i) => (
                  <div key={i} className="seedWord">
                    {i + 1}. {w}
                  </div>
                ))}
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={ackSaved}
                    onChange={(e) => setAckSaved(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Я сохранил(а) seed-фразу
                </label>
              </div>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" onClick={close} type="button">
                  Отмена
                </button>
                <button
                  className="btn primary"
                  onClick={() => setStep('confirm')}
                  type="button"
                  disabled={!canContinue}
                >
                  Подтвердить
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="small">
                Подтверди, что сохранил(а) seed: введи 3 слова из фразы (слова заданы случайно).
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <div className="field" key={i}>
                    <label>Слово #{i + 1}</label>
                    <input
                      value={confirmInputs[i]}
                      onChange={(e) => {
                        const next = [...confirmInputs]
                        next[i] = e.target.value
                        setConfirmInputs(next)
                      }}
                      placeholder="Введите слово"
                    />
                  </div>
                ))}
              </div>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" onClick={() => setStep('show')} type="button">
                  Назад
                </button>
                <button className="btn primary" onClick={confirm} type="button" disabled={!canContinue}>
                  Завершить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

