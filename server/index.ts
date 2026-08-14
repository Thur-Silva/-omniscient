import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { handleApiRequest } from './api/router'
import { closePool, hasDatabaseUrl } from './infra/db/client'

const PORT = Number(process.env.PORT ?? 8080)
const DIST = resolve(process.cwd(), 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

/** Serve o build. Assets com hash podem ser cacheados para sempre; o HTML não. */
function serveStatic(pathname: string, res: import('node:http').ServerResponse): boolean {
  // normalize + prefixo obrigatório impedem path traversal (../../etc/passwd).
  const candidate = normalize(join(DIST, decodeURIComponent(pathname)))
  if (!candidate.startsWith(DIST)) return false
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return false

  const ext = extname(candidate)
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': candidate.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  createReadStream(candidate).pipe(res)
  return true
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

  handleApiRequest(req, res).then(
    (handled) => {
      if (handled) return
      if (serveStatic(pathname, res)) return

      // SPA: qualquer outra rota devolve o index e o React Router resolve.
      const index = join(DIST, 'index.html')
      if (existsSync(index)) {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' })
        createReadStream(index).pipe(res)
        return
      }
      res.writeHead(404).end('build não encontrado: rode npm run build')
    },
    (error: unknown) => {
      console.error('[server]', error instanceof Error ? error.message : error)
      if (!res.headersSent) res.writeHead(500).end('erro interno')
    },
  )
})

server.listen(PORT, () => {
  console.log(`omniscient em http://localhost:${PORT}`)
  console.log(
    hasDatabaseUrl()
      ? 'cache de servidor: ativo (Postgres)'
      : 'cache de servidor: DESLIGADO — DATABASE_URL ausente, as chamadas vão direto à fonte',
  )
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void closePool().finally(() => process.exit(0))
    })
  })
}
