import type { Plugin } from 'vite'
import { handleApiRequest } from './api/router'
import { hasDatabaseUrl } from './infra/db/client'

/**
 * Monta as rotas de API no dev server do Vite.
 *
 * Substitui os proxies de `server.proxy` porque a chamada passa pelo cache no
 * Postgres antes de sair para a internet — proxy puro não consegue fazer isso. O
 * mesmo handler roda em produção em `server/index.ts`, então dev e produção não
 * divergem.
 */
export function apiCachePlugin(env: Record<string, string>): Plugin {
  return {
    name: 'omniscient:api-cache',
    configureServer(server) {
      /**
       * `loadEnv` devolve um objeto e **não** popula `process.env`.
       *
       * Os módulos de servidor leem `process.env`, como em produção, onde
       * `tsx --env-file=.env` faz isso. Sem esta hidratação o cliente de banco não
       * via DATABASE_URL, o cache ficava desligado só em dev e as respostas saíam
       * com `X-Cache: bypass` sem gravar nada no banco.
       */
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }

      // Log depois da hidratação: é o estado real do cache, não o que está no
      // arquivo. Antes o aviso olhava o .env e mentia quando a leitura falhava.
      server.config.logger.info(
        hasDatabaseUrl()
          ? '[api-cache] cache de servidor ativo (Postgres), janela de 10 min por recurso'
          : '[api-cache] DATABASE_URL ausente — chamadas vão direto à fonte, sem cache (X-Cache: bypass)',
      )

      server.middlewares.use((req, res, next) => {
        handleApiRequest(req, res).then(
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
