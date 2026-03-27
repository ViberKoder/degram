export type Account = {
  address: string
  handle: string
  displayName: string
  avatarColor: string
  createdAt: number
}

export type LocalWallet = {
  address: string
  workchain: number
  kind: 'v4r2'
  createdAt: number
}

export type PostReplyPreview = {
  id: string
  authorHandle: string
  contentPreview: string
}

export type Post = {
  id: string
  authorAddress: string
  authorHandle: string
  content: string
  replyToPostId?: string | null
  replyTo?: PostReplyPreview | null
  createdAt: number
  likesCount?: number
  repliesCount?: number
  likedByViewer?: boolean
}

export type AccountStats = {
  followersCount: number
  followingCount: number
  postsCount: number
}

const ACCOUNTS_KEY = 'degram:accounts'
const POSTS_KEY = 'degram:posts'
const LOCAL_WALLET_KEY = 'degram:local_wallet'

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function loadAccounts(): Record<string, Account> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(ACCOUNTS_KEY)
  return safeJsonParse<Record<string, Account>>(raw, {})
}

export function saveAccounts(accounts: Record<string, Account>) {
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function loadPosts(): Post[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(POSTS_KEY)
  return safeJsonParse<Post[]>(raw, [])
}

export function savePosts(posts: Post[]) {
  window.localStorage.setItem(POSTS_KEY, JSON.stringify(posts))
}

export function loadLocalWallet(): LocalWallet | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LOCAL_WALLET_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LocalWallet & { seedPhrase?: unknown }
    if (
      !parsed ||
      typeof parsed.address !== 'string' ||
      typeof parsed.workchain !== 'number' ||
      parsed.kind !== 'v4r2' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null
    }

    // Sanitize old localStorage entries from previous versions:
    // we never persist seed phrase anymore.
    const sanitized: LocalWallet = {
      address: parsed.address,
      workchain: parsed.workchain,
      kind: parsed.kind,
      createdAt: parsed.createdAt,
    }
    if (parsed.seedPhrase != null) {
      window.localStorage.setItem(LOCAL_WALLET_KEY, JSON.stringify(sanitized))
    }

    return sanitized
  } catch {
    return null
  }
}

export function saveLocalWallet(wallet: LocalWallet) {
  // Persist only what we really need: address/workchain/kind.
  // Seed phrase is intentionally not stored.
  const { address, workchain, kind, createdAt } = wallet
  window.localStorage.setItem(LOCAL_WALLET_KEY, JSON.stringify({ address, workchain, kind, createdAt }))
}

export function clearLocalWallet() {
  window.localStorage.removeItem(LOCAL_WALLET_KEY)
}

export function normalizeHandle(input: string): string {
  const trimmed = input.trim()
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return withoutAt.toLowerCase()
}

export function isValidHandle(handle: string): boolean {
  // simple allowlist for MVP
  return /^[a-z0-9_]{3,20}$/.test(handle)
}

export function hashToHsl(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 85% 55%)`
}

export type JettonHolding = {
  master: string
  walletAddress: string
  balance: string
  amount: string | null
  symbol?: string
  name?: string
  image?: string
}

export type NftHolding = {
  itemAddress: string
  collectionAddress: string | null
  ownerAddress: string | null
  init: boolean
  onSale: boolean
  collectionName?: string
  image?: string
}

export type DnsDomain = {
  domain: string
}

export type WalletHoldings = {
  address: string
  fetchedAt: number
  ton: {
    balanceNano: string
    balanceTon: string
    balanceUsd: number | null
    tonPriceUsd: number | null
  }
  jettons: JettonHolding[]
  nfts: NftHolding[]
  dns: DnsDomain[]
  totalUsd: number | null
  pricing: {
    tonUsdSource: string
    jettonsUsdSource: string | null
  }
}

