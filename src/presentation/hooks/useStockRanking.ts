import { useCallback, useEffect, useRef, useState } from 'react'
import { stockRankingApi } from '../../composition/container'
import type { StockRanking } from '../../domain/stock/ranking'

/** Retornos exigidos usuais. Conjunto discreto para o cache não virar chave infinita. */
export const DISCOUNT_RATE_OPTIONS = [0.1, 0.12, 0.15, 0.18, 0.2, 0.25] as const

export interface UseStockRankingResult {
  ranking: StockRanking | null
  discountRate: number
  setDiscountRate: (rate: number) => void
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStockRanking(initialRate = 0.2): UseStockRankingResult {
  const [discountRate, setDiscountRate] = useState(initialRate)
  const [ranking, setRanking] = useState<StockRanking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async (rate: number) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const next = await stockRankingApi.fetch(rate, controller.signal)
      if (!controller.signal.aborted) setRanking(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar o ranking')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(discountRate)
    return () => requestRef.current?.abort()
  }, [load, discountRate])

  const refresh = useCallback(() => {
    void load(discountRate)
  }, [load, discountRate])

  return { ranking, discountRate, setDiscountRate, loading, error, refresh }
}
