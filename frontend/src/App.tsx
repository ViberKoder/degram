import { useEffect, useMemo, useState } from 'react'
import {
  TonConnectButton,
  TonConnectUIProvider,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react'
import {
  Account,
  LocalWallet,
  Post,
  hashToHsl,
  isValidHandle,
  loadAccounts,
  loadLocalWallet,
  loadPosts,
  clearLocalWallet,
  normalizeHandle,
  saveAccounts,
  savePosts,
} from './utils/storage'
import './styles/index.css'
import CreateWalletModal from './components/CreateWalletModal'
import WalletView from './components/WalletView'

function formatAddress(addr: string) {
  if (!addr) return ''
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function nowTimeLabel(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`
  return new Date(ts).toLocaleDateString()
}

function useActiveAccount(accounts: Record<string, Account>, address: string) {
  return address ? accounts[address] ?? null : null
}

function InnerApp() {
  const tonAddress = useTonAddress(true)
  const [tonConnectUI] = useTonConnectUI()

  const [accounts, setAccountsState] = useState<Record<string, Account>>({})
  const [posts, setPostsState] = useState<Post[]>([])
  const [view, setView] = useState<'feed' | 'profile' | 'explore' | 'wallet'>('feed')
  const [localWallet, setLocalWallet] = useState<LocalWallet | null>(() => loadLocalWallet())

  const tonConnected = tonAddress.trim().length > 0
  const activeAddress = tonConnected ? tonAddress : localWallet?.address ?? ''

  const activeAccount = useActiveAccount(accounts, activeAddress)

  const [showCreateWalletModal, setShowCreateWalletModal] = useState(false)

  useEffect(() => {
    // For MVP all state is kept locally in the browser.
    setAccountsState(loadAccounts())
    setPostsState(loadPosts())
    setLocalWallet(loadLocalWallet())
  }, [])

  useEffect(() => {
    if (!activeAddress) setView('feed')
  }, [activeAddress])

  const accountHandleToColor = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of Object.values(accounts)) map[a.handle] = a.avatarColor
    return map
  }, [accounts])

  const handleDisconnectTon = async () => {
    await tonConnectUI.disconnect()
  }

  const handleClearLocalWallet = () => {
    clearLocalWallet()
    setLocalWallet(null)
    setView('feed')
  }

  const handleAuthDisconnect = async () => {
    if (tonConnected) {
      await handleDisconnectTon()
    } else {
      handleClearLocalWallet()
    }
  }

  const upsertAccount = (acc: Account) => {
    const next = { ...accounts, [acc.address]: acc }
    setAccountsState(next)
    saveAccounts(next)
  }

  const createPost = (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    if (!activeAddress) return
    const authorHandle = activeAccount?.handle ?? 'unknown'
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`
    const post: Post = {
      id,
      authorAddress: activeAddress,
      authorHandle,
      content: trimmed,
      createdAt: Date.now(),
    }
    const nextPosts = [post, ...posts]
    setPostsState(nextPosts)
    savePosts(nextPosts)
  }

  const deleteLocalPosts = () => {
    setPostsState([])
    savePosts([])
  }

  const [regHandle, setRegHandle] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regError, setRegError] = useState<string | null>(null)

  const submitRegistration = () => {
    if (!activeAddress) return
    setRegError(null)

    const handle = normalizeHandle(regHandle)
    if (!isValidHandle(handle)) {
      setRegError('Имя пользователя: 3-20 символов, только `a-z`, `0-9`, `_`.')
      return
    }

    const displayName = regDisplayName.trim() || handle

    const handleTaken = Object.values(accounts).some((a) => a.handle === handle)
    if (handleTaken) {
      setRegError('Это имя пользователя уже занято в этом браузере.')
      return
    }

    const acc: Account = {
      address: activeAddress,
      handle,
      displayName,
      avatarColor: hashToHsl(handle),
      createdAt: Date.now(),
    }
    upsertAccount(acc)
  }

  const trending = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of posts) counts[p.authorHandle] = (counts[p.authorHandle] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([handle, count]) => ({ handle, count }))
  }, [posts])

  if (!activeAddress) {
    return (
      <div className="container">
        <div style={{ paddingTop: 48, paddingBottom: 24, display: 'grid', gap: 18 }}>
          <div className="panel" style={{ padding: 18 }}>
            <div className="auth-title">Добро пожаловать в Degram</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Подключи TON-кошелёк через <span className="mono">TON Connect</span> — и создай аккаунт
              прямо по адресу кошелька. (История и лента в MVP пока хранятся локально.)
            </div>
            <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <TonConnectButton />
              </div>
              <button
                className="btn primary"
                onClick={() => setShowCreateWalletModal(true)}
                type="button"
              >
                Создать новый кошелёк (self-custody)
              </button>
            </div>
          </div>
        </div>
        {showCreateWalletModal && (
          <CreateWalletModal
            onClose={() => setShowCreateWalletModal(false)}
            onCreated={() => setLocalWallet(loadLocalWallet())}
          />
        )}
      </div>
    )
  }

  if (activeAddress && !activeAccount) {
    return (
      <div className="container">
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="auth-wrap">
            <div>
              <div className="auth-title">Создай аккаунт</div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                Ты подключил кошелёк <span className="mono">{formatAddress(activeAddress)}</span>. Заполни
                @handle — и ты появишься в соцсети.
              </div>
            </div>

            <div className="field">
              <label>Имя пользователя (@handle)</label>
              <input
                value={regHandle}
                onChange={(e) => setRegHandle(e.target.value)}
                placeholder="@viber_koder"
              />
            </div>

            <div className="field">
              <label>Отображаемое имя</label>
              <input
                value={regDisplayName}
                onChange={(e) => setRegDisplayName(e.target.value)}
                placeholder="ViberKoder"
              />
            </div>

            {regError && <div className="error">{regError}</div>}

            <div className="row">
              <button className="btn danger" onClick={handleAuthDisconnect} type="button">
                Отключить кошелёк
              </button>
              <button
                className="btn primary"
                onClick={submitRegistration}
                type="button"
                disabled={!regHandle.trim()}
              >
                Создать аккаунт
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const myPosts = posts.filter((p) => p.authorAddress === activeAddress)

  return (
    <div>
      <div className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-title">
              Degram
              <small className="mono">TON social MVP</small>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 850, lineHeight: 1.1 }}>
                @{activeAccount!.handle}
              </div>
              <div className="muted mono" style={{ fontSize: 12 }}>
                {formatAddress(activeAddress)}
              </div>
            </div>
            <button className="btn" onClick={handleAuthDisconnect} type="button">
              Отключить
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="layout">
          <aside className="panel nav">
            <h3>Навигация</h3>
            <button
              className={view === 'feed' ? 'active' : ''}
              onClick={() => setView('feed')}
              type="button"
            >
              <span>Лента</span>
              <span className="muted mono">{posts.length}</span>
            </button>
            <button
              className={view === 'explore' ? 'active' : ''}
              onClick={() => setView('explore')}
              type="button"
            >
              <span>Рекомендации</span>
              <span className="muted mono">TOP</span>
            </button>
            <button
              className={view === 'profile' ? 'active' : ''}
              onClick={() => setView('profile')}
              type="button"
            >
              <span>Профиль</span>
              <span className="muted mono">{myPosts.length}</span>
            </button>
            <button
              className={view === 'wallet' ? 'active' : ''}
              onClick={() => setView('wallet')}
              type="button"
            >
              <span>Wallet</span>
              <span className="muted mono">{tonConnected ? 'TON' : 'local'}</span>
            </button>
          </aside>

          <main className="panel main">
            {view !== 'profile' && view !== 'wallet' && (
              <div className="composer">
                <div className="row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      className="avatar"
                      style={{
                        background: `linear-gradient(135deg, ${activeAccount!.avatarColor}, rgba(255,255,255,0.08))`,
                      }}
                    >
                      @{activeAccount!.handle.slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900 }}>{activeAccount!.displayName}</div>
                      <div className="muted mono" style={{ fontSize: 13 }}>
                        @{activeAccount!.handle}
                      </div>
                    </div>
                  </div>
                  <button className="btn" onClick={deleteLocalPosts} type="button">
                    Очистить ленту
                  </button>
                </div>
                <Composer onSubmit={createPost} />
              </div>
            )}

            {view === 'wallet' ? (
              <WalletView
                activeAddress={activeAddress}
                tonConnected={tonConnected}
                localWallet={localWallet}
                onDisconnectTon={handleDisconnectTon}
                onClearLocalWallet={handleClearLocalWallet}
              />
            ) : view === 'profile' ? (
              <div className="feed">
                <div style={{ padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 950 }}>{activeAccount!.displayName}</div>
                      <div className="muted mono">@{activeAccount!.handle}</div>
                    </div>
                    <div className="mono muted">posts: {myPosts.length}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8 }} />
                {myPosts.length === 0 ? (
                  <EmptyState text="Пока нет постов. Создай первый в «Ленте»." />
                ) : (
                  <div>
                    {myPosts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        accent={accountHandleToColor[p.authorHandle] ?? 'hsl(180 85% 55%)'}
                        timeLabel={nowTimeLabel(p.createdAt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="feed">
                {posts.length === 0 ? (
                  <EmptyState text="Пока пусто. Напиши пост и заполни ленту." />
                ) : (
                  <div>
                    {view === 'explore' && (
                      <div className="side" style={{ padding: 0, marginBottom: 8 }}>
                        <h3 style={{ margin: 0, padding: 12 }}>Рекомендуемые</h3>
                        <div className="mini">
                          <div className="mono muted" style={{ marginBottom: 8 }}>
                            Самые активные аккаунты (в этом браузере)
                          </div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {trending.map((t) => (
                              <div key={t.handle} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <b>@{t.handle}</b>
                                <span className="muted mono">{t.count}</span>
                              </div>
                            ))}
                            {trending.length === 0 && <div className="muted">Пока нет данных.</div>}
                          </div>
                        </div>
                      </div>
                    )}
                    {posts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        accent={accountHandleToColor[p.authorHandle] ?? 'hsl(180 85% 55%)'}
                        timeLabel={nowTimeLabel(p.createdAt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>

          <aside className="panel side">
            <h3>Сейчас в тренде</h3>
            <div className="mini">
              {trending.length === 0 ? (
                <div className="muted">Нет постов, чтобы посчитать тренды.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {trending.slice(0, 5).map((t) => (
                    <div key={t.handle} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <b>@{t.handle}</b>
                      <span className="muted mono">{t.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mini">
              <div className="muted" style={{ lineHeight: 1.5 }}>
                MVP пока без backend: все данные в <span className="mono">localStorage</span>.
                Дальше добавим сеть/контент-слой/децентрализацию + TON DNS.
              </div>
            </div>
            <div className="mini mono muted">
              UX идея: регистрация через TON Connect, без транзакции на каждое действие.
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 950, fontSize: 16 }}>{text}</div>
      <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
        Это демо. Когда подключим сеть и ончейн-часть, сюда добавим feed-агрегацию и верификацию.
      </div>
    </div>
  )
}

function Composer({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [content, setContent] = useState('')

  return (
    <>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что нового? Пиши как в X/Twitter…"
      />
      <div className="row">
        <div className="muted mono" style={{ fontSize: 12 }}>
          {content.trim().length}/500
        </div>
        <button
          className="btn primary"
          onClick={() => {
            onSubmit(content.slice(0, 500))
            setContent('')
          }}
          type="button"
          disabled={content.trim().length === 0}
        >
          Опубликовать
        </button>
      </div>
    </>
  )
}

function PostCard({ post, accent, timeLabel }: { post: Post; accent: string; timeLabel: string }) {
  const initials = post.authorHandle.slice(0, 1).toUpperCase()
  return (
    <div className="card">
      <div className="post-head">
        <div className="post-author">
          <div className="avatar" style={{ background: accent }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <b>@{post.authorHandle}</b>
            <div>
              <span className="mono">{post.authorAddress.slice(0, 4)}…</span>
            </div>
          </div>
        </div>
        <div className="post-time">{timeLabel}</div>
      </div>
      <div className="post-content">{post.content}</div>
    </div>
  )
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}>
      <InnerApp />
    </TonConnectUIProvider>
  )
}

