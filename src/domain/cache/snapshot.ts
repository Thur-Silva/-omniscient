/**
 * Identidade de um recurso externo cacheado.
 *
 * É a chave de throttle e de armazenamento ao mesmo tempo: duas requisições com
 * a mesma chave são a mesma pergunta ao mundo externo, independente de qual
 * usuário perguntou.
 */
export type SourceKey = string

/** Último corpo bem-sucedido devolvido por uma fonte externa. */
export interface DataSnapshot<T = unknown> {
  sourceKey: SourceKey
  payload: T
  upstreamStatus: number
  byteSize: number
  capturedAt: Date
}

/** Como a resposta chegou até quem pediu. */
export type ServeOrigin =
  /** Buscada na fonte agora. */
  | 'upstream'
  /** Snapshot dentro da janela de 10 minutos. */
  | 'cache'
  /** Snapshot vencido, servido porque a fonte falhou ou recusou. */
  | 'stale'

export interface ServedPayload<T = unknown> {
  payload: T
  origin: ServeOrigin
  capturedAt: Date
  /** Preenchido quando `origin` é `stale`: o que deu errado na fonte. */
  staleReason?: string
}
