import { useMemo } from 'react'

export default function RevealSeedModal(props: {
  title?: string
  seedPhrase: string
  onClose: () => void
}) {
  const words = useMemo(
    () => props.seedPhrase.trim().split(/\s+/).filter(Boolean),
    [props.seedPhrase],
  )

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
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="small">
              Seed phrase показывается один раз и не хранится у нас. Не отправляй ее никому, включая поддержку.
            </div>
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
        </div>
      </div>
    </div>
  )
}

