import type { IncomingMessage, ServerResponse } from 'node:http'
import { CachedUpstreamFetch, UpstreamUnavailableError } from '../application/cached-upstream-fetch'
import { getPool, hasDatabaseUrl } from '../infra/db/client'
import { PostgresFetchLogRepository } from '../infra/db/fetch-log-repository'
import { PostgresSnapshotRepository } from '../infra/db/snapshot-repository'
import { RankStocks } from '../application/rank-stocks'
import {
  buildSourceKey,
  buildUpstreamUrl,
  matchUpstream,
  type UpstreamConfig,
} from './upstreams'

let cached: CachedUpstreamFetch | null = null
let fetchLog: PostgresFetchLogRepository | null = null

function services(): { cache: CachedUpstreamFetch; log: PostgresFetchLogRepository } | null {
  if (!hasDatabaseUrl()) return null
  if (cached == null || fetchLog == null) {
    const pool = getPool()
    fetchLog = new PostgresFetchLogRepository(pool)
    cached = new CachedUpstreamFetch(new PostgresSnapshotRepository(pool), fetchLog)
  }
  return { cache: cached, log: fetchLog }
}

async function callUpstream(upstream: UpstreamConfig, url: string, env: NodeJS.ProcessEnv) {
  const response = await fetch(url, {
    headers: upstream.headers(env),
    signal: AbortSignal.timeout(upstream.timeoutMs),
  })
  const text = await response.text()
  let payload: unknown = text
  try {
    payload = JSON.parse(text)
  } catch {
    // Corpo não-JSON só interessa como diagnóstico de erro.
  }
  return { status: response.status, payload, ok: response.ok }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(text)
}

export const STOCK_RANKING_PATH = '/api/ranking/acoes'

/**
 * Ranking de ações. O cálculo e a gravação no banco moram no servidor, então o
 * browser recebe a lista pronta e não recalcula nada.
 */
async function handleStockRanking(
  parsed: URL,
  res: ServerResponse,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  // k chega em pontos percentuais; o domínio normaliza e limita a faixa.
  const raw = Number(parsed.searchParams.get('k') ?? '20')
  const requested = Number.isFinite(raw) ? raw / 100 : 0.2

  try {
    const served = await new RankStocks(services()?.cache ?? null, env).execute(requested)
    sendJson(res, 200, served.ranking, {
      'X-Cache': served.origin === 'upstream' ? 'miss' : served.origin === 'cache' ? 'hit' : 'stale',
      'X-Captured-At': served.capturedAt.toISOString(),
      ...(served.staleReason ? { 'X-Stale-Reason': served.staleReason } : {}),
    })
  } catch (error) {
    const status = error instanceof UpstreamUnavailableError ? error.status : 502
    sendJson(res, status === 200 ? 502 : status, {
      error: true,
      message: error instanceof Error ? error.message : 'falha ao montar o ranking',
    })
  }
}

/**
 * Encaminha as chamadas de API pelo cache de servidor.
 *
 * Devolve `true` quando tratou a requisição. Sem DATABASE_URL o proxy continua
 * funcionando, só sem cache nem throttle — a aplicação não deve parar de
 * funcionar por causa de configuração de banco ausente.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const rawUrl = req.url ?? '/'
  const parsed = new URL(rawUrl, 'http://localhost')

  // Rota computada: sai antes do proxy porque não há upstream 1-para-1.
  if (parsed.pathname === STOCK_RANKING_PATH) {
    await handleStockRanking(parsed, res, env)
    return true
  }

  const upstream = matchUpstream(parsed.pathname)
  if (upstream == null) return false

  const url = buildUpstreamUrl(upstream, parsed.pathname, parsed.search)
  const key = buildSourceKey(upstream, parsed.pathname, parsed.search)
  const registry = services()

  // Sem banco: passa direto, avisando no cabeçalho.
  if (registry == null) {
    try {
      const result = await callUpstream(upstream, url, env)
      sendJson(res, result.status, result.payload, { 'X-Cache': 'bypass' })
    } catch (error) {
      sendJson(res, 502, {
        error: true,
        message: error instanceof Error ? error.message : 'falha ao falar com a fonte',
      })
    }
    return true
  }

  try {
    const served = await registry.cache.fetch(key, () => callUpstream(upstream, url, env))

    if (served.origin !== 'upstream') {
      void registry.log.countServe(key, served.origin)
    }

    sendJson(res, 200, served.payload, {
      'X-Cache': served.origin === 'upstream' ? 'miss' : served.origin === 'cache' ? 'hit' : 'stale',
      'X-Captured-At': served.capturedAt.toISOString(),
      ...(served.staleReason ? { 'X-Stale-Reason': served.staleReason } : {}),
    })
  } catch (error) {
    const status = error instanceof UpstreamUnavailableError ? error.status : 502
    sendJson(res, status === 200 ? 502 : status, {
      error: true,
      message: error instanceof Error ? error.message : 'falha ao falar com a fonte',
    })
  }
  return true
}
