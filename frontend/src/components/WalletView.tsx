import { useMemo, useState } from 'react'
import type { LocalWallet } from '../utils/storage'
import RevealSeedModal from './RevealSeedModal'

export default function WalletView(props: {
  activeAddress: string
  tonConnected: boolean
  localWallet: LocalWallet | null
  onDisconnectTon: () => void
  onClearLocalWallet: () => void
}) {
  const [showSeed, setShowSeed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const isLocal = props.localWallet != null && props.localWallet.address === props.activeAddress

  const accent = useMemo(() => {
    if (!isLocal) return 'hsl(180 85% 55%)'
    // stable-ish color based on address hash
    let h = 0
    for (let i = 0; i < props.activeAddress.length; i++) h = (h * 31 + props.activeAddress.charCodeAt(i)) % 360
    return `hsl(${h} 85% 55%)`
  }, [props.activeAddress, isLocal])

  return (
    <div className="feed" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="avatar" style={{ background: `linear-gradient(135deg, ${accent}, rgba(255,255,255,0.08))` }}>
            W
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 950 }}>Wallet</div>
            <div className="muted mono" style={{ fontSize: 13, marginTop: 2 }}>
              {props.activeAddress}
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              {props.tonConnected ? 'Подключено через TON Connect' : 'Локальный self-custody кошелёк'}
            </div>
          </div>
        </div>
        {props.tonConnected && (
          <button className="btn danger" onClick={props.onDisconnectTon} type="button">
            Отключить TON Connect
          </button>
        )}
      </div>

      <div style={{ height: 12 }} />

      {!isLocal ? (
        <div className="mini">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Seed недоступен</div>
          <div className="small muted">
            Этот кошелёк подключен извне через TON Connect. Для seed-фразы нужен локальный self-custody кошелёк.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="mini">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Recovery phrase</div>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Fast mode: seed хранится локально в этом браузере без пароля (unencrypted).
            </div>
            <button
              className="btn primary"
              onClick={() => setShowSeed(true)}
              type="button"
              disabled={props.localWallet?.seedPhrase == null}
            >
              Показать seed
            </button>
          </div>

          <div className="mini">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Опасные действия</div>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Сброс удалит локальный seed из браузера. История постов, привязанных к этому адресу, останется в MVP-локальном хранилище.
            </div>
            {!confirmClear ? (
              <button className="btn danger" onClick={() => setConfirmClear(true)} type="button">
                Сбросить локальный кошелёк
              </button>
            ) : (
              <div className="row">
                <button className="btn" onClick={() => setConfirmClear(false)} type="button">
                  Отмена
                </button>
                <button className="btn danger" onClick={props.onClearLocalWallet} type="button">
                  Подтвердить сброс
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSeed && props.localWallet && (
        <RevealSeedModal
          title="Recovery phrase (seed)"
          seedPhrase={props.localWallet.seedPhrase ?? ''}
          onClose={() => setShowSeed(false)}
        />
      )}
    </div>
  )
}

