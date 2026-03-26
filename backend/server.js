import http from 'node:http'
import { runMigrate } from './migrate.js'
import { handleRequest } from './handler.js'

const PORT = Number(process.env.PORT ?? 3002)

await runMigrate()

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error(err)
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'server_error' }))
  })
})

server.listen(PORT, () => {
  console.log(`Degram API (PostgreSQL) http://localhost:${PORT}`)
})
