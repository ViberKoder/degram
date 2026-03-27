import { useEffect, useMemo, useState } from 'react'
import type { WalletHoldings } from '../utils/storage'
import { getWalletHoldings } from '../services/degramApi'

function formatUsd(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1000) return `$${value.toFixed(0)}`
  if (value >= 100) return `$${value.toFixed(2)}`
  return `$${value.toFixed(4)}`
}

function formatErrorMessage(error: string | null) {
  if (!error) return 'Портфель временно недоступен.'
  if (error.includes('address_required')) return 'Нужен валидный адрес кошелька.'
  if (error.includes('holdings_failed')) return 'Не удалось получить данные сети TON.'
  if (error.includes('invalid_json_response')) return 'Сервер вернул некорректный ответ.'
  if (error.includes('Unexpected token') || error.includes('JSON.parse')) {
    return 'Сервер вернул не-JSON ответ. Попробуйте повторить чуть позже.'
  }
  return 'Не удалось загрузить портфель. Попробуйте обновить страницу.'
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

  const hasData = Boolean(holdings)
  const showEmptyState = !loading && !error && !hasData

  if (!address) return null

  return (
    <section className="portfolio-card">
      <div className="portfolio-head">
        <div className="portfolio-title">
          <b>Portfolio</b>
          <span className="portfolio-total">{formatUsd(holdings?.totalUsd ?? null)} total</span>
        </div>
        <div className="portfolio-ton">TON: {formatUsd(holdings?.ton?.balanceUsd ?? null)}</div>
      </div>

      {loading && <div className="portfolio-message muted">Загружаем активы TON…</div>}

      {error && (
        <div className="portfolio-message error">
          {formatErrorMessage(error)}
          <div className="portfolio-submessage">Профиль и посты продолжают работать даже без этого блока.</div>
        </div>
      )}

      {showEmptyState && <div className="portfolio-message muted">Пока нет данных для отображения.</div>}

      {!loading && !error && holdings && (
        <div className="portfolio-grid">
          <div className="portfolio-section">
            <div className="portfolio-label">Jettons</div>
            {topJettons.length === 0 ? (
              <div className="muted">Нет jettons</div>
            ) : (
              <div className="portfolio-list">
                {topJettons.map((j) => (
                  <div key={j.master} className="portfolio-list-item">
                    <div className="portfolio-asset-meta">
                      <b className="portfolio-asset-title">{j.symbol ?? 'JETTON'}</b>
                      <div className="muted mono portfolio-asset-value">
                        {j.amount ?? j.balance}
                      </div>
                    </div>
                    <div className="portfolio-asset-thumb">
                      {j.image ? (
                        <img src={j.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div className="portfolio-asset-fallback">
                          {j.symbol ? j.symbol.slice(0, 1).toUpperCase() : 'J'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="portfolio-section">
            <div className="portfolio-label">NFTs</div>
            {topNfts.length === 0 ? (
              <div className="muted">Нет NFT</div>
            ) : (
              <div className="portfolio-nft-grid">
                {topNfts.map((n) => (
                  <div key={n.itemAddress} className="portfolio-nft-item">
                    <div className="portfolio-nft-thumb">
                      {n.image ? (
                        <img src={n.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div className="portfolio-asset-fallback">
                          NFT
                        </div>
                      )}
                    </div>
                    <div className="portfolio-nft-title">
                      {n.collectionName ?? 'Collection'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="portfolio-section">
            <div className="portfolio-label">DNS Domains</div>
            {topDns.length === 0 ? (
              <div className="muted">Нет доменов</div>
            ) : (
              <div className="portfolio-tags">
                {topDns.map((d) => (
                  <span key={d.domain} className="portfolio-tag mono">
                    {d.domain}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

