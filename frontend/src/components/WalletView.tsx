import { useMemo } from 'react'

export default function WalletView(props: { activeAddress: string; onDisconnectTon: () => void }) {
  const accent = useMemo(() => {
    let h = 0
    for (let i = 0; i < props.activeAddress.length; i++) h = (h * 31 + props.activeAddress.charCodeAt(i)) % 360
    return `hsl(${h} 85% 55%)`
  }, [props.activeAddress])

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
              Подключено через TON Connect
            </div>
          </div>
        </div>
        <button className="btn danger" onClick={props.onDisconnectTon} type="button">
          Отключить TON Connect
        </button>
      </div>
    </div>
  )
}
