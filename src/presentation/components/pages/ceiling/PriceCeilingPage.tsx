import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH } from '../../../../domain/valuation/models/two-phase-dcf'
import {
  usePriceCeiling,
  type CeilingForm,
  type CeilingRequiredField,
} from '../../../hooks/usePriceCeiling'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import AnimatedNumber from '../../instrument/AnimatedNumber'
import SafetyGauge from '../../instrument/SafetyGauge'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const compact = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 2,
})
const integer = new Intl.NumberFormat('pt-BR')

function money(value: number | null | undefined): string {
  return value == null ? '—' : brl.format(value)
}

function bigMoney(value: number | null | undefined): string {
  return value == null ? '—' : `R$ ${compact.format(value)}`
}

function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

interface FieldSpec {
  field: CeilingRequiredField
  label: string
  suffix: string
  hint: string
}

const FIELDS: FieldSpec[] = [
  {
    field: 'netIncome',
    label: 'Lucro líquido inicial',
    suffix: 'R$ bi',
    hint: 'Resultado de partida (ano 0), em bilhões.',
  },
  {
    field: 'payout',
    label: 'Payout',
    suffix: '%',
    hint: 'Fração do lucro distribuída. Define quanto sobra para reinvestir.',
  },
  {
    field: 'returnOnEquity',
    label: 'ROE',
    suffix: '%',
    hint: 'Retorno sobre patrimônio. Multiplica o lucro retido.',
  },
  {
    field: 'discountRate',
    label: 'Taxa de desconto (k)',
    suffix: '%',
    hint: 'Retorno mínimo que você exige. Não vem de API.',
  },
  {
    field: 'sharesOutstanding',
    label: 'Ações em circulação',
    suffix: 'un',
    hint: 'Derivado de capitalização ÷ preço.',
  },
]

export default function PriceCeilingPage() {
  const {
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
    loadSaved,
    save,
    saving,
    saveError,
    savedAt,
    isSavedCalc,
  } = usePriceCeiling()
  const { isLoaded: userLoaded, isSignedIn, user } = useCurrentUser()
  const reduce = useReducedMotion()

  // Vindo do histórico (`/teto/historico` → `?ticker=X`): escolhe o ativo já
  // com os fundamentos da fonte. O parâmetro é consumido uma vez e limpo da
  // URL, para o "Trocar ação" não reescolher o mesmo ativo no retorno.
  const [searchParams, setSearchParams] = useSearchParams()
  const consumedTicker = useRef(searchParams.get('ticker'))

  useEffect(() => {
    const ticker = searchParams.get('ticker')
    if (ticker == null || consumedTicker.current === ticker) return
    consumedTicker.current = ticker
    void select(ticker)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, select])

  const fundamentals = selected?.fundamentals ?? null
  const marketPrice = fundamentals?.price ?? null
  const breakdown = result?.breakdown ?? null
  const canSave = userLoaded && isSignedIn && user != null

  // Vindo do histórico (`/teto/salvo/:id`): abre a calculadora com as premissas
  // exatas daquele save, sem buscar a fonte de novo. Consumido uma vez, para o
  // "Trocar ação" não recarregar o mesmo cálculo no retorno. O usuário precisa
  // já existir: se o Clerk ainda estiver hidratando, espera o efeito seguinte.
  const { id: savedCalcId } = useParams()
  const consumedSavedCalc = useRef<string | null>(null)

  useEffect(() => {
    if (savedCalcId == null || user == null) return
    if (consumedSavedCalc.current === savedCalcId) return
    consumedSavedCalc.current = savedCalcId
    void loadSaved(savedCalcId, user.id)
  }, [savedCalcId, user, loadSaved])

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 className="page-title">Preço teto</h1>
        <div className="section-actions">
          <Link className="button button-ghost" to="/acoes">
            Ver ranking
          </Link>
          <Link className="button button-ghost" to="/teto/historico">
            Meu histórico
          </Link>
          {selected && (
            <button className="button button-ghost" type="button" onClick={clear}>
              Trocar ação
            </button>
          )}
        </div>
      </header>

      <div className="criteria">
        <span className="criteria-item">FCD em 2 fases</span>
        <span className="criteria-item">{EXPLICIT_YEARS} anos + perpetuidade</span>
        <span className="criteria-item">g∞ limitado a {(PERPETUAL_GROWTH * 100).toFixed(0)}%</span>
        <span className="criteria-item">g = ROE × (1 − payout)</span>
        <span className="criteria-item">desconta só o distribuível: FCFE = LL × (1 − g/ROE)</span>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {selected == null ? (
        <div className="market">
          <label className="field">
            <span>Buscar ação</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="BBAS3, Petrobras, Weg…"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </label>

          {term.trim().length < 2 ? (
            <p className="muted picker-hint">
              Digite ao menos duas letras. Os fundamentos vêm preenchidos e você ajusta o que
              estiver defasado.
            </p>
          ) : searching || loading ? (
            <p className="muted picker-hint">Lendo o catálogo…</p>
          ) : results.length === 0 ? (
            <p className="muted picker-hint">Nenhuma ação encontrada.</p>
          ) : (
            <ul className="market-rows">
              {results.map((stock) => (
                <li key={stock.ticker}>
                  <button type="button" className="market-row" onClick={() => void select(stock.ticker)}>
                    <span className="picker-identity">
                      <strong className="ticker">{stock.ticker}</strong>
                      <span>{stock.name}</span>
                    </span>
                    <span className="market-figures">
                      <span className="price">{money(stock.price)}</span>
                      <small>ROE {percent(stock.returnOnEquity, 1)}</small>
                    </span>
                    <span className="market-action" aria-hidden="true">
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* Resultado ─ o instrumento lê o desconto do mercado contra o teto */}
          <motion.section
            className="instrument"
            initial={reduce ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="instrument-head">
              <span className="eyebrow">
                {fundamentals?.ticker} · {fundamentals?.sector ?? '—'}
              </span>
              <span className="header-date">{fundamentals?.name}</span>
            </div>

            {validation ? (
              <p className="alert alert-error" style={{ marginBottom: 0 }}>
                {validation}
              </p>
            ) : result == null ? (
              <p className="muted verdict-note">
                {pending.length === 0
                  ? 'Ajuste as premissas para o teto ser calculado.'
                  : `Preencha ${pending.join(', ')} para o teto ser calculado.`}{' '}
                Nada é estimado no seu lugar.
              </p>
            ) : (
              <>
                <div className="instrument-readout">
                  <div className="verdict">
                    <span className="verdict-figure">
                      {/* Curto de propósito: o número recalcula a cada tecla, e o
                          contador longo da carteira faria a edição parecer travada. */}
                      <AnimatedNumber
                        value={result.ceiling}
                        format={(v) => brl.format(v)}
                        duration={0.4}
                        delay={0.05}
                      />
                    </span>
                    <span className="verdict-label">preço teto por ação</span>
                    <span className="verdict-note">
                      Crescimento de {percent(breakdown?.growthRate)} a.a. na fase explícita, vindo
                      de ROE × (1 − payout). A perpetuidade responde por{' '}
                      {percent(breakdown?.terminalShare, 1)} do valor.
                    </span>
                  </div>

                  <div className="tally">
                    <div className="tally-row">
                      <span className="tally-value">{money(marketPrice)}</span>
                      <span className="tally-label">Preço de mercado</span>
                    </div>
                    <div className="tally-row">
                      <span
                        className={`tally-value ${
                          result.safetyMargin == null
                            ? ''
                            : result.safetyMargin >= 0
                              ? 'positive'
                              : 'negative'
                        }`}
                      >
                        {result.safetyMargin == null
                          ? '—'
                          : `${result.safetyMargin > 0 ? '+' : ''}${(result.safetyMargin * 100).toFixed(1)}%`}
                      </span>
                      <span className="tally-label">Margem de segurança</span>
                    </div>
                    <div className="tally-row">
                      <span className="tally-value">{bigMoney(breakdown?.totalPresentValue)}</span>
                      <span className="tally-label">Valor presente total</span>
                    </div>
                  </div>
                </div>

                {marketPrice != null && (
                  <div className="verdict-instrument">
                    <SafetyGauge
                      costBasis={result.ceiling}
                      marketValue={marketPrice}
                      size="hero"
                      polarity="discount"
                      datumLabel="teto"
                      label={`${fundamentals?.ticker}: mercado ${
                        result.safetyMargin == null
                          ? 'sem leitura'
                          : `${(result.safetyMargin * 100).toFixed(1)}% abaixo do teto`
                      }`}
                    />
                  </div>
                )}
              </>
            )}
          </motion.section>

          {/* Salvar ─ grava no banco o teto e todas as premissas usadas; aberto
              pelo histórico, o save atualiza aquele registro (upsert por ativo) */}
          {result && (
            <div className="save-bar">
              <button
                className="button"
                type="button"
                disabled={saving || !canSave}
                onClick={() => user && void save(user.id)}
              >
                {saving
                  ? 'Salvando…'
                  : isSavedCalc
                    ? `Atualizar ${fundamentals?.ticker ?? 'cálculo'}`
                    : `Salvar ${fundamentals?.ticker ?? 'cálculo'}`}
              </button>

              {!canSave ? (
                <span className="save-note">Entre para salvar o cálculo no banco.</span>
              ) : saveError != null ? (
                <span className="save-note is-error">{saveError}</span>
              ) : savedAt != null ? (
                <span className="save-note is-ok">
                  {isSavedCalc
                    ? 'Atualizado com o novo teto e as premissas utilizadas.'
                    : 'Salvo com preço teto e todas as premissas utilizadas.'}
                </span>
              ) : (
                <span className="save-note">
                  {isSavedCalc
                    ? 'Qualquer alteração atualiza o cálculo salvo no seu histórico.'
                    : 'O teto e as premissas deste cálculo ficam guardados no seu histórico.'}
                </span>
              )}
            </div>
          )}

          {/* Premissas ─ preenchidas pela fonte, editáveis */}
          <section>
            <div className="section-head">
              <h2 className="section-title">Premissas</h2>
              <div className="section-actions">
                <span className="section-count">
                  {selected.missing.length === 0
                    ? 'tudo veio da fonte'
                    : `${selected.missing.length} a preencher`}
                </span>
                <button className="button button-ghost" type="button" onClick={reset}>
                  Restaurar
                </button>
              </div>
            </div>

            <div className="card">
              <div className="form-grid">
                {FIELDS.map((spec) => {
                  const fromSource = selected.assumptions[spec.field] != null
                  return (
                    <label className="field" key={spec.field}>
                      <span>
                        {spec.label}
                        <em className={`origin${fromSource ? '' : ' is-manual'}`}>
                          {fromSource ? 'da fonte' : 'preencher'}
                        </em>
                      </span>
                      <div className="field-affix">
                        {/* type="text", não "number": um input numérico descarta a
                            vírgula, e vírgula é o separador decimal de quem digita em
                            pt-BR, inclusive no teclado do celular — o campo ficava
                            vazio ao digitar "20,5". `inputMode` mantém o teclado
                            numérico, e a validação mora no domínio. */}
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={form[spec.field]}
                          onChange={(e) => setField(spec.field, e.target.value)}
                        />
                        <i>{spec.suffix}</i>
                      </div>
                      <span className="field-hint">{spec.hint}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </section>

          {/* Memória de cálculo ─ o modelo tem de ser auditável. Cada ano mostra
              o LL projetado, o fluxo distribuível ao acionista (FCFE = LL ×
              (1 − g/ROE)) e o FCFE descontado, com g e k aplicados. A trava de
              retenção b = min(1, g/ROE) deixa no balanço o capital que o
              crescimento exige — a regra de Basileia/Solvência. g é editável ano
              a ano: é a correção do valor inflado. Na perpetuidade o modelo
              limita g em 3%. */}
          {breakdown && (
            <section>
              <div className="section-head">
                <h2 className="section-title">Memória de cálculo</h2>
                <span className="section-count">
                  k = {form.discountRate}% · g = {percent(breakdown.growthRate)}
                </span>
              </div>

              <div className="ledger calc-table">
                <div className="calc-table-head">
                  <span className="calc-col-year">Ano</span>
                  <span className="calc-col-value">LL projetado</span>
                  <span className="calc-col-value">Fluxo distribuível (FCFE)</span>
                  <span className="calc-col-value">FCFE descontado</span>
                  <span className="calc-col-growth">Taxa de crescimento (g)</span>
                  <span className="calc-col-value">Taxa de desconto (k)</span>
                </div>

                {breakdown.years.map((year) => (
                  <div className="calc-row calc-table-row" key={year.year}>
                    <span className="calc-col-year calc-label">Ano {year.year}</span>
                    <span className="calc-col-value calc-value">{bigMoney(year.netIncome)}</span>
                    <span className="calc-col-value calc-value">
                      {bigMoney(year.fcfe)}
                      <small>distribui {percent(year.payoutRate, 1)}</small>
                    </span>
                    <span className="calc-col-value calc-value">{bigMoney(year.presentValue)}</span>
                    <span className="calc-col-growth calc-value">
                      <input
                        className="growth-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Taxa de crescimento do ano ${year.year}`}
                        placeholder={percent(year.growthRate)}
                        value={form[`growth${year.year}` as keyof CeilingForm]}
                        onChange={(e) =>
                          setField(`growth${year.year}` as keyof CeilingForm, e.target.value)
                        }
                      />
                      <i>%</i>
                    </span>
                    <span className="calc-col-value calc-value">{percent(year.discountRate)}</span>
                  </div>
                ))}

                <div className="calc-row calc-table-row is-infinity">
                  <span className="calc-col-year calc-label">
                    Ano {EXPLICIT_YEARS + 1} → ∞
                    <small>perpetuidade</small>
                  </span>
                  <span className="calc-col-value calc-value">{bigMoney(breakdown.terminalNetIncome)}</span>
                  <span className="calc-col-value calc-value">
                    {bigMoney(breakdown.terminalFcfe)}
                    <small>
                      distribui{' '}
                      {percent(breakdown.terminalFcfe / breakdown.terminalNetIncome, 1)}
                    </small>
                  </span>
                  <span className="calc-col-value calc-value">{bigMoney(breakdown.terminalPresentValue)}</span>
                  <span className="calc-col-growth calc-value">
                    <input
                      className="growth-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label="Taxa de crescimento perpétua"
                      placeholder={percent(breakdown.perpetualGrowthRate)}
                      value={form.perpetualGrowth}
                      onChange={(e) => setField('perpetualGrowth', e.target.value)}
                    />
                    <i>%</i>
                    {breakdown.perpetualGrowthCapped && (
                      <small className="cap-note">
                        pedido {percent(breakdown.requestedPerpetualGrowth, 1)} · limitado a{' '}
                        {(PERPETUAL_GROWTH * 100).toFixed(0)}%
                      </small>
                    )}
                  </span>
                  <span className="calc-col-value calc-value">{percent(breakdown.discountRate)}</span>
                </div>

                <div className="calc-row is-subtotal">
                  <span className="calc-label">
                    Fase explícita
                    <small>{percent(breakdown.explicitShare, 1)} do valuation</small>
                  </span>
                  <span className="price calc-value">{bigMoney(breakdown.explicitPresentValue)}</span>
                </div>

                <div className="calc-row is-subtotal">
                  <span className="calc-label">
                    Perpetuidade
                    <small>
                      fluxo distribuível do ano {EXPLICIT_YEARS + 1} (lucro de{' '}
                      {bigMoney(breakdown.terminalNetIncome)} ×{' '}
                      {percent(breakdown.terminalFcfe / breakdown.terminalNetIncome, 0)}) ÷ (k −{' '}
                      {percent(breakdown.perpetualGrowthRate, 0)}) ={' '}
                      {bigMoney(breakdown.terminalValue)} no ano {EXPLICIT_YEARS}, trazido a hoje ·{' '}
                      {percent(breakdown.terminalShare, 1)} do valuation
                    </small>
                  </span>
                  <span className="price calc-value">{bigMoney(breakdown.terminalPresentValue)}</span>
                </div>

                <div className="calc-row is-total">
                  <span className="calc-label">
                    Preço teto por ação
                    <small>
                      {bigMoney(breakdown.totalPresentValue)} ÷{' '}
                      {integer.format(Number(form.sharesOutstanding) || 0)} ações
                    </small>
                  </span>
                  <span className="calc-value is-ceiling">{money(breakdown.fairValue)}</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <p className="quote-note">
        Modelo de fluxo de caixa descontado em duas fases, conforme{' '}
        <code>src/docs/BBAS3.MD</code>: {EXPLICIT_YEARS} anos de projeção explícita crescendo a
        ROE × (1 − payout), mais perpetuidade pelo modelo de Gordon a{' '}
        {(PERPETUAL_GROWTH * 100).toFixed(0)}% a.a. O fluxo descontado é o distribuível ao
        acionista — FCFE = LL × (1 − g/ROE) —: o modelo retém o capital que o crescimento exige
        (regra de Basileia/Solvência) e desconta apenas o que pode sair como dividendo/JCP, em
        vez do lucro integral, que assumiria payout de 100% com ROE infinito. Fundamentos vindos
        do StatusInvest, que não publica API oficial. Isto não é recomendação de investimento.
      </p>
    </div>
  )
}
