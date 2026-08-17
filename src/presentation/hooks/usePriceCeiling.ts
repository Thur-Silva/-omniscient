import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CeilingAssumptions,
  CeilingResult,
  PrefilledCeiling,
} from '../../application/stock/price-ceiling'
import { estimatePriceCeiling } from '../../composition/container'
import type { StockFundamentals } from '../../domain/stock/fundamentals'
import { ValuationError } from '../../domain/errors/valuation-error'

const DEBOUNCE_MS = 260

/** Campos como o usuário digita: texto, para não atropelar a digitação. */
export interface CeilingForm {
  /** Em bilhões de reais, como no documento. */
  netIncome: string
  /** Em pontos percentuais. */
  payout: string
  returnOnEquity: string
  discountRate: string
  /** Absoluto. */
  sharesOutstanding: string
  /** g do ano 1, em pontos percentuais. Vazio → ROE × (1 − payout). */
  growth1: string
  /** g do ano 2, em pontos percentuais. Vazio → ROE × (1 − payout). */
  growth2: string
  /** g do ano 3, em pontos percentuais. Vazio → ROE × (1 − payout). */
  growth3: string
  /** g pedido para a perpetuidade, em pontos percentuais. O modelo limita em 3%. */
  perpetualGrowth: string
}

/** Campos obrigatórios (os de crescimento são opcionais, o modelo deriva). */
export type CeilingRequiredField =
  | 'netIncome'
  | 'payout'
  | 'returnOnEquity'
  | 'discountRate'
  | 'sharesOutstanding'

/** Rótulos das premissas, para dizer o que falta em português corrido. */
const FIELD_LABELS: Record<CeilingRequiredField, string> = {
  netIncome: 'lucro líquido',
  payout: 'payout',
  returnOnEquity: 'ROE',
  discountRate: 'taxa de desconto',
  sharesOutstanding: 'número de ações',
}

const EMPTY_FORM: CeilingForm = {
  netIncome: '',
  payout: '',
  returnOnEquity: '',
  discountRate: '',
  sharesOutstanding: '',
  growth1: '',
  growth2: '',
  growth3: '',
  perpetualGrowth: '',
}

/** Campos opcionais de crescimento: vazios deixam o modelo derivar. */
const GROWTH_FIELDS: { field: keyof CeilingForm; label: string }[] = [
  { field: 'growth1', label: 'crescimento do ano 1' },
  { field: 'growth2', label: 'crescimento do ano 2' },
  { field: 'growth3', label: 'crescimento do ano 3' },
  { field: 'perpetualGrowth', label: 'crescimento perpétuo' },
]

/**
 * Campos de g deriváveis de ROE × (1 − payout). O usuário pode sobrescrever
 * qualquer um deles; quem não foi sobrescrito acompanha o derivado quando ROE
 * ou payout mudam.
 */
const DERIVED_GROWTH_FIELDS = ['growth1', 'growth2', 'growth3'] as const

/**
 * O g derivado de ROE × (1 − payout), no mesmo formato de preenchimento dos
 * campos. Devolve `null` quando ROE ou payout ainda não são números legíveis.
 */
function derivedGrowthText(roeRaw: string, payoutRaw: string): string | null {
  const roe = parseDecimal(roeRaw)
  const payout = parseDecimal(payoutRaw)
  if (roe == null || payout == null) return null
  const growth = (roe / 100) * (1 - payout / 100)
  return String(Number((growth * 100).toFixed(2)))
}

/**
 * Aceita vírgula como separador decimal: a interface é pt-BR e digitar "20,5"
 * é o gesto natural aqui.
 */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * Arredonda o prefill para casas legíveis.
 *
 * O campo é a fonte da verdade do cálculo, então o que aparece é exatamente o que
 * é computado: exibir `20,5746` e calcular com isso polui a tela sem ganho de
 * precisão real, dado que o dado de origem já é uma estimativa.
 */
function toForm(assumptions: CeilingAssumptions): CeilingForm {
  const pct = (value: number | null) =>
    value == null ? '' : String(Number((value * 100).toFixed(2)))
  const growthPct = (value: number | null | undefined) =>
    value == null ? '' : String(Number((value * 100).toFixed(2)))
  const [growth1, growth2, growth3] = assumptions.growthRates ?? []
  return {
    netIncome: assumptions.netIncome == null ? '' : String(Number((assumptions.netIncome / 1e9).toFixed(3))),
    payout: pct(assumptions.payout),
    returnOnEquity: pct(assumptions.returnOnEquity),
    discountRate: pct(assumptions.discountRate),
    sharesOutstanding:
      assumptions.sharesOutstanding == null ? '' : String(Math.round(assumptions.sharesOutstanding)),
    growth1: growthPct(growth1),
    growth2: growthPct(growth2),
    growth3: growthPct(growth3),
    perpetualGrowth: growthPct(assumptions.perpetualGrowth),
  }
}

function toAssumptions(form: CeilingForm): CeilingAssumptions {
  const billions = parseDecimal(form.netIncome)
  const pct = (raw: string) => {
    const value = parseDecimal(raw)
    return value == null ? null : value / 100
  }
  return {
    netIncome: billions == null ? null : billions * 1e9,
    payout: pct(form.payout),
    returnOnEquity: pct(form.returnOnEquity),
    discountRate: pct(form.discountRate),
    sharesOutstanding: parseDecimal(form.sharesOutstanding),
    growthRates: [pct(form.growth1), pct(form.growth2), pct(form.growth3)],
    perpetualGrowth: pct(form.perpetualGrowth),
  }
}

export interface UsePriceCeilingResult {
  term: string
  setTerm: (value: string) => void
  results: StockFundamentals[]
  searching: boolean
  selected: PrefilledCeiling | null
  form: CeilingForm
  setField: (field: keyof CeilingForm, value: string) => void
  select: (ticker: string) => Promise<void>
  clear: () => void
  /** Volta as premissas ao que a fonte trouxe. */
  reset: () => void
  result: CeilingResult | null
  /**
   * Campos vazios agora. Diferente de `selected.missing`, que diz o que a fonte
   * não trouxe: aqui é o estado atual do formulário, então apagar um campo
   * preenchido pela fonte também conta.
   */
  pending: string[]
  /** Erro de premissa inválida, vindo do domínio. */
  validation: string | null
  loading: boolean
  error: string | null
}

export function usePriceCeiling(): UsePriceCeilingResult {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<StockFundamentals[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PrefilledCeiling | null>(null)
  const [form, setForm] = useState<CeilingForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<AbortController | null>(null)
  const selectRef = useRef<AbortController | null>(null)
  /** Anos cujo g o usuário digitou à mão: esses não acompanham ROE × (1 − payout). */
  const manualGrowth = useRef<Set<keyof CeilingForm>>(new Set())

  useEffect(() => {
    const needle = term.trim()
    if (needle.length < 2) {
      searchRef.current?.abort()
      setResults([])
      setSearching(false)
      return
    }

    const timer = setTimeout(() => {
      searchRef.current?.abort()
      const controller = new AbortController()
      searchRef.current = controller
      setSearching(true)
      setError(null)
      estimatePriceCeiling.search(needle, 12, controller.signal).then(
        (found) => {
          if (!controller.signal.aborted) {
            setResults(found)
            setSearching(false)
          }
        },
        (cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : 'Busca indisponível')
            setResults([])
            setSearching(false)
          }
        },
      )
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [term])

  useEffect(
    () => () => {
      searchRef.current?.abort()
      selectRef.current?.abort()
    },
    [],
  )

  const select = useCallback(async (ticker: string) => {
    selectRef.current?.abort()
    const controller = new AbortController()
    selectRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const prefilled = await estimatePriceCeiling.prefill(ticker, controller.signal)
      if (controller.signal.aborted) return
      if (prefilled == null) {
        setError(`Não encontrei ${ticker.toUpperCase()} no catálogo de ações.`)
        return
      }
      setSelected(prefilled)
      manualGrowth.current.clear()
      setForm(toForm(prefilled.assumptions))
      setResults([])
      setTerm('')
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar os fundamentos')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const setField = useCallback((field: keyof CeilingForm, value: string) => {
    // Digitar num campo de g é sobrescrita explícita: a partir daí ele para de
    // acompanhar ROE × (1 − payout) e só volta com "Restaurar" ou nova busca.
    if ((DERIVED_GROWTH_FIELDS as readonly string[]).includes(field)) {
      manualGrowth.current.add(field)
    }
    setForm((current) => ({ ...current, [field]: value }))
  }, [])

  // g deriva de ROE × (1 − payout): quando ROE ou payout mudam, os campos de g
  // que não foram sobrescritos à mão acompanham o novo derivado. Sem isto, o
  // prefill antigo congelaria o g mesmo depois do usuário corrigir as premissas.
  useEffect(() => {
    if (selected == null) return
    const growth = derivedGrowthText(form.returnOnEquity, form.payout)
    if (growth == null) return
    setForm((current) => {
      let next: CeilingForm | null = null
      for (const field of DERIVED_GROWTH_FIELDS) {
        if (manualGrowth.current.has(field) || current[field] === growth) continue
        next = next ?? current
        next = { ...next, [field]: growth }
      }
      return next ?? current
    })
  }, [form.returnOnEquity, form.payout, selected])

  const clear = useCallback(() => {
    manualGrowth.current.clear()
    setSelected(null)
    setForm(EMPTY_FORM)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    manualGrowth.current.clear()
    if (selected) setForm(toForm(selected.assumptions))
  }, [selected])

  // Recalcula a cada tecla. Premissa inválida vira mensagem, não exceção na tela.
  const { result, validation, pending } = useMemo(() => {
    if (selected == null) return { result: null, validation: null, pending: [] }

    const assumptions = toAssumptions(form)
    const pendingFields = (
      Object.entries(FIELD_LABELS) as [CeilingRequiredField, string][]
    )
      .filter(([field]) => assumptions[field] == null)
      .map(([, label]) => label)

    // Crescimento digitado com texto ilegível: o campo é opcional e um valor
    // vazio deixa o modelo derivar, então só reclama do que não é vazio.
    const unreadableGrowth = GROWTH_FIELDS.find(({ field }) => {
      const raw = form[field]
      return raw.trim() !== '' && parseDecimal(raw) == null
    })
    if (unreadableGrowth) {
      return {
        result: null,
        validation: `${unreadableGrowth.label} inválido: use número, ex. 20,5.`,
        pending: pendingFields,
      }
    }

    try {
      const computed = estimatePriceCeiling.compute(assumptions, selected.fundamentals.price)
      return { result: computed, validation: null, pending: pendingFields }
    } catch (cause) {
      if (cause instanceof ValuationError) {
        return { result: null, validation: cause.message, pending: pendingFields }
      }
      return { result: null, validation: 'Premissas inválidas.', pending: pendingFields }
    }
  }, [form, selected])

  return {
    term,
    setTerm,
    results,
    searching,
    selected,
    form,
    setField,
    select,
    clear,
    reset,
    result,
    pending,
    validation,
    loading,
    error,
  }
}
