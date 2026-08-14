import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetType } from '../../domain/asset/type'
import type { UniverseAsset } from '../../domain/asset/universe'
import { universeProvider } from '../../composition/container'

const DEBOUNCE_MS = 260
const PAGE_SIZE = 60

/**
 * Lista o catálogo real da B3 por tipo, com busca opcional.
 *
 * Diferente de `useTickerSearch`, não exige termo: sem busca ele lista o tipo
 * escolhido, para a aba de triagem já abrir com ativos em vez de vazia.
 */
export function useMarketBrowse(type: AssetType | undefined, term: string) {
  const [assets, setAssets] = useState<UniverseAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const run = useCallback(async (assetType: AssetType | undefined, search: string) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const found = await universeProvider.search(
        { type: assetType, search: search === '' ? undefined : search, limit: PAGE_SIZE },
        controller.signal,
      )
      if (!controller.signal.aborted) setAssets(found)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Catálogo indisponível')
        setAssets([])
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const trimmed = term.trim()
    // Busca digitada espera o debounce; troca de filtro responde na hora.
    const delay = trimmed === '' ? 0 : DEBOUNCE_MS
    const timer = setTimeout(() => void run(type, trimmed), delay)
    return () => clearTimeout(timer)
  }, [type, term, run])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { assets, loading, error }
}
