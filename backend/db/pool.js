import pg from 'pg'

const { Pool } = pg

let pool

function inferSsl(connectionString) {
  if (process.env.PG_SSL === 'false') return false
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false
  const rejectUnauthorized = process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true'
  return { rejectUnauthorized }
}

function normalizeConnectionString(connectionString) {
  // Remote Postgres often uses sslmode=require. With pg v8, strict TLS validation
  // can fail in some runtimes; default to no-verify unless strict mode is on.
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return connectionString
  if (process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true') return connectionString
  try {
    const url = new URL(connectionString)
    if (!url.searchParams.has('sslmode') || url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('sslmode', 'no-verify')
    }
    return url.toString()
  } catch {
    return connectionString
  }
}

/**
 * Singleton pool. Use POSTGRES_URL or POSTGRES_URL_NON_POOLING; DATABASE_URL is supported.
 */
function resolveConnectionString() {
  return (
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    ''
  )
}

export function getPool() {
  if (pool) return pool
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error(
      'POSTGRES_URL (or POSTGRES_URL_NON_POOLING / DATABASE_URL) is required (PostgreSQL connection string)',
    )
  }
  pool = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: inferSsl(connectionString),
  })
  return pool
}

export async function query(text, params) {
  return getPool().query(text, params)
}

export async function closePool() {
  if (!pool) return
  await pool.end()
  pool = null
}
