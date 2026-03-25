import type { Account, Post } from '../utils/storage'

const API_BASE = 'http://localhost:3002'

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(options?.headers ?? {}),
    },
  })

  const text = await res.text()
  const json = text ? JSON.parse(text) : null

  if (!res.ok) {
    const message = json?.error ?? res.statusText
    const err = new Error(typeof message === 'string' ? message : 'Request failed')
    ;(err as any).status = res.status
    ;(err as any).payload = json
    throw err
  }

  return json as T
}

export async function getHealth() {
  return requestJson<{ ok: true }>('/api/health')
}

export async function getAccountByAddress(address: string): Promise<Account | null> {
  const data = await requestJson<{ account: Account | null }>(
    `/api/accounts/by-address?address=${encodeURIComponent(address)}`,
  )
  return data.account
}

export async function upsertAccount(params: {
  address: string
  handle: string
  displayName: string
  avatarColor: string
}): Promise<Account> {
  const data = await requestJson<{ account: Account }>(`/api/accounts`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return data.account
}

export async function getFeed(params: { limit: number; offset: number }): Promise<Post[]> {
  const data = await requestJson<{ posts: Post[] }>(
    `/api/posts?limit=${encodeURIComponent(String(params.limit))}&offset=${encodeURIComponent(
      String(params.offset),
    )}`,
  )
  return data.posts
}

export async function getPostsByAddress(params: { address: string; limit: number; offset: number }): Promise<Post[]> {
  const data = await requestJson<{ posts: Post[] }>(
    `/api/posts/by-address?address=${encodeURIComponent(params.address)}&limit=${encodeURIComponent(
      String(params.limit),
    )}&offset=${encodeURIComponent(String(params.offset))}`,
  )
  return data.posts
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
}): Promise<Post> {
  const data = await requestJson<{ post: Post }>(`/api/posts`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return data.post
}

