import { useCallback, useEffect, useRef, useState } from 'react'
import { stockRankingApi } from '../../composition/container'
import type { RankingMode, RateMode, StockRanking } from '../../domain/stock/ranking'
import { BAZIN_REQUIRED_YIELD } from '../../domain/valuation/models/bazin'

/** Retornos exigidos usuais. Conjunto discreto para o cache não virar chave infinita. */
export const DISCOUNT_RATE_OPTIONS = [0.1, 0.12, 0.15, 0.18, 0.2, 0.25] as const

/** Yields exigidos usuais do Bazin. O 6% é o do livro. */
export const REQUIRED_YIELD_OPTIONS = [0.05, 0.06, 0.07, 0.08, 0.1] as const

export interface UseStockRankingResult {
  ranking: StockRanking | null
  /** De onde sai a taxa: CAPM/WACC por ativo, ou a taxa fixa escolhida. */
  rateMode: RateMode
  setRateMode: (mode: RateMode) => void
  discountRate: number
  setDiscountRate: (rate: number) => void
  /** Régua: por setor ou um método fixo para toda a lista. */
  mode: RankingMode
  setMode: (mode: RankingMode) => void
  requiredYield: number
  setRequiredYield: (rate: number) => void
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStockRanking(initialRate = 0.2): UseStockRankingResult {
  const [discountRate, setDiscountRate] = useState(initialRate)
  // Padrão: taxa por ativo. Risco não é o mesmo em toda a bolsa, e uma taxa única
  // premia sistematicamente quem é mais arriscado — que é quem sobe num ranking
  // ordenado por desconto.
  const [rateMode, setRateMode] = useState<RateMode>('capm')
  const [mode, setMode] = useState<RankingMode>('setor')
  const [requiredYield, setRequiredYield] = useState<number>(BAZIN_REQUIRED_YIELD)
  const [ranking, setRanking] = useState<StockRanking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (request: {
      discountRate: number
      mode: RankingMode
      requiredYield: number
      rateMode: RateMode
    }) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller

      setLoading(true)
      setError(null)
      try {
        const next = await stockRankingApi.fetch(request, controller.signal)
        if (!controller.signal.aborted) setRanking(next)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Falha ao carregar o ranking')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load({ discountRate, mode, requiredYield, rateMode })
    return () => requestRef.current?.abort()
  }, [load, discountRate, mode, requiredYield, rateMode])

  const refresh = useCallback(() => {
    void load({ discountRate, mode, requiredYield, rateMode })
  }, [load, discountRate, mode, requiredYield, rateMode])

  return {
    ranking,
    rateMode,
    setRateMode,
    discountRate,
    setDiscountRate,
    mode,
    setMode,
    requiredYield,
    setRequiredYield,
    loading,
    error,
    refresh,
  }
}
