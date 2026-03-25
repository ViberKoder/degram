export type Account = {
  address: string
  handle: string
  displayName: string
  avatarColor: string
  createdAt: number
}

export type Post = {
  id: string
  authorAddress: string
  authorHandle: string
  content: string
  createdAt: number
}

const ACCOUNTS_KEY = 'degram:accounts'
const POSTS_KEY = 'degram:posts'

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

