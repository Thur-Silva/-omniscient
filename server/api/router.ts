import type { IncomingMessage, ServerResponse } from 'node:http'
import { CachedUpstreamFetch, UpstreamUnavailableError } from '../application/cached-upstream-fetch'
import { getPool, hasDatabaseUrl } from '../infra/db/client'
import { PostgresCeilingValuationRepository } from '../infra/db/ceiling-valuation'
import { PostgresFetchLogRepository } from '../infra/db/fetch-log-repository'
import { PostgresSnapshotRepository } from '../infra/db/snapshot-repository'
import { RankStocks } from '../application/rank-stocks'
import type { CeilingValuation } from '../../src/domain/valuation/ceiling-valuation'
import { CEILING_METHOD_IDS } from '../../src/domain/valuation/methods'
import type { RankingMode } from '../../src/domain/stock/ranking'
import {
  buildSourceKey,
  buildUpstreamUrl,
  matchUpstream,
  type UpstreamConfig,
} from './upstreams'

let cached: CachedUpstreamFetch | null = null
let fetchLog: PostgresFetchLogRepository | null = null
let ceilings: PostgresCeilingValuationRepository | null = null

function services(): {
  cache: CachedUpstreamFetch
  log: PostgresFetchLogRepository
  ceilings: PostgresCeilingValuationRepository
} | null {
  if (!hasDatabaseUrl()) return null
  if (cached == null || fetchLog == null || ceilings == null) {
    const pool = getPool()
    fetchLog = new PostgresFetchLogRepository(pool)
    cached = new CachedUpstreamFetch(new PostgresSnapshotRepository(pool), fetchLog)
    ceilings = new PostgresCeilingValuationRepository(pool)
  }
  return { cache: cached, log: fetchLog, ceilings }
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
export const CEILING_PATH = '/api/ceiling'

/** Formato de um uuid, para validar ids de cálculo antes da query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lê o corpo JSON da requisição, com limite de tamanho. */
async function readJsonBody(req: IncomingMessage, limitBytes = 256 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limitBytes) {
      throw new Error('Corpo da requisição maior que o limite de 256 KB.')
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

class CeilingInputError extends Error {}

/**
 * Valida o corpo de save antes de tocar no banco.
 *
 * O shape completo (premissas, memória de cálculo) é definido pelas interfaces
 * de domínio e validado pelo próprio modelo na tela; aqui basta conferir a
 * forma e os invariantes das colunas normalizadas.
 */
function parseCeilingInput(body: unknown): Omit<CeilingValuation, 'id' | 'createdAt'> {
  if (typeof body !== 'object' || body === null) {
    throw new CeilingInputError('Corpo precisa ser um objeto JSON.')
  }
  const record = body as Record<string, unknown>

  const userId = record.userId
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new CeilingInputError('userId é obrigatório.')
  }
  const ticker = record.ticker
  if (typeof ticker !== 'string' || ticker.trim() === '') {
    throw new CeilingInputError('ticker é obrigatório.')
  }
  const ceilingPrice = record.ceilingPrice
  if (typeof ceilingPrice !== 'number' || !Number.isFinite(ceilingPrice) || ceilingPrice <= 0) {
    throw new CeilingInputError('ceilingPrice precisa ser um número positivo.')
  }
  const marketPrice = record.marketPrice
  if (
    marketPrice != null &&
    (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0)
  ) {
    throw new CeilingInputError('marketPrice precisa ser um número positivo ou null.')
  }
  const safetyMargin = record.safetyMargin
  if (
    safetyMargin != null &&
    (typeof safetyMargin !== 'number' || !Number.isFinite(safetyMargin) || safetyMargin >= 1)
  ) {
    throw new CeilingInputError('safetyMargin precisa ser menor que 1 ou null.')
  }
  if (typeof record.assumptions !== 'object' || record.assumptions === null) {
    throw new CeilingInputError('assumptions é obrigatório.')
  }
  if (typeof record.breakdown !== 'object' || record.breakdown === null) {
    throw new CeilingInputError('breakdown é obrigatório.')
  }
  // A coluna tem check de lista fechada: método fora do catálogo viraria erro do
  // Postgres e 500. Melhor recusar aqui, dizendo o que é aceito.
  const method = record.method
  if (typeof method !== 'string' || !(CEILING_METHOD_IDS as string[]).includes(method)) {
    throw new CeilingInputError(`method precisa ser um de: ${CEILING_METHOD_IDS.join(', ')}.`)
  }

  return {
    userId,
    ticker,
    marketPrice: marketPrice == null ? null : Number(marketPrice),
    ceilingPrice,
    safetyMargin: safetyMargin == null ? null : Number(safetyMargin),
    method: method as CeilingValuation['method'],
    assumptions: record.assumptions as CeilingValuation['assumptions'],
    breakdown: record.breakdown as CeilingValuation['breakdown'],
  }
}

async function handleCeilingSave(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const registry = services()
  if (registry == null) {
    sendJson(res, 503, {
      error: true,
      message: 'Banco indisponível: DATABASE_URL ausente.',
    })
    return
  }

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, {
      error: true,
      message: error instanceof Error ? error.message : 'Corpo JSON inválido.',
    })
    return
  }

  let record: Omit<CeilingValuation, 'id' | 'createdAt'>
  try {
    record = parseCeilingInput(body)
  } catch (error) {
    sendJson(res, 400, {
      error: true,
      message: error instanceof CeilingInputError ? error.message : 'Cálculo inválido.',
    })
    return
  }

  try {
    const saved = await registry.ceilings.save(record)
    sendJson(res, 201, saved)
  } catch (error) {
    sendJson(res, 500, {
      error: true,
      message: error instanceof Error ? error.message : 'Falha ao salvar o cálculo.',
    })
  }
}

async function handleCeilingList(parsed: URL, res: ServerResponse): Promise<void> {
  const registry = services()
  if (registry == null) {
    sendJson(res, 503, {
      error: true,
      message: 'Banco indisponível: DATABASE_URL ausente.',
    })
    return
  }

  const userId = parsed.searchParams.get('user') ?? ''
  if (userId.trim() === '') {
    sendJson(res, 400, { error: true, message: 'Parâmetro user é obrigatório.' })
    return
  }

  try {
    const history = await registry.ceilings.list(userId)
    sendJson(res, 200, history)
  } catch (error) {
    sendJson(res, 500, {
      error: true,
      message: error instanceof Error ? error.message : 'Falha ao ler o histórico.',
    })
  }
}

async function handleCeilingGet(parsed: URL, res: ServerResponse, id: string): Promise<void> {
  const registry = services()
  if (registry == null) {
    sendJson(res, 503, {
      error: true,
      message: 'Banco indisponível: DATABASE_URL ausente.',
    })
    return
  }

  const userId = parsed.searchParams.get('user') ?? ''
  if (userId.trim() === '') {
    sendJson(res, 400, { error: true, message: 'Parâmetro user é obrigatório.' })
    return
  }

  try {
    const record = await registry.ceilings.get(id, userId)
    if (record == null) {
      sendJson(res, 404, { error: true, message: 'Cálculo não encontrado.' })
      return
    }
    sendJson(res, 200, record)
  } catch (error) {
    sendJson(res, 500, {
      error: true,
      message: error instanceof Error ? error.message : 'Falha ao ler o cálculo.',
    })
  }
}

/**
 * Ranking de ações. O cálculo e a gravação no banco moram no servidor, então o
 * browser recebe a lista pronta e não recalcula nada.
 */
async function handleStockRanking(
  parsed: URL,
  res: ServerResponse,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  // k e dy chegam em pontos percentuais; o domínio normaliza e limita a faixa.
  const raw = Number(parsed.searchParams.get('k') ?? '20')
  const discountRate = Number.isFinite(raw) ? raw / 100 : 0.2
  const rawYield = Number(parsed.searchParams.get('dy') ?? '6')
  const requiredYield = Number.isFinite(rawYield) ? rawYield / 100 : 0.06

  // Régua: `setor` (padrão) ou um método fixo. Valor desconhecido volta ao padrão
  // em vez de virar chave nova no banco.
  const rawMode = parsed.searchParams.get('m') ?? 'setor'
  const mode: RankingMode =
    rawMode === 'setor' || (CEILING_METHOD_IDS as string[]).includes(rawMode)
      ? (rawMode as RankingMode)
      : 'setor'

  try {
    const served = await new RankStocks(services()?.cache ?? null, env).execute({
      discountRate,
      mode,
      requiredYield,
    })
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

  // Histórico de preços teto por usuário.
  if (parsed.pathname === CEILING_PATH) {
    if (req.method === 'POST') {
      await handleCeilingSave(req, res)
      return true
    }
    if (req.method === 'GET') {
      await handleCeilingList(parsed, res)
      return true
    }
    sendJson(res, 405, { error: true, message: 'Método não permitido.' })
    return true
  }

  // Um cálculo salvo específico (`/api/ceiling/:id`), para a calculadora abrir
  // com as premissas exatas daquele save em vez de buscar a fonte de novo.
  if (parsed.pathname.startsWith(`${CEILING_PATH}/`)) {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: true, message: 'Método não permitido.' })
      return true
    }
    const id = decodeURIComponent(parsed.pathname.slice(CEILING_PATH.length + 1))
    // A coluna é uuid: um id fora do formato quebraria a query no Postgres
    // (invalid input syntax) e viraria 500 — melhor devolver 404 antes.
    if (id === '' || id.includes('/') || !UUID_RE.test(id)) {
      sendJson(res, 404, { error: true, message: 'Cálculo não encontrado.' })
      return true
    }
    await handleCeilingGet(parsed, res, id)
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
