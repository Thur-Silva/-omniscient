import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetType } from '../../domain/asset/type'
import type { UniverseAsset } from '../../domain/asset/universe'
import { universeProvider } from '../../composition/container'

const DEBOUNCE_MS = 260

/** Busca no catálogo real da brapi, com debounce e cancelamento. */
export function useTickerSearch(term: string, type?: AssetType) {
  const [results, setResults] = useState<UniverseAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (search: string, assetType?: AssetType) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller

      setLoading(true)
      setError(null)
      try {
        const found = await universeProvider.search(
          { search, type: assetType, limit: 12 },
          controller.signal,
        )
        if (!controller.signal.aborted) setResults(found)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Busca indisponível')
          setResults([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      requestRef.current?.abort()
      setResults([])
      setLoading(false)
      return
    }

    const timer = setTimeout(() => void run(trimmed, type), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, type, run])

  useEffect(() => () => requestRef.current?.abort(), [])

  return { results, loading, error }
}
