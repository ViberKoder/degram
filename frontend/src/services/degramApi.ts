import type { Account, AccountStats, Post } from '../utils/storage'
import { loadSession } from '../utils/sessionAuth'

function authHeaderFor(address: string): Record<string, string> {
  const s = loadSession()
  if (s?.address === address && s?.token) {
    return { Authorization: `Bearer ${s.token}` }
  }
  return {}
}

async function requestJsonAuth<T>(path: string, address: string, options?: RequestInit): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    headers: {
      ...authHeaderFor(address),
      ...options?.headers,
    },
  })
}

/** Empty string = same origin (Vite dev proxy to backend). Set VITE_API_URL for production. */
function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  return raw?.replace(/\/$/, '') ?? ''
}

function apiUrl(path: string): string {
  const o = apiOrigin()
  return o ? `${o}${path}` : path
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toErrorMessage(status: number, statusText: string, payload: any, rawText: string): string {
  if (payload?.error && typeof payload.error === 'string') return payload.error
  if (payload?.details && typeof payload.details === 'string') return payload.details
  if (status === 500) return 'server_error'
  if (status === 404) return 'not_found'
  if (rawText) return rawText.slice(0, 180)
  return statusText || 'Request failed'
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(options?.headers ?? {}),
    },
  })

  const text = await res.text()
  const json = text ? safeParseJson(text) : null

  if (!res.ok) {
    const message = toErrorMessage(res.status, res.statusText, json, text)
    const err = new Error(message)
    ;(err as any).status = res.status
    ;(err as any).payload = json
    ;(err as any).raw = text
    throw err
  }

  if (json == null) {
    const err = new Error('invalid_json_response')
    ;(err as any).status = res.status
    ;(err as any).raw = text
    throw err
  }

  return json as T
}

export async function getHealth() {
  return requestJson<{ ok: true; storage?: string; version?: number }>('/api/health')
}

export async function getAccountByAddress(address: string): Promise<Account | null> {
  const data = await requestJson<{ account: Account | null }>(
    `/api/accounts/by-address?address=${encodeURIComponent(address)}`,
  )
  return data.account
}

export async function getAccountByHandle(handle: string): Promise<Account | null> {
  const data = await requestJson<{ account: Account | null }>(
    `/api/accounts/by-handle?handle=${encodeURIComponent(handle)}`,
  )
  return data.account
}

export async function getAccountStats(address: string): Promise<AccountStats> {
  const data = await requestJson<{ stats: AccountStats }>(
    `/api/accounts/stats?address=${encodeURIComponent(address)}`,
  )
  return data.stats
}

export async function getFollowStatus(params: { followerAddress: string; followeeAddress: string }) {
  return requestJson<{ following: boolean }>(
    `/api/follows/status?follower=${encodeURIComponent(params.followerAddress)}&followee=${encodeURIComponent(
      params.followeeAddress,
    )}`,
  )
}

export async function getPostById(params: { id: string; viewerAddress?: string }) {
  const v = params.viewerAddress ? `&viewer=${encodeURIComponent(params.viewerAddress)}` : ''
  return requestJson<{ post: Post }>(`/api/posts/by-id?id=${encodeURIComponent(params.id)}${v}`)
}

export async function getTonProofPayload() {
  return requestJson<{ payload: string; expiresAt: number }>('/api/auth/ton-proof-payload')
}

export type TonProofRequestBody = {
  address: string
  public_key: string
  proof: {
    timestamp: number
    domain: { lengthBytes: number; value: string }
    payload: string
    signature: string
    state_init: string
  }
}

export async function submitTonProof(body: TonProofRequestBody) {
  return requestJson<{ token: string; expiresAt: number }>('/api/auth/ton-proof', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function upsertAccount(params: {
  address: string
  handle: string
  displayName: string
  avatarColor: string
}): Promise<Account> {
  const data = await requestJsonAuth<{ account: Account }>(`/api/accounts`, params.address, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return data.account
}

export async function getFeed(params: {
  limit: number
  offset?: number
  cursor?: string | null
  viewerAddress?: string
}): Promise<{ posts: Post[]; total: number; nextCursor: string | null }> {
  const viewer = params.viewerAddress ? `&viewer=${encodeURIComponent(params.viewerAddress)}` : ''
  if (params.cursor != null && params.cursor !== '') {
    const data = await requestJson<{ posts: Post[]; total: number; nextCursor: string | null }>(
      `/api/posts?limit=${encodeURIComponent(String(params.limit))}&cursor=${encodeURIComponent(params.cursor)}${viewer}`,
    )
    return data
  }
  const offset = params.offset ?? 0
  const data = await requestJson<{ posts: Post[]; total: number; nextCursor: string | null }>(
    `/api/posts?limit=${encodeURIComponent(String(params.limit))}&offset=${encodeURIComponent(String(offset))}${viewer}`,
  )
  return data
}

export async function getHomeFeed(params: {
  address: string
  limit: number
  cursor?: string | null
  viewerAddress?: string
}): Promise<{
  posts: Post[]
  nextCursor: string | null
  total: number
}> {
  const viewer =
    params.viewerAddress && params.viewerAddress !== params.address
      ? `&viewer=${encodeURIComponent(params.viewerAddress)}`
      : ''
  const cur = params.cursor ? `&cursor=${encodeURIComponent(params.cursor)}` : ''
  const data = await requestJson<{ posts: Post[]; nextCursor: string | null; total: number }>(
    `/api/feed/home?address=${encodeURIComponent(params.address)}&limit=${encodeURIComponent(String(params.limit))}${cur}${viewer}`,
  )
  return data
}

export async function getPostsByAddress(params: {
  address: string
  limit: number
  offset?: number
  cursor?: string | null
  viewerAddress?: string
}): Promise<{ posts: Post[]; total: number; nextCursor: string | null }> {
  const viewer = params.viewerAddress ? `&viewer=${encodeURIComponent(params.viewerAddress)}` : ''
  const base = `/api/posts/by-address?address=${encodeURIComponent(params.address)}&limit=${encodeURIComponent(
    String(params.limit),
  )}`
  if (params.cursor != null && params.cursor !== '') {
    return requestJson(`${base}&cursor=${encodeURIComponent(params.cursor)}${viewer}`)
  }
  const offset = params.offset ?? 0
  return requestJson(`${base}&offset=${encodeURIComponent(String(offset))}${viewer}`)
}

export async function getRecommended(params: { limit: number }): Promise<Array<{ handle: string; count: number }>> {
  const data = await requestJson<{ items: Array<{ handle: string; count: number }> }>(
    `/api/recommended?limit=${encodeURIComponent(String(params.limit))}`,
  )
  return data.items
}

export async function createPost(params: {
  authorAddress: string
  authorHandle: string
  content: string
  replyToPostId?: string | null
}): Promise<Post> {
  const data = await requestJsonAuth<{ post: Post }>(`/api/posts`, params.authorAddress, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return data.post
}

export async function follow(params: { followerAddress: string; followeeAddress: string }) {
  return requestJsonAuth<{ ok: true }>(`/api/follows`, params.followerAddress, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function unfollow(params: { followerAddress: string; followeeAddress: string }) {
  return requestJsonAuth<{ ok: true }>(`/api/follows/remove`, params.followerAddress, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getFollowsByAddress(params: {
  address: string
  direction?: 'following' | 'followers'
}) {
  return requestJson<{ items: Array<{ wallet_address: string; created_at: number }> }>(
    `/api/follows/by-address?address=${encodeURIComponent(params.address)}&direction=${encodeURIComponent(
      params.direction ?? 'following',
    )}`,
  )
}

export async function likePost(params: { postId: string; walletAddress: string }) {
  return requestJsonAuth<{ ok: true }>(`/api/likes`, params.walletAddress, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function unlikePost(params: { postId: string; walletAddress: string }) {
  return requestJsonAuth<{ ok: true }>(`/api/likes/remove`, params.walletAddress, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getLikesByPost(params: { postId: string }) {
  return requestJson<{ postId: string; likesCount: number }>(
    `/api/likes/by-post?postId=${encodeURIComponent(params.postId)}`,
  )
}

export async function getWalletHoldings(params: { address: string }) {
  return requestJson(`/api/wallet/holdings?address=${encodeURIComponent(params.address)}`)
}
