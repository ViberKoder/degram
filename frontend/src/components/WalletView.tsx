import { useMemo, useState } from 'react'
import type { LocalWallet } from '../utils/storage'

export default function WalletView(props: {
  activeAddress: string
  tonConnected: boolean
  localWallet: LocalWallet | null
  onDisconnectTon: () => void
  onClearLocalWallet: () => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  const isLocal = props.localWallet != null && props.localWallet.address === props.activeAddress

  const accent = useMemo(() => {
    if (!isLocal) return 'hsl(180 85% 55%)'
    let h = 0
    for (let i = 0; i < props.activeAddress.length; i++) h = (h * 31 + props.activeAddress.charCodeAt(i)) % 360
    return `hsl(${h} 85% 55%)`
  }, [props.activeAddress, isLocal])

  return (
    <div className="feed" style={{ padding: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
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
              {props.tonConnected ? 'Подключено через TON Connect' : 'Локальный кошелёк (создан в Degram)'}
            </div>
          </div>
        </div>
        {props.tonConnected && (
          <button className="btn danger" onClick={props.onDisconnectTon} type="button">
            Отключить TON Connect
          </button>
        )}
      </div>

      {!isLocal ? (
        <div className="mini">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Внешний кошелёк</div>
          <div className="small muted">Адрес и подписи приходят из кошелька через TON Connect.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="mini">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Локальный кошелёк</div>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Seed показывался только при создании. В приложении и на сервере он не хранится.
            </div>
          </div>
          <div className="mini">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Сброс</div>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Удалит сохранённый адрес из браузера. Войти снова можно через seed или TON Connect с тем же адресом.
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
                  Подтвердить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
