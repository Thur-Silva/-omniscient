import { useCallback, useEffect, useRef, useState } from 'react'
import type { OpportunityReport } from '../../application/fii/find-opportunities'
import { findFiiOpportunities } from '../../composition/container'

export interface UseFiiOpportunitiesResult {
  report: OpportunityReport | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFiiOpportunities(): UseFiiOpportunitiesResult {
  const [report, setReport] = useState<OpportunityReport | null>(null)
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
      const next = await findFiiOpportunities.execute(controller.signal)
      if (!controller.signal.aborted) setReport(next)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar os fundamentos')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => requestRef.current?.abort()
  }, [load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { report, loading, error, refresh }
}
