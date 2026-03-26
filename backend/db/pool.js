import pg from 'pg'

const { Pool } = pg

let pool

function inferSsl(connectionString) {
  if (process.env.PG_SSL === 'false') return false
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false
  return { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
}

/**
 * Serverless-friendly singleton. Neon / Supabase / RDS: use DATABASE_URL with sslmode=require.
 */
export function getPool() {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required (PostgreSQL connection string)')
  }
  pool = new Pool({
    connectionString,
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
