import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool } from './db/pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function splitSqlStatements(sql) {
  const noComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export async function runMigrate() {
  const sqlPath = path.join(__dirname, 'db', 'schema.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const pool = getPool()
  const stmts = splitSqlStatements(sql)
  for (const stmt of stmts) {
    await pool.query(stmt)
  }
}
