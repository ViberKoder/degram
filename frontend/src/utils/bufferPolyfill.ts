// Minimal browser polyfill for Node.js Buffer (needed by @ton/ton).
// We implement only the methods used by @ton/core/@ton/ton in this project.

type BufferEncoding = 'hex' | 'base64'

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function decodeHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, '')
  if (clean.length === 0) return new Uint8Array(0)
  const normalized = clean.length % 2 === 0 ? clean : `0${clean}`
  const bytes = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

class BufferPolyfill extends Uint8Array {
  static isBuffer(value: unknown): value is BufferPolyfill {
    return value instanceof BufferPolyfill
  }

  static alloc(size: number): BufferPolyfill {
    const arr = new Uint8Array(Math.max(0, size))
    return BufferPolyfill.from(arr)
  }

  static from(value: any, encoding?: BufferEncoding): BufferPolyfill {
    if (value instanceof BufferPolyfill) return value
    if (value instanceof Uint8Array) return new BufferPolyfill(value)
    if (Array.isArray(value)) return new BufferPolyfill(Uint8Array.from(value))
    if (typeof value === 'string') {
      if (encoding === 'hex') return new BufferPolyfill(decodeHex(value))
      if (encoding === 'base64') return new BufferPolyfill(decodeBase64(value))
      // Default UTF-8-ish: treat as binary string.
      const bytes = new TextEncoder().encode(value)
      return new BufferPolyfill(bytes)
    }
    // Fallback for ArrayBuffer-like
    if (value instanceof ArrayBuffer) return new BufferPolyfill(new Uint8Array(value))
    return new BufferPolyfill(Uint8Array.from(value))
  }

  static concat(list: BufferPolyfill[]): BufferPolyfill {
    const total = list.reduce((sum, b) => sum + b.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const b of list) {
      out.set(b, offset)
      offset += b.length
    }
    return new BufferPolyfill(out)
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const toCopy = Math.max(0, Math.min(sourceEnd, this.length) - Math.max(0, sourceStart))
    const maxWritable = Math.max(0, target.length - targetStart)
    const length = Math.min(toCopy, maxWritable)
    for (let i = 0; i < length; i++) target[targetStart + i] = this[sourceStart + i]
    return length
  }

  writeUInt8(value: number, offset = 0): number {
    this[offset] = value & 0xff
    return offset + 1
  }

  writeUInt16LE(value: number, offset = 0): number {
    this[offset] = value & 0xff
    this[offset + 1] = (value >>> 8) & 0xff
    return offset + 2
  }

  writeInt16LE(value: number, offset = 0): number {
    const v = value & 0xffff
    this[offset] = v & 0xff
    this[offset + 1] = (v >>> 8) & 0xff
    return offset + 2
  }

  writeUInt32LE(value: number, offset = 0): number {
    const v = value >>> 0
    this[offset] = v & 0xff
    this[offset + 1] = (v >>> 8) & 0xff
    this[offset + 2] = (v >>> 16) & 0xff
    this[offset + 3] = (v >>> 24) & 0xff
    return offset + 4
  }

  writeInt32LE(value: number, offset = 0): number {
    const v = value | 0
    this[offset] = v & 0xff
    this[offset + 1] = (v >>> 8) & 0xff
    this[offset + 2] = (v >>> 16) & 0xff
    this[offset + 3] = (v >>> 24) & 0xff
    return offset + 4
  }

  toString(encoding?: BufferEncoding): string {
    if (encoding === 'hex') return bytesToHex(this)
    // Default: ISO-8859-1-ish binary string
    let out = ''
    for (let i = 0; i < this.length; i++) out += String.fromCharCode(this[i])
    return out
  }
}

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof BufferPolyfill | undefined
}

// Set only if Buffer is missing (browser).
if (typeof window !== 'undefined' && (globalThis as any).Buffer == null) {
  ;(globalThis as any).Buffer = BufferPolyfill
}

export {}

