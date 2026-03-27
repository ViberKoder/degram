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
  // Vercel/Supabase often provide sslmode=require. With pg v8 this can still
  // fail in serverless if chain validation is strict in runtime. Default to
  // no-verify unless strict mode is explicitly requested.
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
 * Serverless-friendly singleton.
 * Preferred native vars:
 * - POSTGRES_URL / POSTGRES_URL_NON_POOLING
 * Also supports legacy aliases for compatibility.
 */
function resolveConnectionString() {
  return (
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.SUPABASE_DB_URL ??
    process.env.SUPABASE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ''
  )
}

export function getPool() {
  if (pool) return pool
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error(
      'POSTGRES_URL (or POSTGRES_URL_NON_POOLING / SUPABASE_DB_URL / DATABASE_URL) is required (PostgreSQL connection string)',
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
