import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScreeningResult } from '../../application/screener/screen-watchlist'
import { createUserServices } from '../../composition/container'
import type { NewWatchlistItem } from '../../domain/watchlist/item'

export interface UseScreenerResult {
  result: ScreeningResult | null
  loading: boolean
  error: string | null
  refresh: () => void
  addToWatchlist: (item: NewWatchlistItem) => Promise<void>
  updateItem: (id: string, patch: Partial<NewWatchlistItem>) => Promise<void>
  removeItem: (id: string) => Promise<void>
}

export function useScreener(): UseScreenerResult {
  const { isLoaded, userId } = useAuth()
  const [result, setResult] = useState<ScreeningResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const services = useMemo(() => (userId ? createUserServices(userId) : null), [userId])

  const load = useCallback(async () => {
    requestRef.current?.abort()

    if (services == null) {
      setResult(null)
      setLoading(!isLoaded)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const next = await services.screenWatchlist.execute(controller.signal)
      if (!controller.signal.aborted) setResult(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar a triagem')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [services, isLoaded])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  const addToWatchlist = useCallback(
    async (item: NewWatchlistItem) => {
      if (services == null) throw new Error('É preciso estar autenticado')
      await services.watchlistRepository.add(item)
      await load()
    },
    [services, load],
  )

  const updateItem = useCallback(
    async (id: string, patch: Partial<NewWatchlistItem>) => {
      if (services == null) return
      await services.watchlistRepository.update(id, patch)
      await load()
    },
    [services, load],
  )

  const removeItem = useCallback(
    async (id: string) => {
      if (services == null) return
      await services.watchlistRepository.remove(id)
      await load()
    },
    [services, load],
  )

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { result, loading, error, refresh, addToWatchlist, updateItem, removeItem }
}
