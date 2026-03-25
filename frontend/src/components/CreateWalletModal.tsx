import { useState } from 'react'
import { createLocalWalletFromMnemonic, generateMnemonic } from '../wallet/localWalletService'
import { saveLocalWallet } from '../utils/storage'

export default function CreateWalletModal(props: { onClose: () => void; onCreated: (address: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      props.onCreated(localWallet.address)
      close()
    } catch (e) {
      setError((e as Error).message || 'Не удалось создать кошелёк.')
    } finally {
      setLoading(false)
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
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="small">
              Fast mode: seed хранится локально в браузере без пароля.
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

