import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortfolioView } from '../../application/portfolio/load-portfolio'
import type { NewPosition } from '../../domain/portfolio/position'
import { loadPortfolio, positionRepository } from '../../composition/container'

// Sem autenticação ainda; quando houver, o id vem da sessão.
const CURRENT_USER_ID = 'local'

export interface UsePortfolioResult {
  view: PortfolioView | null
  loading: boolean
  error: string | null
  refresh: () => void
  addPosition: (position: NewPosition) => Promise<void>
  removePosition: (id: string) => Promise<void>
}

export function usePortfolio(): UsePortfolioResult {
  const [view, setView] = useState<PortfolioView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const next = await loadPortfolio.execute(CURRENT_USER_ID, controller.signal)
      if (!controller.signal.aborted) setView(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar a carteira')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  const addPosition = useCallback(
    async (position: NewPosition) => {
      await positionRepository.add(position)
      await load()
    },
    [load],
  )

  const removePosition = useCallback(
    async (id: string) => {
      await positionRepository.remove(id)
      await load()
    },
    [load],
  )

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { view, loading, error, refresh, addPosition, removePosition }
}
