import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PortfolioView } from '../../application/portfolio/load-portfolio'
import { createPortfolioServices } from '../../composition/container'
import type { NewPosition } from '../../domain/portfolio/position'

export interface UsePortfolioResult {
  view: PortfolioView | null
  loading: boolean
  error: string | null
  refresh: () => void
  addPosition: (position: NewPosition) => Promise<void>
  removePosition: (id: string) => Promise<void>
}

/**
 * Carrega a carteira do usuário autenticado. A identidade vem do Clerk, então
 * cada conta enxerga apenas as suas posições.
 */
export function usePortfolio(): UsePortfolioResult {
  const { isLoaded, userId } = useAuth()
  const [view, setView] = useState<PortfolioView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  // Recria os serviços quando o usuário muda, para não vazar a carteira de uma
  // conta para outra ao trocar de sessão no mesmo navegador.
  const services = useMemo(() => (userId ? createPortfolioServices(userId) : null), [userId])

  const load = useCallback(async () => {
    requestRef.current?.abort()

    if (services == null || userId == null) {
      // Sem usuário resolvido ainda: nada para carregar.
      setView(null)
      setLoading(!isLoaded)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const next = await services.loadPortfolio.execute(userId, controller.signal)
      if (!controller.signal.aborted) setView(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar a carteira')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [services, userId, isLoaded])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  const addPosition = useCallback(
    async (position: NewPosition) => {
      if (services == null) throw new Error('É preciso estar autenticado para adicionar posições')
      await services.positionRepository.add(position)
      await load()
    },
    [services, load],
  )

  const removePosition = useCallback(
    async (id: string) => {
      if (services == null) return
      await services.positionRepository.remove(id)
      await load()
    },
    [services, load],
  )

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { view, loading, error, refresh, addPosition, removePosition }
}
