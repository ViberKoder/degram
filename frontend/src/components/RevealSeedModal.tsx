import { useMemo } from 'react'

export default function RevealSeedModal(props: {
  title: string
  seedPhrase: string
  onClose: () => void
}) {
  const words = useMemo(
    () => props.seedPhrase.trim().split(/\s+/).filter(Boolean),
    [props.seedPhrase],
  )

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <h2>{props.title}</h2>
          <button className="btn" onClick={props.onClose} type="button">
            Я сохранил фразу
          </button>
        </div>
        <div className="modalBody">
          <div className="small muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
            Запишите фразу офлайн. Без неё доступ к кошельку невозможен. Не передавайте её никому.
          </div>
          <div className="seedGrid mono">
            {words.map((w, i) => (
              <div key={i} className="seedWord">
                <span className="muted">{i + 1}</span> {w}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
