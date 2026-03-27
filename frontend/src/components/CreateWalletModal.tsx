import { useState } from 'react'
import { createLocalWalletFromMnemonic, generateMnemonic } from '../wallet/localWalletService'
import { saveLocalWallet } from '../utils/storage'
import RevealSeedModal from './RevealSeedModal'

export default function CreateWalletModal(props: { onClose: () => void; onCreated: (address: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [createdAddress, setCreatedAddress] = useState<string | null>(null)

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
      // Show seed phrase exactly once and do not persist it anywhere.
      setSeedPhrase(words.join(' '))
    } catch (e) {
      setError((e as Error).message || 'Не удалось создать кошелёк.')
    } finally {
      setLoading(false)
    }
  }

  const finishSeed = () => {
    if (createdAddress) props.onCreated(createdAddress)
    setSeedPhrase(null)
    setCreatedAddress(null)
    close()
  }

  if (seedPhrase && createdAddress) {
    return (
      <RevealSeedModal
        title="Recovery phrase (seed)"
        seedPhrase={seedPhrase}
        onClose={finishSeed}
      />
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
              Мы покажем seed phrase один раз. Сохрани ее офлайн: без нее кошелек невозможно восстановить.
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

