import type { Post } from '../utils/storage'

type Props = {
  post: Post
  accent: string
  timeLabel: string
  viewerAddress: string
  /** Whether the post author is the logged-in user */
  isSelf: boolean
  onOpenProfile: (handle: string, address: string) => void
  onReply: (post: Post) => void
  onToggleLike: (post: Post) => void
  likeBusy?: boolean
}

export default function PostCard({
  post,
  accent,
  timeLabel,
  viewerAddress,
  isSelf,
  onOpenProfile,
  onReply,
  onToggleLike,
  likeBusy,
}: Props) {
  const initials = post.authorHandle.slice(0, 1).toUpperCase()
  const likes = post.likesCount ?? 0
  const replies = post.repliesCount ?? 0
  const liked = Boolean(post.likedByViewer)

  return (
    <article className="card post-card">
      <div className="post-head">
        <button
          type="button"
          className="post-author post-author-btn"
          onClick={() => onOpenProfile(post.authorHandle, post.authorAddress)}
        >
          <div className="avatar" style={{ background: accent }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <b>@{post.authorHandle}</b>
            <div>
              <span className="mono">{post.authorAddress.slice(0, 6)}…{post.authorAddress.slice(-4)}</span>
            </div>
          </div>
        </button>
        <div className="post-time">{timeLabel}</div>
      </div>

      {post.replyTo && (
        <div className="reply-context">
          <span className="reply-context-label">Ответ для @{post.replyTo.authorHandle}</span>
          <div className="reply-context-preview">{post.replyTo.contentPreview}</div>
        </div>
      )}

      <div className="post-content">{post.content}</div>

      <div className="post-actions">
        <button
          type="button"
          className={`post-action ${liked ? 'active' : ''}`}
          onClick={() => onToggleLike(post)}
          disabled={likeBusy || !viewerAddress}
          title={liked ? 'Убрать лайк' : 'Нравится'}
        >
          <span className="post-action-icon" aria-hidden>
            {liked ? '♥' : '♡'}
          </span>
          <span>Like</span>
          <span className="mono">{likes}</span>
        </button>
        <button type="button" className="post-action" onClick={() => onReply(post)} title="Ответить">
          <span className="post-action-icon" aria-hidden>
            ↩
          </span>
          <span>Reply</span>
          <span className="mono">{replies}</span>
        </button>
        {isSelf && <span className="post-action muted-inline">Ваш пост</span>}
      </div>
    </article>
  )
}
