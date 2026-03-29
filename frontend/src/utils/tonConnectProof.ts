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

/** Extract successful ton_proof from account.connectItems (object or array). */
export function extractTonProof(account: { connectItems?: unknown } | null | undefined): TonProofForApi | null {
  const items = account?.connectItems
  if (items == null) return null
  const list: unknown[] = Array.isArray(items) ? items : Object.values(items as object)
  for (const it of list) {
    if (!isRecord(it) || it.name !== 'tonProof') continue
    const proof = it.proof
    if (!isRecord(proof) || 'error' in proof) continue
    if (typeof proof.timestamp !== 'number') continue
    const domain = proof.domain
    if (!isRecord(domain) || typeof domain.value !== 'string') continue
    const lengthBytes = Number(domain.lengthBytes ?? domain.length_bytes)
    if (!Number.isFinite(lengthBytes)) continue
    const payload = proof.payload
    const signature = proof.signature
    const stateInit = proof.state_init ?? proof.stateInit
    if (typeof payload !== 'string' || typeof signature !== 'string' || typeof stateInit !== 'string') continue
    return {
      timestamp: proof.timestamp,
      domain: { lengthBytes, value: domain.value },
      payload,
      signature,
      state_init: stateInit,
    }
  }
  return null
}
