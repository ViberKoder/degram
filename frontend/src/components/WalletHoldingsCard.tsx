import { useEffect, useMemo, useState } from 'react'
import type { WalletHoldings } from '../utils/storage'
import { getWalletHoldings } from '../services/degramApi'

function formatUsd(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `$${value.toFixed(0)}`
  if (value >= 100) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

export default function WalletHoldingsCard({ address }: { address: string }) {
  const [loading, setLoading] = useState(false)
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setHoldings(null)

    ;(async () => {
      try {
        const h = await getWalletHoldings({ address })
        if (!cancelled) setHoldings(h)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load holdings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [address])

  const topJettons = useMemo(() => {
    return holdings?.jettons?.slice(0, 6) ?? []
  }, [holdings])

  const topNfts = useMemo(() => {
    return holdings?.nfts?.slice(0, 6) ?? []
  }, [holdings])

  const topDns = useMemo(() => {
    return holdings?.dns?.slice(0, 8) ?? []
  }, [holdings])

  if (!address) return null

  return (
    <div className="mini" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div>
          <b>Portfolio</b>
          <div className="muted mono" style={{ marginTop: 6, fontSize: 12 }}>
            {formatUsd(holdings?.totalUsd ?? null)} total
          </div>
        </div>
        <div className="muted mono" style={{ fontSize: 12, textAlign: 'right' }}>
          TON: {formatUsd(holdings?.ton?.balanceUsd ?? null)}
        </div>
      </div>

      {loading && <div className="muted" style={{ marginTop: 12 }}>Загрузка владений…</div>}
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!loading && !error && holdings && (
        <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
          <div>
            <div className="muted mono" style={{ marginBottom: 8, fontSize: 12 }}>
              Jettons
            </div>
            {topJettons.length === 0 ? (
              <div className="muted">Нет jettons.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {topJettons.map((j) => (
                  <div key={j.master} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {j.symbol ?? 'JETTON'}
                      </b>
                      <div className="muted mono" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {j.amount ?? j.balance}
                      </div>
                    </div>
                    <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                      {j.image ? (
                        <img src={j.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>
                          {j.symbol ? j.symbol.slice(0, 1).toUpperCase() : 'J'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="muted mono" style={{ marginBottom: 8, fontSize: 12 }}>
              NFTs
            </div>
            {topNfts.length === 0 ? (
              <div className="muted">Нет NFT.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {topNfts.map((n) => (
                  <div key={n.itemAddress} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 8, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      {n.image ? (
                        <img src={n.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>
                          NFT
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.collectionName ?? 'Collection'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="muted mono" style={{ marginBottom: 8, fontSize: 12 }}>
              DNS domains
            </div>
            {topDns.length === 0 ? (
              <div className="muted">Нет доменов.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topDns.map((d) => (
                  <span key={d.domain} className="mono muted" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}>
                    {d.domain}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

