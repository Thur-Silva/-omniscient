import type { Pool } from 'pg'
import type { FetchLogRepository } from '../../../src/domain/cache/repository'
import type { FetchAttempt } from '../../../src/domain/cache/fetch-window'
import type { SourceKey } from '../../../src/domain/cache/snapshot'

interface FetchLogRow {
  last_attempt_at: Date
  last_success_at: Date | null
  consecutive_failures: number
}

export class PostgresFetchLogRepository implements FetchLogRepository {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async find(key: SourceKey): Promise<FetchAttempt | null> {
    const { rows } = await this.pool.query<FetchLogRow>(
      'select last_attempt_at, last_success_at, consecutive_failures from api_fetch_log where source_key = $1',
      [key],
    )
    const row = rows[0]
    return row
      ? {
          lastAttemptAt: row.last_attempt_at,
          lastSuccessAt: row.last_success_at,
          consecutiveFailures: row.consecutive_failures,
        }
      : null
  }

  /**
   * Reserva a janela num único comando, sem ler-depois-escrever.
   *
   * O `where` no `do update` é o que torna isso atômico: o Postgres só atualiza
   * (e só devolve linha) se a última tentativa já passou da janela. Dois pedidos
   * simultâneos disputam a mesma linha e apenas um recebe `returning`, então
   * apenas um vai à fonte.
   */
  async claimFetchSlot(key: SourceKey, windowMs: number): Promise<boolean> {
    const { rows } = await this.pool.query(
      `insert into api_fetch_log (source_key, last_attempt_at, upstream_calls)
       values ($1, now(), 1)
       on conflict (source_key) do update
         set last_attempt_at = now(),
             upstream_calls  = api_fetch_log.upstream_calls + 1
         where api_fetch_log.last_attempt_at < now() - make_interval(secs => $2::double precision)
       returning source_key`,
      [key, windowMs / 1000],
    )
    return rows.length > 0
  }

  async recordSuccess(key: SourceKey, status: number): Promise<void> {
    await this.pool.query(
      `update api_fetch_log
          set last_success_at      = now(),
              last_status          = $2,
              consecutive_failures = 0
        where source_key = $1`,
      [key, status],
    )
  }

  async recordFailure(key: SourceKey, status: number | null): Promise<void> {
    await this.pool.query(
      `update api_fetch_log
          set last_status          = $2,
              consecutive_failures = api_fetch_log.consecutive_failures + 1
        where source_key = $1`,
      [key, status],
    )
  }

  /** Contadores de observabilidade; falha aqui não pode derrubar a resposta. */
  async countServe(key: SourceKey, origin: 'cache' | 'stale'): Promise<void> {
    const column = origin === 'cache' ? 'cache_hits' : 'stale_hits'
    await this.pool
      .query(`update api_fetch_log set ${column} = ${column} + 1 where source_key = $1`, [key])
      .catch(() => undefined)
  }
}
