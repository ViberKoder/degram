const STORAGE_KEY = 'degram_session'

export type StoredSession = {
  address: string
  token: string
  expiresAt: number
}

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (!s?.address || !s?.token) return null
    if (typeof s.expiresAt === 'number' && Date.now() > s.expiresAt + 60_000) {
      clearSession()
      return null
    }
    return s
  } catch {
    return null
  }
}

export function saveSession(s: StoredSession) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function sessionMatchesAddress(address: string): boolean {
  if (!address.trim()) return false
  const s = loadSession()
  return Boolean(s && s.address === address)
}
