import { FETCH_WINDOW_MS } from '../../src/domain/cache/fetch-window'
import type { FetchLogRepository, SnapshotRepository } from '../../src/domain/cache/repository'
import type { ServedPayload, SourceKey } from '../../src/domain/cache/snapshot'

export interface UpstreamResult {
  status: number
  payload: unknown
  /** `false` para status fora de 2xx: não vira snapshot. */
  ok: boolean
}

export type UpstreamCall = () => Promise<UpstreamResult>

export class UpstreamUnavailableError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'UpstreamUnavailableError'
    this.status = status
  }
}

/**
 * Uma ida à fonte externa por chave a cada 10 minutos, para todos os usuários,
 * com o último resultado guardado como rede de segurança.
 *
 * A ordem das decisões é o coração da coisa:
 *
 * 1. Tenta reservar a janela. Se não conseguir, alguém buscou nos últimos 10
 *    minutos (ou está buscando agora) — serve o snapshot.
 * 2. Reservou: chama a fonte. Deu 2xx, grava o snapshot e serve fresco.
 * 3. A fonte falhou ou recusou (limite, 5xx, rede): serve o último snapshot
 *    marcado como `stale`. É exatamente o caso "estourou o limite".
 * 4. Falhou e não há snapshot nenhum: aí sim propaga o erro, porque não existe
 *    resposta a dar.
 */
export class CachedUpstreamFetch {
  private readonly snapshots: SnapshotRepository
  private readonly log: FetchLogRepository
  private readonly windowMs: number
  /**
   * Pedidos idênticos em voo neste processo.
   *
   * A reserva no banco resolve a janela entre instâncias, mas não o cache frio:
   * sem snapshot ainda gravado, quem perde a reserva não tem o que servir e
   * acabaria indo à fonte também. Com N usuários chegando juntos no primeiro
   * acesso isso viraria N chamadas — exatamente o consumo de cota que se quer
   * evitar. Aqui todos esperam a mesma promessa.
   */
  private readonly inFlight = new Map<SourceKey, Promise<ServedPayload>>()

  constructor(
    snapshots: SnapshotRepository,
    log: FetchLogRepository,
    windowMs: number = FETCH_WINDOW_MS,
  ) {
    this.snapshots = snapshots
    this.log = log
    this.windowMs = windowMs
  }

  fetch(key: SourceKey, call: UpstreamCall): Promise<ServedPayload> {
    const existing = this.inFlight.get(key)
    if (existing) return existing

    const pending = this.resolve(key, call)
    this.inFlight.set(key, pending)
    // Limpa a entrada quando terminar, sem alterar o resultado nem engolir erro.
    void pending.then(
      () => this.inFlight.delete(key),
      () => this.inFlight.delete(key),
    )
    return pending
  }

  private async resolve(key: SourceKey, call: UpstreamCall): Promise<ServedPayload> {
    const claimed = await this.log.claimFetchSlot(key, this.windowMs)

    if (!claimed) {
      const cached = await this.snapshots.find(key)
      if (cached) {
        return { payload: cached.payload, origin: 'cache', capturedAt: cached.capturedAt }
      }
      // Janela reservada por outra requisição que ainda não gravou nada. Sem
      // snapshot para servir, o jeito é ir à fonte — é raro e só no primeiro uso.
    }

    let failure: string
    let failureStatus: number | null = null
    try {
      const result = await call()
      if (result.ok) {
        const saved = await this.snapshots.save({
          sourceKey: key,
          payload: result.payload,
          upstreamStatus: result.status,
          byteSize: Buffer.byteLength(JSON.stringify(result.payload) ?? ''),
        })
        await this.log.recordSuccess(key, result.status)
        return { payload: saved.payload, origin: 'upstream', capturedAt: saved.capturedAt }
      }
      failureStatus = result.status
      failure = `a fonte respondeu ${result.status}`
    } catch (error) {
      failure = error instanceof Error ? error.message : 'falha de rede'
    }

    await this.log.recordFailure(key, failureStatus)

    const fallback = await this.snapshots.find(key)
    if (fallback) {
      return {
        payload: fallback.payload,
        origin: 'stale',
        capturedAt: fallback.capturedAt,
        staleReason: failure,
      }
    }

    throw new UpstreamUnavailableError(
      `${failure} e não há snapshot guardado para ${key}`,
      failureStatus ?? 502,
    )
  }
}
