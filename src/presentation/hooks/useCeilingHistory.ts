import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ceilingValuationRepository } from '../../composition/container'
import type { CeilingValuation } from '../../domain/valuation/ceiling-valuation'

export interface UseCeilingHistoryResult {
  /** Do cálculo mais recente para o mais antigo. */
  history: CeilingValuation[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Carrega os preços teto salvos pelo usuário autenticado. A identidade vem do
 * Clerk, então cada conta enxerga apenas os próprios cálculos.
 */
export function useCeilingHistory(): UseCeilingHistoryResult {
  const { isLoaded, userId } = useAuth()
  const [history, setHistory] = useState<CeilingValuation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    requestRef.current?.abort()

    if (userId == null) {
      // Sem usuário resolvido ainda: nada para carregar.
      setHistory([])
      setLoading(!isLoaded)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const next = await ceilingValuationRepository.list(userId, controller.signal)
      if (!controller.signal.aborted) setHistory(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar o histórico')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [userId, isLoaded])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { history, loading, error, refresh }
}
