import { closePool } from './db/pool.js'
import { runMigrate } from './migrate.js'

await runMigrate()
console.log('PostgreSQL schema applied OK.')
await closePool()
