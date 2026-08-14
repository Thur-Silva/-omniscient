import type { Plugin } from 'vite'
import { handleApiRequest } from './api/router'

/**
 * Monta as rotas de API no dev server do Vite.
 *
 * Substitui os proxies de `server.proxy` porque agora a chamada passa pelo cache
 * no Postgres antes de sair para a internet — proxy puro não consegue fazer isso.
 * O mesmo handler roda em produção em `server/index.ts`, então dev e produção não
 * divergem.
 */
export function apiCachePlugin(env: Record<string, string>): Plugin {
  return {
    name: 'omniscient:api-cache',
    configureServer(server) {
      // `pre` para responder antes do middleware de SPA fallback.
      server.middlewares.use((req, res, next) => {
        handleApiRequest(req, res, { ...process.env, ...env }).then(
          (handled) => {
            if (!handled) next()
          },
          (error: unknown) => {
            server.config.logger.error(
              `[api-cache] ${error instanceof Error ? error.message : String(error)}`,
            )
            if (!res.headersSent) {
              res.statusCode = 500
              res.end('{"error":true,"message":"falha interna no proxy de API"}')
            }
          },
        )
      })
    },
  }
}
