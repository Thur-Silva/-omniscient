import type { FetchAttempt } from './fetch-window'
import type { DataSnapshot, SourceKey } from './snapshot'

export interface SnapshotRepository {
  find(key: SourceKey): Promise<DataSnapshot | null>
  save(snapshot: Omit<DataSnapshot, 'capturedAt'>): Promise<DataSnapshot>
}

export interface FetchLogRepository {
  find(key: SourceKey): Promise<FetchAttempt | null>

  /**
   * Tenta reservar o direito de ir à fonte agora.
   *
   * Precisa ser atômico: sem isso, dois usuários chegando juntos veriam o cache
   * vencido ao mesmo tempo e os dois chamariam a API, que é justamente o consumo
   * de cota que se quer evitar. Devolve `false` quando outra requisição já
   * reservou a janela.
   */
  claimFetchSlot(key: SourceKey, windowMs: number): Promise<boolean>

  recordSuccess(key: SourceKey, status: number): Promise<void>
  recordFailure(key: SourceKey, status: number | null): Promise<void>
}
