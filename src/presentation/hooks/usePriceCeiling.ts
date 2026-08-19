import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CeilingAssumptions,
  CeilingResult,
  PrefilledCeiling,
} from '../../application/stock/price-ceiling'
import { deriveCostOfCapital } from '../../application/stock/price-ceiling'
import type { StockCostOfCapital } from '../../domain/stock/cost-of-capital'
import { ceilingValuationRepository } from '../../composition/container'
import { estimatePriceCeiling } from '../../composition/container'
import type { StockFundamentals } from '../../domain/stock/fundamentals'
import { EXPLICIT_YEARS } from '../../domain/valuation/models/two-phase-dcf'
import type { CeilingSavedAssumptions } from '../../domain/valuation/breakdown'
import { CEILING_METHODS, type CeilingMethodId } from '../../domain/valuation/methods'
import type { CeilingValuation } from '../../domain/valuation/ceiling-valuation'
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
  /** Dividendo por ação, em reais. Base do DDM e do Bazin. */
  dividendPerShare: string
  /** Yield exigido do Bazin, em pontos percentuais. */
  requiredYield: string
  /** Lucro por ação, em reais. */
  earningsPerShare: string
  /** Valor patrimonial por ação, em reais. */
  bookValuePerShare: string
  /** EBIT em bilhões de reais. Base do fluxo da firma. */
  ebit: string
  /** Alíquota sobre o resultado operacional, em pontos percentuais. */
  taxRate: string
  /** ROIC em pontos percentuais. */
  returnOnInvestedCapital: string
  /** Crescimento da receita em pontos percentuais: a fase explícita do FCFF. */
  revenueGrowth: string
  /** Dívida líquida em bilhões de reais. Negativo é caixa líquido. */
  netDebt: string
  /** WACC em pontos percentuais. */
  wacc: string
  /** Taxa livre de risco em pontos percentuais. */
  riskFreeRate: string
  /** Beta do ativo. */
  beta: string
  /** Prêmio adicional sobre o CAPM, em pontos percentuais. */
  extraPremium: string
  /** Spread de crédito da empresa, em pontos percentuais. */
  debtSpread: string
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
  dividendPerShare: '',
  requiredYield: '',
  earningsPerShare: '',
  bookValuePerShare: '',
  ebit: '',
  taxRate: '',
  returnOnInvestedCapital: '',
  revenueGrowth: '',
  netDebt: '',
  wacc: '',
  riskFreeRate: '',
  beta: '',
  extraPremium: '',
  debtSpread: '',
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
  // Payout acima de 100% não gera retenção negativa: sem retenção, g = 0.
  const growth = (roe / 100) * (1 - Math.min(1, payout / 100))
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
  const cash = (value: number | null) =>
    value == null ? '' : String(Number(value.toFixed(4)))
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
    dividendPerShare: cash(assumptions.dividendPerShare),
    requiredYield: pct(assumptions.requiredYield),
    earningsPerShare: cash(assumptions.earningsPerShare),
    bookValuePerShare: cash(assumptions.bookValuePerShare),
    ebit: assumptions.ebit == null ? '' : String(Number((assumptions.ebit / 1e9).toFixed(3))),
    taxRate: pct(assumptions.taxRate),
    returnOnInvestedCapital: pct(assumptions.returnOnInvestedCapital),
    revenueGrowth: pct(assumptions.revenueGrowth),
    netDebt: assumptions.netDebt == null ? '' : String(Number((assumptions.netDebt / 1e9).toFixed(3))),
    wacc: pct(assumptions.wacc),
    riskFreeRate: pct(assumptions.riskFreeRate),
    beta: assumptions.beta == null ? '' : String(Number(assumptions.beta.toFixed(2))),
    extraPremium: pct(assumptions.extraPremium),
    debtSpread: pct(assumptions.debtSpread),
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
    dividendPerShare: parseDecimal(form.dividendPerShare),
    requiredYield: pct(form.requiredYield),
    earningsPerShare: parseDecimal(form.earningsPerShare),
    bookValuePerShare: parseDecimal(form.bookValuePerShare),
    ebit: (() => {
      const value = parseDecimal(form.ebit)
      return value == null ? null : value * 1e9
    })(),
    taxRate: pct(form.taxRate),
    returnOnInvestedCapital: pct(form.returnOnInvestedCapital),
    revenueGrowth: pct(form.revenueGrowth),
    netDebt: (() => {
      const value = parseDecimal(form.netDebt)
      return value == null ? null : value * 1e9
    })(),
    wacc: pct(form.wacc),
    riskFreeRate: pct(form.riskFreeRate),
    beta: parseDecimal(form.beta),
    extraPremium: pct(form.extraPremium),
    debtSpread: pct(form.debtSpread),
  }
}

/**
 * Premissas a gravar: só as que o método pediu.
 *
 * Guardar o formulário inteiro sujaria o registro com números que não entraram na
 * conta — um teto de Bazin com ROE e número de ações sugeriria influência que não
 * houve. As sobrescritas de g acompanham os métodos que projetam fase explícita.
 */
function toSavedAssumptions(
  method: CeilingMethodId,
  assumptions: CeilingAssumptions,
): CeilingSavedAssumptions {
  const saved: CeilingSavedAssumptions = {}
  for (const input of CEILING_METHODS[method].inputs) {
    const value = assumptions[input]
    if (typeof value === 'number') saved[input] = value
  }
  if (method === 'fcd-2-fases' || method === 'ddm-gordon') {
    saved.perpetualGrowth = assumptions.perpetualGrowth
  }
  if (method === 'fcd-2-fases' || method === 'fcff-wacc') {
    saved.growthRates = assumptions.growthRates
  }
  /**
   * A montagem da taxa vai junto sempre que a taxa é descontada: sem isso o
   * registro guardaria "k = 19,3%" sem dizer de onde saiu, e o cálculo não seria
   * reproduzível seis meses depois, com outra Selic e outro beta.
   */
  if (CEILING_METHODS[method].inputs.includes('discountRate') || method === 'fcff-wacc') {
    if (assumptions.riskFreeRate != null) saved.riskFreeRate = assumptions.riskFreeRate
    if (assumptions.beta != null) saved.beta = assumptions.beta
    if (assumptions.extraPremium != null) saved.extraPremium = assumptions.extraPremium
  }
  if (method === 'fcff-wacc' && assumptions.debtSpread != null) {
    saved.debtSpread = assumptions.debtSpread
  }
  return saved
}

const savedWhen = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Reconstrói o estado da calculadora a partir de um cálculo salvo: as premissas
 * voltam exatamente como estavam no save, com o método daquele registro, e a
 * fonte de fundamentos é o próprio registro, não uma busca nova (que traria
 * números de hoje).
 */
function fromSaved(record: CeilingValuation): PrefilledCeiling {
  const a = record.assumptions
  return {
    fundamentals: {
      ticker: record.ticker,
      name: `em ${savedWhen.format(new Date(record.createdAt))}`,
      sector: 'cálculo salvo',
      // O save guarda premissas, não a taxonomia do ativo: a régua por setor não
      // se aplica a um cálculo reaberto, que já vem com o método escolhido.
      sectorName: null,
      subsectorName: null,
      segmentName: null,
      price: record.marketPrice,
      netIncome: a.netIncome ?? null,
      earningsPerShare: a.earningsPerShare ?? null,
      payout: a.payout ?? null,
      returnOnEquity: a.returnOnEquity ?? null,
      sharesOutstanding: a.sharesOutstanding ?? null,
      bookValuePerShare: a.bookValuePerShare ?? null,
      priceToEarnings: null,
      averageDailyLiquidity: null,
      dividendYield: null,
      dividendPerShare: a.dividendPerShare ?? null,
      revenueCagr5: a.revenueGrowth ?? null,
      marketCap: null,
      ebit: a.ebit ?? null,
      enterpriseValue: null,
      netDebt: a.netDebt ?? null,
      netDebtToEquity: null,
      netDebtToEbit: null,
      returnOnInvestedCapital: a.returnOnInvestedCapital ?? null,
    },
    assumptions: {
      netIncome: a.netIncome ?? null,
      payout: a.payout ?? null,
      returnOnEquity: a.returnOnEquity ?? null,
      discountRate: a.discountRate ?? null,
      sharesOutstanding: a.sharesOutstanding ?? null,
      // O registro foi escrito com as premissas do método; o contrato permite
      // campos ausentes, então a borda normaliza para o que a calculadora espera:
      // um g por ano explícito, `null` quando não havia.
      growthRates: Array.from({ length: EXPLICIT_YEARS }, (_, index) => a.growthRates?.[index] ?? null),
      perpetualGrowth: a.perpetualGrowth ?? null,
      dividendPerShare: a.dividendPerShare ?? null,
      requiredYield: a.requiredYield ?? null,
      earningsPerShare: a.earningsPerShare ?? null,
      bookValuePerShare: a.bookValuePerShare ?? null,
      ebit: a.ebit ?? null,
      taxRate: a.taxRate ?? null,
      returnOnInvestedCapital: a.returnOnInvestedCapital ?? null,
      revenueGrowth: a.revenueGrowth ?? null,
      netDebt: a.netDebt ?? null,
      wacc: a.wacc ?? null,
      riskFreeRate: a.riskFreeRate ?? null,
      beta: a.beta ?? null,
      extraPremium: a.extraPremium ?? null,
      debtSpread: a.debtSpread ?? null,
    },
    // Cálculo salvo não tem régua a recomendar: o método é o que foi usado.
    selection: {
      family: 'crescimento',
      recommended: record.method,
      preference: [record.method],
      reason: `Cálculo salvo com ${CEILING_METHODS[record.method].label}. As premissas são as daquele momento, não as de hoje.`,
      adjustedByBehavior: false,
    },
    dividendAverage: null,
    /**
     * Um cálculo salvo não relê a Selic: as taxas dele são as daquele momento, e
     * substituí-las pelas de hoje mudaria o número que o usuário salvou.
     */
    riskFree: {
      rate: a.riskFreeRate ?? Number.NaN,
      asOf: record.createdAt,
      label: 'taxa do momento do cálculo',
      fallback: false,
    },
    costOfCapital: null,
    // O save só existe com cálculo pronto, então nada falta.
    missing: [],
  }
}

export interface UsePriceCeilingResult {
  /** Montagem do custo de capital com as premissas da tela. */
  costOfCapital: StockCostOfCapital | null
  /** `false` quando o usuário digitou a taxa por cima do CAPM. */
  rateFromCapm: boolean
  term: string
  setTerm: (value: string) => void
  results: StockFundamentals[]
  searching: boolean
  selected: PrefilledCeiling | null
  form: CeilingForm
  setField: (field: keyof CeilingForm, value: string) => void
  select: (ticker: string) => Promise<void>
  /** Abre um cálculo salvo com as premissas exatas daquele save. */
  loadSaved: (id: string, userId: string) => Promise<void>
  clear: () => void
  /** Volta as premissas ao que a fonte trouxe. */
  reset: () => void
  /** Método em uso. Começa no recomendado para o ativo. */
  method: CeilingMethodId
  setMethod: (method: CeilingMethodId) => void
  /** `true` quando o método em uso não é o recomendado para o ativo. */
  methodOverridden: boolean
  /** De onde vem o dividendo no campo: média histórica, 12 meses ou digitado. */
  dividendBase: 'media' | 'doze-meses' | 'manual'
  result: CeilingResult | null
  /**
   * Campos vazios agora, entre os que o método em uso exige. Diferente de
   * `selected.missing`, que diz o que a fonte não trouxe: aqui é o estado atual do
   * formulário, então apagar um campo preenchido pela fonte também conta.
   */
  pending: string[]
  /** Erro de premissa inválida, vindo do domínio. */
  validation: string | null
  loading: boolean
  error: string | null
  /** Salva no banco o cálculo atual com o método e as premissas usadas. */
  save: (userId: string) => Promise<void>
  saving: boolean
  /** Erro do último save. */
  saveError: string | null
  /** ISO do último save que deu certo; null enquanto nada foi salvo. */
  savedAt: string | null
  /**
   * `true` quando a calculadora está com um cálculo salvo aberto (vindo do
   * histórico): salvar de novo atualiza aquele registro no banco.
   */
  isSavedCalc: boolean
}

export function usePriceCeiling(): UsePriceCeilingResult {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<StockFundamentals[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PrefilledCeiling | null>(null)
  const [form, setForm] = useState<CeilingForm>(EMPTY_FORM)
  const [method, setMethodState] = useState<CeilingMethodId>('fcd-2-fases')
  const [methodOverridden, setMethodOverridden] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isSavedCalc, setIsSavedCalc] = useState(false)
  const searchRef = useRef<AbortController | null>(null)
  const selectRef = useRef<AbortController | null>(null)
  /** Anos cujo g o usuário digitou à mão: esses não acompanham ROE × (1 − payout). */
  const manualGrowth = useRef<Set<keyof CeilingForm>>(new Set())
  /** Dividendo digitado à mão: para de acompanhar a base do método. */
  const manualDividend = useRef(false)
  /**
   * Taxa digitada à mão: para de acompanhar o CAPM.
   *
   * É o equivalente de exigir retorno diferente do custo de oportunidade — coisa
   * legítima, e que a tela precisa mostrar como escolha do usuário, não como
   * resultado do modelo.
   */
  const manualRate = useRef(false)
  /** Beta digitado à mão: substitui o do setor na montagem do CAPM. */
  const manualBeta = useRef(false)

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
      manualDividend.current = false
      manualRate.current = false
      manualBeta.current = false
      setForm(toForm(prefilled.assumptions))
      // Abre no método da natureza do ativo. Trocar depois é escolha explícita.
      setMethodState(prefilled.selection.recommended)
      setMethodOverridden(false)
      setResults([])
      setTerm('')
      setSavedAt(null)
      setSaveError(null)
      setIsSavedCalc(false)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar os fundamentos')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const loadSaved = useCallback(async (id: string, userId: string) => {
    selectRef.current?.abort()
    const controller = new AbortController()
    selectRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const saved = await ceilingValuationRepository.get(id, userId, controller.signal)
      if (controller.signal.aborted) return
      if (saved == null) {
        setError('Este cálculo salvo não existe mais no seu histórico.')
        return
      }
      const prefilled = fromSaved(saved)
      setSelected(prefilled)
      manualGrowth.current.clear()
      // O save já traz o dividendo e as taxas que foram usados: nada disso deve ser
      // sobrescrito pela base do método nem por uma remontagem do CAPM de hoje.
      manualDividend.current = true
      manualRate.current = true
      manualBeta.current = true
      // g sobrescritos à mão no save precisam continuar sobrescritos: sem isso,
      // o efeito de sincronização trocaria o valor salvo pelo ROE × (1 − payout).
      const { returnOnEquity, payout, growthRates } = prefilled.assumptions
      const derived =
        returnOnEquity != null && payout != null
          ? Number((returnOnEquity * (1 - Math.min(1, payout)) * 100).toFixed(2))
          : null
      growthRates.forEach((growth, index) => {
        const field = DERIVED_GROWTH_FIELDS[index]
        const growthPct = growth == null ? null : Number((growth * 100).toFixed(2))
        if (growthPct != null && growthPct !== derived) manualGrowth.current.add(field)
      })
      setForm(toForm(prefilled.assumptions))
      setMethodState(saved.method)
      setMethodOverridden(false)
      setResults([])
      setTerm('')
      setSavedAt(null)
      setSaveError(null)
      setIsSavedCalc(true)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar o cálculo salvo')
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
    if (field === 'dividendPerShare') manualDividend.current = true
    // Editar Ke ou WACC direto desliga o CAPM: a partir daí a taxa é exigência do
    // usuário, e a tela diz isso.
    if (field === 'discountRate' || field === 'wacc') manualRate.current = true
    if (field === 'beta') manualBeta.current = true
    // Qualquer edição invalida a confirmação de save: o que está no banco já
    // não corresponde ao que a tela mostra agora.
    setSavedAt(null)
    setSaveError(null)
    setForm((current) => ({ ...current, [field]: value }))
  }, [])

  const setMethod = useCallback(
    (next: CeilingMethodId) => {
      setSavedAt(null)
      setSaveError(null)
      setMethodState(next)
      setMethodOverridden(selected != null && next !== selected.selection.recommended)
    },
    [selected],
  )

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

  /**
   * Base de dividendo por método.
   *
   * O Bazin é definido sobre a média dos exercícios encerrados — é o que separa o
   * método de uma extrapolação do último ano —, enquanto o desconto de dividendos
   * projeta crescimento a partir do dividendo corrente. Trocar a régua troca a
   * base, a menos que o usuário tenha digitado a sua.
   */
  useEffect(() => {
    if (selected == null || manualDividend.current) return
    const average = selected.dividendAverage?.average ?? null
    const trailing = selected.fundamentals.dividendPerShare
    const base = method === 'bazin' ? (average ?? trailing) : (trailing ?? average)
    if (base == null) return
    const text = String(Number(base.toFixed(4)))
    setForm((current) =>
      current.dividendPerShare === text ? current : { ...current, dividendPerShare: text },
    )
  }, [method, selected])

  /**
   * Custo de capital com as premissas que estão na tela agora.
   *
   * Recalculado a cada tecla, como o teto: mexer no beta ou no prêmio adicional
   * muda Ke e WACC, e as duas taxas precisam acompanhar sem ida nova à fonte. Um
   * cálculo salvo reaberto não remonta nada — as taxas dele são as que foram
   * gravadas.
   */
  const costOfCapital: StockCostOfCapital | null = useMemo(() => {
    if (selected == null || isSavedCalc) return null
    const riskFreeRate = parseDecimal(form.riskFreeRate)
    if (riskFreeRate == null) return null
    const beta = manualBeta.current ? parseDecimal(form.beta) : null
    const extra = parseDecimal(form.extraPremium)
    const spread = parseDecimal(form.debtSpread)
    try {
      return deriveCostOfCapital(selected.fundamentals, {
        riskFreeRate: riskFreeRate / 100,
        betaOverride: beta,
        extraPremium: extra == null ? 0 : extra / 100,
        debtSpreadOverride: spread == null ? null : spread / 100,
      })
    } catch {
      // Premissa de risco inválida (beta zero, Rf negativo) já vira mensagem no
      // cálculo do teto; aqui só significa que não há montagem a mostrar.
      return null
    }
  }, [selected, isSavedCalc, form.riskFreeRate, form.beta, form.extraPremium, form.debtSpread])

  /**
   * As taxas seguem o CAPM até o usuário digitar a sua.
   *
   * Ke e WACC não são campos independentes: são resultado da montagem de risco. O
   * efeito mantém os dois em sincronia com o beta e o prêmio, e para de escrever no
   * instante em que alguém edita a taxa à mão — a partir daí a exigência é dele.
   */
  useEffect(() => {
    if (costOfCapital == null || manualRate.current) return
    const equity = String(Number((costOfCapital.costOfEquity * 100).toFixed(2)))
    const firm =
      costOfCapital.wacc == null ? '' : String(Number((costOfCapital.wacc.wacc * 100).toFixed(2)))
    setForm((current) => {
      if (current.discountRate === equity && current.wacc === firm) return current
      return { ...current, discountRate: equity, wacc: firm }
    })
  }, [costOfCapital])

  /** Beta do setor no campo, enquanto o usuário não digitar o seu. */
  useEffect(() => {
    if (costOfCapital == null || manualBeta.current) return
    const beta = String(Number(costOfCapital.beta.beta.toFixed(2)))
    setForm((current) => (current.beta === beta ? current : { ...current, beta }))
  }, [costOfCapital])

  const clear = useCallback(() => {
    manualGrowth.current.clear()
    manualDividend.current = false
    manualRate.current = false
    manualBeta.current = false
    setSelected(null)
    setForm(EMPTY_FORM)
    setError(null)
    setSavedAt(null)
    setSaveError(null)
    setIsSavedCalc(false)
    setMethodOverridden(false)
  }, [])

  const reset = useCallback(() => {
    manualGrowth.current.clear()
    manualDividend.current = false
    manualRate.current = false
    manualBeta.current = false
    setSavedAt(null)
    setSaveError(null)
    if (selected) {
      setForm(toForm(selected.assumptions))
      setMethodState(selected.selection.recommended)
      setMethodOverridden(false)
    }
  }, [selected])

  // Recalcula a cada tecla. Premissa inválida vira mensagem, não exceção na tela.
  const { result, validation, pending } = useMemo(() => {
    if (selected == null) return { result: null, validation: null, pending: [] }

    const assumptions = toAssumptions(form)
    const pendingFields = estimatePriceCeiling.missingFor(method, assumptions)

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
      const computed = estimatePriceCeiling.compute(
        method,
        assumptions,
        selected.fundamentals.price,
      )
      return { result: computed, validation: null, pending: pendingFields }
    } catch (cause) {
      if (cause instanceof ValuationError) {
        return { result: null, validation: cause.message, pending: pendingFields }
      }
      return { result: null, validation: 'Premissas inválidas.', pending: pendingFields }
    }
  }, [form, selected, method])

  const save = useCallback(
    async (userId: string) => {
      if (selected == null || result == null) return
      setSaving(true)
      setSaveError(null)
      try {
        const assumptions = toAssumptions(form)
        await ceilingValuationRepository.save({
          userId,
          ticker: selected.fundamentals.ticker,
          marketPrice: result.marketPrice,
          ceilingPrice: result.ceiling,
          safetyMargin: result.safetyMargin,
          method: result.method,
          assumptions: toSavedAssumptions(result.method, assumptions),
          breakdown: result.breakdown,
        })
        setSavedAt(new Date().toISOString())
      } catch (cause) {
        setSaveError(cause instanceof Error ? cause.message : 'Falha ao salvar o cálculo.')
      } finally {
        setSaving(false)
      }
    },
    [selected, result, form],
  )

  const dividendBase: 'media' | 'doze-meses' | 'manual' = manualDividend.current
    ? 'manual'
    : method === 'bazin' && selected?.dividendAverage != null
      ? 'media'
      : 'doze-meses'

  return {
    term,
    setTerm,
    results,
    searching,
    selected,
    costOfCapital,
    rateFromCapm: !manualRate.current,
    form,
    setField,
    dividendBase,
    select,
    loadSaved,
    clear,
    reset,
    method,
    setMethod,
    methodOverridden,
    result,
    pending,
    validation,
    loading,
    error,
    save,
    saving,
    saveError,
    savedAt,
    isSavedCalc,
  }
}
