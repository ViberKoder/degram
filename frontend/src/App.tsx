import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TonConnectButton,
  TonConnectUIProvider,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react'
import {
  Account,
  AccountStats,
  LocalWallet,
  Post,
  hashToHsl,
  isValidHandle,
  loadLocalWallet,
  clearLocalWallet,
  normalizeHandle,
} from './utils/storage'
import './styles/index.css'
import CreateWalletModal from './components/CreateWalletModal'
import WalletView from './components/WalletView'
import PostCard from './components/PostCard'
import WalletHoldingsCard from './components/WalletHoldingsCard'
import {
  createPost as apiCreatePost,
  follow,
  getAccountByAddress,
  getAccountByHandle,
  getAccountStats,
  getFeed,
  getFollowStatus,
  getHomeFeed,
  getPostsByAddress,
  getRecommended,
  likePost,
  requestAuthChallenge,
  unlikePost,
  unfollow,
  upsertAccount,
  verifyAuthSession,
} from './services/degramApi'
import {
  clearSession,
  loadSession,
  saveSession,
  sessionMatchesAddress,
} from './utils/sessionAuth'
import LocalWalletSignInModal from './components/LocalWalletSignInModal'

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

function InnerApp() {
  const tonAddress = useTonAddress(true)
  const [tonConnectUI] = useTonConnectUI()

  const [activeAccount, setActiveAccount] = useState<Account | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedLoadingMore, setFeedLoadingMore] = useState(false)
  const [feedMode, setFeedMode] = useState<'home' | 'explore'>('home')

  const [recommended, setRecommended] = useState<Array<{ handle: string; count: number }>>([])
  const [accountLoaded, setAccountLoaded] = useState(false)
  const [view, setView] = useState<'feed' | 'profile' | 'user' | 'wallet'>('feed')
  const [localWallet, setLocalWallet] = useState<LocalWallet | null>(() => loadLocalWallet())

  const [myProfilePosts, setMyProfilePosts] = useState<Post[]>([])
  const [viewingUserHandle, setViewingUserHandle] = useState<string | null>(null)
  const [userAccount, setUserAccount] = useState<Account | null>(null)
  const [userStats, setUserStats] = useState<AccountStats | null>(null)
  const [userPosts, setUserPosts] = useState<Post[]>([])
  const [userFollowing, setUserFollowing] = useState(false)
  const [userProfileLoading, setUserProfileLoading] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const [replyingTo, setReplyingTo] = useState<Post | null>(null)
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null)

  const [showCreateWalletModal, setShowCreateWalletModal] = useState(false)

  const [autoRegistering, setAutoRegistering] = useState(false)
  const [autoRegisterError, setAutoRegisterError] = useState<string | null>(null)

  const [authVersion, setAuthVersion] = useState(0)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [localSignIn, setLocalSignIn] = useState<{ challengeId: string; message: string } | null>(null)

  const tonConnected = tonAddress.trim().length > 0
  const activeAddress = tonConnected ? tonAddress : localWallet?.address ?? ''

  const authReady = useMemo(() => {
    void authVersion
    return sessionMatchesAddress(activeAddress)
  }, [activeAddress, authVersion])

  const getTonPublicKeyHex = useCallback((): string | null => {
    const acc = tonConnectUI.wallet?.account
    if (!acc?.publicKey) return null
    const pk = acc.publicKey as string | Uint8Array
    if (typeof pk === 'string') return pk.replace(/^0x/i, '').trim()
    return Buffer.from(pk).toString('hex')
  }, [tonConnectUI])

  const signInWithTonConnect = useCallback(async () => {
    if (!activeAddress || !tonConnected) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const ch = await requestAuthChallenge(activeAddress)
      const pkHex = getTonPublicKeyHex()
      if (!pkHex) throw new Error('Не удалось получить public key из кошелька. Обновите кошелёк / Ton Connect.')
      const signData = await (tonConnectUI as { signData?: (p: { type: string; text: string }) => Promise<unknown> }).signData?.({
        type: 'text',
        text: ch.message,
      })
      if (!signData) throw new Error('Кошелёк не поддерживает SignData — обновите Tonkeeper / другой кошелёк.')
      const { token, expiresAt } = await verifyAuthSession({
        address: activeAddress,
        challengeId: ch.challengeId,
        publicKey: pkHex,
        tonConnect: signData,
      })
      saveSession({ address: activeAddress, token, expiresAt })
      setAuthVersion((v) => v + 1)
    } catch (e) {
      setAuthError((e as Error).message || 'Не удалось войти')
    } finally {
      setAuthBusy(false)
    }
  }, [activeAddress, tonConnected, tonConnectUI, getTonPublicKeyHex])

  const startLocalSignIn = useCallback(async () => {
    if (!activeAddress) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const ch = await requestAuthChallenge(activeAddress)
      setLocalSignIn({ challengeId: ch.challengeId, message: ch.message })
    } catch (e) {
      setAuthError((e as Error).message || 'Не удалось получить challenge')
    } finally {
      setAuthBusy(false)
    }
  }, [activeAddress])

  useEffect(() => {
    if (!activeAddress) return
    const s = loadSession()
    if (s && s.address !== activeAddress) {
      clearSession()
      setAuthVersion((v) => v + 1)
    }
  }, [activeAddress])

  useEffect(() => {
    setLocalWallet(loadLocalWallet())
  }, [])

  useEffect(() => {
    if (!activeAddress) {
      setAccountLoaded(false)
      setActiveAccount(null)
      setPosts([])
      setNextCursor(null)
      setRecommended([])
      setView('feed')
      setMyProfilePosts([])
      setViewingUserHandle(null)
      setUserAccount(null)
      setUserStats(null)
      setUserPosts([])
      return
    }

    let cancelled = false

    const loadAccount = async () => {
      setAccountLoaded(false)
      try {
        const acc = await getAccountByAddress(activeAddress)
        if (cancelled) return
        setActiveAccount(acc)
        setAccountLoaded(true)
      } catch {
        if (cancelled) return
        setActiveAccount(null)
        setAccountLoaded(true)
      }
    }

    void loadAccount()
    return () => {
      cancelled = true
    }
  }, [activeAddress])

  const loadFeed = useCallback(async () => {
    if (!activeAddress || !activeAccount) return
    setFeedLoading(true)
    try {
      if (feedMode === 'home') {
        const r = await getHomeFeed({ address: activeAddress, limit: 30, cursor: null })
        setPosts(r.posts)
        setNextCursor(r.nextCursor)
      } else {
        const r = await getFeed({ limit: 30, offset: 0, viewerAddress: activeAddress })
        setPosts(r.posts)
        setNextCursor(r.nextCursor)
      }
      const top = await getRecommended({ limit: 8 })
      setRecommended(top)
    } catch {
      setPosts([])
      setNextCursor(null)
    } finally {
      setFeedLoading(false)
    }
  }, [activeAddress, activeAccount, feedMode])

  useEffect(() => {
    if (!activeAddress || !activeAccount) return
    void loadFeed()
  }, [activeAddress, activeAccount, feedMode, loadFeed])

  useEffect(() => {
    if (view !== 'profile' || !activeAddress || !activeAccount) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await getPostsByAddress({
          address: activeAddress,
          limit: 80,
          offset: 0,
          viewerAddress: activeAddress,
        })
        if (!cancelled) setMyProfilePosts(r.posts)
      } catch {
        if (!cancelled) setMyProfilePosts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, activeAddress, activeAccount])

  useEffect(() => {
    if (view !== 'user' || !viewingUserHandle || !activeAddress || !activeAccount) return
    let cancelled = false
    setUserProfileLoading(true)
    ;(async () => {
      try {
        const acc = await getAccountByHandle(viewingUserHandle)
        if (cancelled || !acc) {
          if (!cancelled) {
            setUserAccount(null)
            setUserStats(null)
            setUserPosts([])
          }
          return
        }
        const [stats, postsRes, fs] = await Promise.all([
          getAccountStats(acc.address),
          getPostsByAddress({
            address: acc.address,
            limit: 80,
            offset: 0,
            viewerAddress: activeAddress,
          }),
          getFollowStatus({ followerAddress: activeAddress, followeeAddress: acc.address }),
        ])
        if (cancelled) return
        setUserAccount(acc)
        setUserStats(stats)
        setUserPosts(postsRes.posts)
        setUserFollowing(fs.following)
      } catch {
        if (!cancelled) {
          setUserAccount(null)
          setUserStats(null)
          setUserPosts([])
        }
      } finally {
        if (!cancelled) setUserProfileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, viewingUserHandle, activeAddress, activeAccount])

  const handleDisconnectTon = async () => {
    await tonConnectUI.disconnect()
  }

  const handleClearLocalWallet = () => {
    clearLocalWallet()
    setLocalWallet(null)
    setView('feed')
  }

  const handleAuthDisconnect = async () => {
    clearSession()
    setAuthVersion((v) => v + 1)
    if (tonConnected) {
      await handleDisconnectTon()
    } else {
      handleClearLocalWallet()
    }
  }

  const patchPostEverywhere = useCallback((postId: string, patch: Partial<Post>) => {
    const map = (list: Post[]) => list.map((x) => (x.id === postId ? { ...x, ...patch } : x))
    setPosts((p) => map(p))
    setMyProfilePosts((p) => map(p))
    setUserPosts((p) => map(p))
  }, [])

  const loadMore = async () => {
    if (!activeAddress || !activeAccount || !nextCursor || feedLoadingMore) return
    setFeedLoadingMore(true)
    try {
      if (feedMode === 'home') {
        const r = await getHomeFeed({
          address: activeAddress,
          limit: 30,
          cursor: nextCursor,
        })
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const p of r.posts) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          return merged
        })
        setNextCursor(r.nextCursor)
      } else {
        const r = await getFeed({
          limit: 30,
          cursor: nextCursor,
          viewerAddress: activeAddress,
        })
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const p of r.posts) {
            if (!seen.has(p.id)) {
              seen.add(p.id)
              merged.push(p)
            }
          }
          return merged
        })
        setNextCursor(r.nextCursor)
      }
    } finally {
      setFeedLoadingMore(false)
    }
  }

  const handleCreatePost = (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    if (!activeAddress) return
    if (!activeAccount) return
    if (!authReady) return

    void (async () => {
      const post = await apiCreatePost({
        authorAddress: activeAddress,
        authorHandle: activeAccount.handle,
        content: trimmed.slice(0, 500),
        replyToPostId: replyingTo?.id ?? null,
      })
      setReplyingTo(null)
      setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)])
      setMyProfilePosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)])
      const top = await getRecommended({ limit: 8 })
      setRecommended(top)
    })()
  }

  function deriveHandle(address: string, attempt: number) {
    let h = 0
    for (let i = 0; i < address.length; i++) h = (h * 33 + address.charCodeAt(i)) >>> 0
    h = (h ^ (attempt * 2654435761)) >>> 0
    const s = h.toString(36)
    const handle = `u_${s.slice(0, 12)}`
    return handle.slice(0, 20).toLowerCase()
  }

  const autoRegisterNow = async () => {
    if (!activeAddress) return
    if (!sessionMatchesAddress(activeAddress)) {
      setAutoRegisterError('Сначала войдите: подпишите challenge для этого адреса.')
      return
    }
    setAutoRegisterError(null)
    setAutoRegistering(true)
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const handle = deriveHandle(activeAddress, attempt)
        if (!isValidHandle(handle)) continue
        const displayName = handle
        try {
          const acc = await upsertAccount({
            address: activeAddress,
            handle,
            displayName,
            avatarColor: hashToHsl(handle),
          })
          setActiveAccount(acc)
          setAccountLoaded(true)
          return
        } catch (e) {
          const payload = (e as any)?.payload
          if (payload?.error === 'handle_taken') continue
          throw e
        }
      }
      setAutoRegisterError('Не удалось создать уникальный handle. Попробуй позже.')
    } catch (e) {
      setAutoRegisterError((e as Error).message || 'Не удалось создать аккаунт.')
    } finally {
      setAutoRegistering(false)
    }
  }

  useEffect(() => {
    if (!activeAddress) return
    if (!accountLoaded) return
    if (activeAccount) return
    if (!authReady) return
    if (autoRegistering) return
    if (autoRegisterError) return
    void autoRegisterNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress, accountLoaded, activeAccount, authReady, autoRegistering, autoRegisterError])

  const [regHandle, setRegHandle] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regError, setRegError] = useState<string | null>(null)

  const submitRegistration = () => {
    if (!activeAddress) return
    if (!authReady) {
      setRegError('Сначала войдите (подпись challenge).')
      return
    }
    setRegError(null)

    const handle = normalizeHandle(regHandle)
    if (!isValidHandle(handle)) {
      setRegError('Имя пользователя: 3-20 символов, только `a-z`, `0-9`, `_`.')
      return
    }

    const displayName = regDisplayName.trim() || handle
    void (async () => {
      try {
        const acc = await upsertAccount({
          address: activeAddress,
          handle,
          displayName,
          avatarColor: hashToHsl(handle),
        })
        setActiveAccount(acc)
        setAccountLoaded(true)
      } catch (e) {
        const payload = (e as any).payload
        if (payload?.error === 'handle_taken') {
          setRegError('Это имя пользователя уже занято.')
          return
        }
        setRegError((e as Error).message || 'Не удалось создать аккаунт.')
      }
    })()
  }

  const openProfile = (handle: string, _address: string) => {
    if (!activeAccount) return
    if (normalizeHandle(handle) === normalizeHandle(activeAccount.handle)) {
      setView('profile')
      setViewingUserHandle(null)
      return
    }
    setView('user')
    setViewingUserHandle(normalizeHandle(handle))
  }

  const handleToggleLike = async (post: Post) => {
    if (!activeAddress) return
    if (!authReady) return
    const liked = Boolean(post.likedByViewer)
    setLikeBusyId(post.id)
    try {
      if (liked) {
        await unlikePost({ postId: post.id, walletAddress: activeAddress })
        patchPostEverywhere(post.id, {
          likedByViewer: false,
          likesCount: Math.max(0, (post.likesCount ?? 0) - 1),
        })
      } else {
        await likePost({ postId: post.id, walletAddress: activeAddress })
        patchPostEverywhere(post.id, {
          likedByViewer: true,
          likesCount: (post.likesCount ?? 0) + 1,
        })
      }
    } catch {
      /* ignore */
    } finally {
      setLikeBusyId(null)
    }
  }

  const toggleFollowUser = async () => {
    if (!activeAddress || !activeAccount || !userAccount) return
    if (!authReady) return
    if (userAccount.address === activeAddress) return
    setFollowBusy(true)
    try {
      if (userFollowing) {
        await unfollow({ followerAddress: activeAddress, followeeAddress: userAccount.address })
        setUserFollowing(false)
        if (userStats) {
          setUserStats({
            ...userStats,
            followersCount: Math.max(0, userStats.followersCount - 1),
          })
        }
      } else {
        await follow({ followerAddress: activeAddress, followeeAddress: userAccount.address })
        setUserFollowing(true)
        if (userStats) {
          setUserStats({
            ...userStats,
            followersCount: userStats.followersCount + 1,
          })
        }
      }
    } catch {
      /* ignore */
    } finally {
      setFollowBusy(false)
    }
  }

  const followFromRecommended = async (handle: string) => {
    if (!activeAddress) return
    if (!authReady) return
    const acc = await getAccountByHandle(handle)
    if (!acc || acc.address === activeAddress) return
    try {
      await follow({ followerAddress: activeAddress, followeeAddress: acc.address })
      void loadFeed()
    } catch {
      /* ignore */
    }
  }

  const getAccent = (handle: string) => hashToHsl(handle)

  if (!activeAddress) {
    return (
      <div className="container">
        <div style={{ paddingTop: 52, paddingBottom: 24, display: 'grid', gap: 18 }}>
          <div className="panel" style={{ padding: 20 }}>
            <div className="auth-title">Добро пожаловать в Degram</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              TON/Telegram social layer: подключи кошелёк через <span className="mono">TON Connect</span> или создай
              self-custody wallet, чтобы сразу войти в ленту.
            </div>
            <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
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

  if (activeAddress && !accountLoaded) {
    return (
      <div className="container">
        <div style={{ paddingTop: 48, paddingBottom: 24 }}>
          <div className="panel" style={{ padding: 20 }}>
            <div className="auth-title">Загрузка…</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Подключаемся к API и проверяем аккаунт.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (activeAddress && accountLoaded && !activeAccount) {
    if (!authReady) {
      return (
        <div className="container">
          <div className="panel" style={{ marginTop: 20, padding: 20 }}>
            <div className="auth-title">Подтвердите кошелёк</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Подпишите одноразовое сообщение в кошельке (без перевода TON). После этого мы создадим профиль.
            </div>
            {authError && <div className="error" style={{ marginTop: 12 }}>{authError}</div>}
            <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {tonConnected && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={authBusy}
                  onClick={() => void signInWithTonConnect()}
                >
                  {authBusy ? '…' : 'Подписать через TON Connect'}
                </button>
              )}
              {!tonConnected && localWallet && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={authBusy}
                  onClick={() => void startLocalSignIn()}
                >
                  {authBusy ? '…' : 'Войти по seed phrase'}
                </button>
              )}
            </div>
            <div style={{ marginTop: 14 }} className="muted small">
              Нужен кошелёк с поддержкой SignData (актуальный Tonkeeper и др.).
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn danger" onClick={handleAuthDisconnect} type="button">
                Отключить
              </button>
            </div>
          </div>
          {localSignIn && (
            <LocalWalletSignInModal
              address={activeAddress}
              challengeId={localSignIn.challengeId}
              message={localSignIn.message}
              onClose={() => setLocalSignIn(null)}
              onSuccess={() => setAuthVersion((v) => v + 1)}
            />
          )}
        </div>
      )
    }
    return (
      <div className="container">
        <div className="panel" style={{ marginTop: 20, padding: 20 }}>
          <div className="auth-title">Создаём аккаунт…</div>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Мы автоматически сгенерируем @handle на базе адреса кошелька и сразу покажем витрину ваших NFT, jettons и DNS.
          </div>

          {autoRegisterError && (
            <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              <div className="error">{autoRegisterError}</div>
              <div className="row">
                <button className="btn danger" onClick={handleAuthDisconnect} type="button">
                  Отключить
                </button>
                <button className="btn primary" onClick={() => void autoRegisterNow()} type="button" disabled={autoRegistering}>
                  {autoRegistering ? 'Повтор…' : 'Повторить'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-title">
              Degram
              <small className="mono">TON social</small>
            </div>
          </div>
          <div className="topbar-account">
            <div className="topbar-account-meta">
              <button
                type="button"
                onClick={() => {
                  setView('profile')
                  setViewingUserHandle(null)
                }}
                className="topbar-account-handle"
              >
                <div style={{ fontWeight: 850, lineHeight: 1.1 }}>@{activeAccount!.handle}</div>
              </button>
              <div className="muted mono" style={{ fontSize: 12 }}>
                {formatAddress(activeAddress)}
              </div>
            </div>
            <button className="btn" onClick={handleAuthDisconnect} type="button">
              Выйти
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
              <span>Главная</span>
              <span className="muted mono">{posts.length}</span>
            </button>
            <button
              className={view === 'profile' ? 'active' : ''}
              onClick={() => {
                setView('profile')
                setViewingUserHandle(null)
              }}
              type="button"
            >
              <span>Профиль</span>
              <span className="muted mono">{myProfilePosts.length || '—'}</span>
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
                <div className="profile-hero">
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 950 }}>{activeAccount!.displayName}</div>
                    <div className="muted mono">@{activeAccount!.handle}</div>
                    <ProfileStats address={activeAddress} />
                  </div>
                </div>
                <WalletHoldingsCard address={activeAddress} />
                <div style={{ padding: '0 12px 12px' }}>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Ваши посты
                  </div>
                  {myProfilePosts.length === 0 ? (
                    <EmptyState text="Пока нет постов. Напишите что-нибудь на главной." />
                  ) : (
                    myProfilePosts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        accent={getAccent(p.authorHandle)}
                        timeLabel={nowTimeLabel(p.createdAt)}
                        viewerAddress={activeAddress}
                        isSelf
                        onOpenProfile={openProfile}
                        onReply={(post) => {
                          setView('feed')
                          setReplyingTo(post)
                        }}
                        onToggleLike={handleToggleLike}
                        likeBusy={likeBusyId === p.id}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : view === 'user' ? (
              <div className="feed">
                <div style={{ padding: '8px 12px 0' }}>
                  <button type="button" className="btn ghost" onClick={() => setView('feed')}>
                    ← Назад в ленту
                  </button>
                </div>
                {userProfileLoading && <div className="feed-loading">Загрузка профиля…</div>}
                {!userProfileLoading && !userAccount && (
                  <EmptyState text="Пользователь не найден." />
                )}
                {userAccount && userStats && (
                  <>
                    <div className="profile-hero">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          className="avatar"
                          style={{
                            width: 48,
                            height: 48,
                            fontSize: 18,
                            background: `linear-gradient(135deg, ${userAccount.avatarColor}, rgba(255,255,255,0.08))`,
                          }}
                        >
                          {userAccount.handle.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 950 }}>{userAccount.displayName}</div>
                          <div className="muted mono">@{userAccount.handle}</div>
                        </div>
                      </div>
                      {userAccount.address !== activeAddress && (
                        <button
                          type="button"
                          className={`btn primary ${userFollowing ? '' : ''}`}
                          onClick={() => void toggleFollowUser()}
                          disabled={followBusy || !authReady}
                        >
                          {userFollowing ? 'Вы подписаны' : 'Подписаться'}
                        </button>
                      )}
                    </div>
                    <div className="profile-hero" style={{ borderBottom: 'none', paddingTop: 0 }}>
                      <div className="profile-stats">
                        <span>
                          <b>{userStats.postsCount}</b> постов
                        </span>
                        <span>
                          <b>{userStats.followingCount}</b> подписок
                        </span>
                        <span>
                          <b>{userStats.followersCount}</b> подписчиков
                        </span>
                      </div>
                    </div>
                    <WalletHoldingsCard address={userAccount.address} />
                    <div style={{ padding: '0 12px 12px' }}>
                      {userPosts.length === 0 ? (
                        <EmptyState text="У пользователя пока нет постов." />
                      ) : (
                        userPosts.map((p) => (
                          <PostCard
                            key={p.id}
                            post={p}
                            accent={getAccent(p.authorHandle)}
                            timeLabel={nowTimeLabel(p.createdAt)}
                            viewerAddress={activeAddress}
                            isSelf={p.authorAddress === activeAddress}
                            onOpenProfile={openProfile}
                            onReply={(post) => {
                              setView('feed')
                              setReplyingTo(post)
                            }}
                            onToggleLike={handleToggleLike}
                            likeBusy={likeBusyId === p.id}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {activeAccount && !authReady && (
                  <div className="panel" style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontWeight: 800 }}>Вход в API</div>
                    <div className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                      Подпишите challenge, чтобы публиковать посты, лайкать и подписываться.
                    </div>
                    {authError && <div className="error" style={{ marginTop: 8 }}>{authError}</div>}
                    <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {tonConnected && (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={authBusy}
                          onClick={() => void signInWithTonConnect()}
                        >
                          {authBusy ? '…' : 'Подписать (TON Connect)'}
                        </button>
                      )}
                      {!tonConnected && localWallet && (
                        <button
                          type="button"
                          className="btn primary"
                          disabled={authBusy}
                          onClick={() => void startLocalSignIn()}
                        >
                          {authBusy ? '…' : 'Войти по seed'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="feed-tabs">
                  <button
                    type="button"
                    className={`feed-tab ${feedMode === 'home' ? 'active' : ''}`}
                    onClick={() => setFeedMode('home')}
                  >
                    Для вас
                  </button>
                  <button
                    type="button"
                    className={`feed-tab ${feedMode === 'explore' ? 'active' : ''}`}
                    onClick={() => setFeedMode('explore')}
                  >
                    Все посты
                  </button>
                </div>

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
                    <button className="btn" onClick={() => void loadFeed()} type="button" disabled={feedLoading}>
                      {feedLoading ? '…' : 'Обновить'}
                    </button>
                  </div>
                  {replyingTo && (
                    <div className="reply-banner">
                      <span>
                        Ответ для <b>@{replyingTo.authorHandle}</b>
                      </span>
                      <button type="button" onClick={() => setReplyingTo(null)} aria-label="Отменить ответ">
                        ✕
                      </button>
                    </div>
                  )}
                  <Composer onSubmit={handleCreatePost} disabled={!authReady} />
                </div>

                <div className="feed">
                  {feedLoading && posts.length === 0 ? (
                    <div className="feed-loading">Загрузка ленты…</div>
                  ) : posts.length === 0 ? (
                    <EmptyState
                      text={
                        feedMode === 'home'
                          ? 'Лента пуста. Подпишитесь на людей во «Все посты» или напишите первый пост.'
                          : 'Пока никто ничего не написал. Создайте первый пост выше.'
                      }
                    />
                  ) : (
                    <>
                      {posts.map((p) => (
                        <PostCard
                          key={p.id}
                          post={p}
                          accent={getAccent(p.authorHandle)}
                          timeLabel={nowTimeLabel(p.createdAt)}
                          viewerAddress={activeAddress}
                          isSelf={p.authorAddress === activeAddress}
                          onOpenProfile={openProfile}
                          onReply={(post) => setReplyingTo(post)}
                          onToggleLike={handleToggleLike}
                          likeBusy={likeBusyId === p.id}
                        />
                      ))}
                      {nextCursor && (
                        <div className="load-more-wrap">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => void loadMore()}
                            disabled={feedLoadingMore}
                          >
                            {feedLoadingMore ? 'Загрузка…' : 'Загрузить ещё'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </main>

          <aside className="panel side">
            <h3>В тренде</h3>
            <div className="mini">
              {recommended.length === 0 ? (
                <div className="muted">Мало активности за неделю — напишите пост.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {recommended.map((t) => (
                    <div key={t.handle} className="recommended-row">
                      <button
                        type="button"
                        onClick={() => openProfile(t.handle, '')}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: 'pointer',
                          font: 'inherit',
                          fontWeight: 800,
                          textAlign: 'left',
                          padding: 0,
                        }}
                      >
                        @{t.handle}
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="muted mono">{t.count}</span>
                        {normalizeHandle(t.handle) !== normalizeHandle(activeAccount!.handle) && (
                          <button
                            type="button"
                            className="btn mini"
                            disabled={!authReady}
                            onClick={() => void followFromRecommended(t.handle)}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mini">
              <div className="muted" style={{ lineHeight: 1.5 }}>
                Данные хранятся в PostgreSQL. Архитектура ориентирована на serverless runtime и масштабирование API.
              </div>
            </div>
          </aside>
        </div>
      </div>
      {localSignIn && activeAccount && (
        <LocalWalletSignInModal
          address={activeAddress}
          challengeId={localSignIn.challengeId}
          message={localSignIn.message}
          onClose={() => setLocalSignIn(null)}
          onSuccess={() => setAuthVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}

function ProfileStats({ address }: { address: string }) {
  const [stats, setStats] = useState<AccountStats | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await getAccountStats(address)
        if (!cancelled) setStats(s)
      } catch {
        if (!cancelled) setStats(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address])

  if (!stats) return <div className="muted" style={{ marginTop: 8 }}>…</div>
  return (
    <div className="profile-stats">
      <span>
        <b>{stats.postsCount}</b> постов
      </span>
      <span>
        <b>{stats.followingCount}</b> подписок
      </span>
      <span>
        <b>{stats.followersCount}</b> подписчиков
      </span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 950, fontSize: 16 }}>{text}</div>
    </div>
  )
}

function Composer({
  onSubmit,
  disabled,
}: {
  onSubmit: (content: string) => void
  disabled?: boolean
}) {
  const [content, setContent] = useState('')

  return (
    <>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Что нового?"
        disabled={disabled}
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
          disabled={disabled || content.trim().length === 0}
        >
          Опубликовать
        </button>
      </div>
    </>
  )
}

export default function App() {
  return (
    <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}>
      <InnerApp />
    </TonConnectUIProvider>
  )
}
