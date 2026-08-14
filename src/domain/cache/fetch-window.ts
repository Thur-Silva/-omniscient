/**
 * Janela mínima entre duas idas à mesma fonte externa.
 *
 * A janela é global por chave, não por usuário: se um usuário buscou os
 * fundamentos há dois minutos, todos os outros leem o mesmo snapshot até a janela
 * expirar. É o que impede N usuários de consumirem N vezes a cota da API.
 */
export const FETCH_WINDOW_MS = 10 * 60 * 1000

export interface FetchAttempt {
  lastAttemptAt: Date
  lastSuccessAt: Date | null
  consecutiveFailures: number
}

/** Quanto falta para a fonte poder ser consultada de novo. */
export function millisecondsUntilNextFetch(attempt: FetchAttempt | null, now: Date): number {
  if (attempt == null) return 0
  const elapsed = now.getTime() - attempt.lastAttemptAt.getTime()
  return Math.max(0, FETCH_WINDOW_MS - elapsed)
}

export function isWithinWindow(attempt: FetchAttempt | null, now: Date): boolean {
  return millisecondsUntilNextFetch(attempt, now) > 0
}
