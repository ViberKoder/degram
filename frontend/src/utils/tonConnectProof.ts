/** Ton Connect `connectItems.tonProof` success payload for POST /api/auth/ton-proof */

export type TonProofForApi = {
  timestamp: number
  domain: { lengthBytes: number; value: string }
  payload: string
  signature: string
  state_init: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseProofPayload(proof: unknown): TonProofForApi | null {
  if (!isRecord(proof) || 'error' in proof) return null
  if (typeof proof.timestamp !== 'number') return null
  const domain = proof.domain
  if (!isRecord(domain) || typeof domain.value !== 'string') return null
  const lengthBytes = Number(domain.lengthBytes ?? domain.length_bytes)
  if (!Number.isFinite(lengthBytes)) return null
  const payload = proof.payload
  const signature = proof.signature
  const stateInit = proof.state_init ?? proof.stateInit
  if (typeof payload !== 'string' || typeof signature !== 'string' || typeof stateInit !== 'string') return null
  return {
    timestamp: proof.timestamp,
    domain: { lengthBytes, value: domain.value },
    payload,
    signature,
    state_init: stateInit,
  }
}

function walkForTonProof(node: unknown, seen = new Set<unknown>()): TonProofForApi | null {
  if (node == null || typeof node !== 'object') return null
  if (seen.has(node)) return null
  seen.add(node)

  const o = node as Record<string, unknown>
  if (o.name === 'tonProof' && o.proof != null) {
    const parsed = parseProofPayload(o.proof)
    if (parsed) return parsed
  }

  for (const v of Object.values(o)) {
    const r = walkForTonProof(v, seen)
    if (r) return r
  }
  return null
}

/** Extract successful ton_proof from account.connectItems (any nesting). */
export function extractTonProof(account: { connectItems?: unknown } | null | undefined): TonProofForApi | null {
  return walkForTonProof(account?.connectItems)
}
