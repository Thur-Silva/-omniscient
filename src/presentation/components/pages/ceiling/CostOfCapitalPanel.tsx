import type { RiskFreeRate } from '../../../../domain/market/risk-free'
import type { StockCostOfCapital } from '../../../../domain/stock/cost-of-capital'
import { usesWacc, type CeilingMethodId } from '../../../../domain/valuation/methods'
import type { CeilingForm } from '../../../hooks/usePriceCeiling'

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 })

function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

function ratio(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function bigMoney(value: number): string {
  return `R$ ${compact.format(value)}`
}

const whenRead = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

/** Data da observação da Selic, que vem em ISO simples (yyyy-MM-dd). */
function readDate(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? iso : whenRead.format(parsed)
}

interface RatePremiseFieldSpec {
  field: keyof CeilingForm
  label: string
  suffix: string
  hint: string
}

const RATE_FIELDS: RatePremiseFieldSpec[] = [
  {
    field: 'riskFreeRate',
    label: 'Taxa livre de risco',
    suffix: '%',
    hint: 'Selic anualizada, lida do Banco Central. Troque se preferir o juro longo da NTN-B.',
  },
  {
    field: 'beta',
    label: 'Beta',
    suffix: '×',
    hint: 'Beta do setor relavancado pela dívida da empresa. Digitar aqui substitui os dois.',
  },
  {
    field: 'extraPremium',
    label: 'Prêmio adicional',
    suffix: '%',
    hint: 'O que o CAPM não cobra: iliquidez, governança, concentração de controlador.',
  },
]

const DEBT_FIELD: RatePremiseFieldSpec = {
  field: 'debtSpread',
  label: 'Spread de crédito',
  suffix: '%',
  hint: 'Prêmio que a empresa paga sobre a taxa livre de risco, pelo degrau de dívida líquida/EBIT.',
}

interface CostOfCapitalPanelProps {
  method: CeilingMethodId
  costOfCapital: StockCostOfCapital | null
  riskFree: RiskFreeRate
  form: CeilingForm
  setField: (field: keyof CeilingForm, value: string) => void
  /** `false` quando o usuário digitou a taxa por cima do CAPM. */
  fromCapm: boolean
}

/**
 * De onde saiu a taxa que desconta este fluxo.
 *
 * A taxa é a premissa mais sensível de um fluxo descontado e era a única que a tela
 * pedia sem justificar: um campo "taxa de desconto (k)" com 20% dentro. Aqui ela é
 * montada à vista — taxa livre de risco do dia, spread do soberano retirado dela,
 * beta do setor relavancado pela dívida da empresa, prêmio de equity — e continua
 * editável, porque exigir mais que o custo de oportunidade é decisão de quem
 * investe, não do modelo.
 *
 * Quando o método desconta fluxo da firma, aparece o segundo andar: custo da dívida
 * depois do imposto, os dois pesos e o WACC. Casar taxa com fluxo é o que torna a
 * conta honesta, e mostrar as duas taxas lado a lado é o que deixa isso visível.
 */
export default function CostOfCapitalPanel({
  method,
  costOfCapital,
  riskFree,
  form,
  setField,
  fromCapm,
}: CostOfCapitalPanelProps) {
  const firmFlow = usesWacc(method)
  const fields = firmFlow ? [...RATE_FIELDS, DEBT_FIELD] : RATE_FIELDS
  const capm = costOfCapital?.capm ?? null
  const wacc = costOfCapital?.wacc ?? null

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">Custo de capital</h2>
        <div className="section-actions">
          <span className="section-count">
            {firmFlow ? 'fluxo da firma → WACC' : 'fluxo do acionista → Ke'}
          </span>
        </div>
      </div>

      <div className="card stack">
        <div className="form-grid">
          {fields.map((spec) => (
            <label className="field" key={spec.field}>
              <span>{spec.label}</span>
              <div className="field-affix">
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
          ))}
        </div>

        {capm == null ? (
          <p className="muted picker-hint">
            Sem taxa livre de risco legível não há montagem a mostrar: preencha o campo acima com
            o juro que você considera livre de risco.
          </p>
        ) : (
          <div className="ledger">
            <div className="calc-row">
              <span className="calc-label">
                Taxa livre de risco
                <small>
                  {riskFree.fallback
                    ? 'número de reserva do código: o Banco Central não respondeu'
                    : `${riskFree.label}, leitura de ${readDate(riskFree.asOf)}`}
                </small>
              </span>
              <span className="price calc-value">{percent(capm.riskFreeRate)}</span>
            </div>

            <div className="calc-row">
              <span className="calc-label">
                − spread do soberano
                <small>
                  título que pode dar default não é ativo livre de risco. O risco-país volta no
                  prêmio de equity, amplificado — somá-lo aqui e lá contaria duas vezes
                </small>
              </span>
              <span className="price calc-value">−{percent(capm.defaultSpread)}</span>
            </div>

            <div className="calc-row is-subtotal">
              <span className="calc-label">Taxa livre de risco limpa</span>
              <span className="price calc-value">{percent(capm.cleanRiskFreeRate)}</span>
            </div>

            <div className="calc-row">
              <span className="calc-label">
                β × prêmio de equity
                <small>
                  {ratio(capm.beta)} × ({percent(capm.maturePremium, 2)} de mercado maduro +{' '}
                  {percent(capm.countryRiskPremium, 2)} de risco-país)
                  {costOfCapital != null && costOfCapital.beta.relevered
                    ? ` · β do setor ${ratio(costOfCapital.beta.unlevered)} relavancado por D/E de ${ratio(costOfCapital.beta.debtToEquity ?? 0)}`
                    : costOfCapital?.beta.source === 'informado na tela'
                      ? ' · beta que você digitou'
                      : ' · beta alavancado do setor: em instituição financeira dívida é insumo, e relavancar não faz sentido'}
                </small>
              </span>
              <span className="price calc-value">{percent(capm.assetPremium)}</span>
            </div>

            {capm.extraPremium > 0 && (
              <div className="calc-row">
                <span className="calc-label">
                  + prêmio adicional
                  <small>o que você exige além do que o CAPM cobra</small>
                </span>
                <span className="price calc-value">{percent(capm.extraPremium)}</span>
              </div>
            )}

            <div className={`calc-row ${firmFlow ? 'is-subtotal' : 'is-total'}`}>
              <span className="calc-label">
                Custo de capital próprio (Ke)
                <small>a taxa de FCFE, dividendos e renda residual</small>
              </span>
              <span className={`calc-value ${firmFlow ? 'price' : 'is-ceiling'}`}>
                {percent(capm.costOfEquity)}
              </span>
            </div>

            {firmFlow && wacc != null && (
              <>
                <div className="calc-row">
                  <span className="calc-label">
                    Custo da dívida depois do imposto
                    <small>
                      ({percent(wacc.debt.riskFreeRate, 1)} + {percent(wacc.debt.spread, 1)} de
                      spread) × (1 − {percent(wacc.debt.taxRate, 0)})
                      {wacc.debt.netDebtToEbit != null
                        ? ` · dívida líquida de ${ratio(wacc.debt.netDebtToEbit)}× o EBIT`
                        : ''}
                    </small>
                  </span>
                  <span className="price calc-value">{percent(wacc.debt.afterTaxCostOfDebt)}</span>
                </div>

                <div className="calc-row">
                  <span className="calc-label">
                    Pesos de mercado
                    <small>
                      capital próprio {bigMoney(wacc.equityValue)} ({percent(wacc.equityWeight, 1)})
                      · dívida líquida {bigMoney(Math.max(0, wacc.netDebt))} (
                      {percent(wacc.debtWeight, 1)})
                      {wacc.netCash
                        ? ' · a empresa tem caixa líquido, então o peso da dívida é zero e o WACC é o próprio Ke'
                        : ''}
                    </small>
                  </span>
                  <span className="price calc-value">
                    {percent(wacc.equityWeight, 0)} / {percent(wacc.debtWeight, 0)}
                  </span>
                </div>

                <div className="calc-row is-total">
                  <span className="calc-label">
                    Custo médio ponderado (WACC)
                    <small>a taxa do fluxo da firma, que é de acionista e credor</small>
                  </span>
                  <span className="calc-value is-ceiling">{percent(wacc.wacc)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {firmFlow && costOfCapital?.waccUnavailable != null && (
          <div className="method-note">
            <p className="method-fallback">{costOfCapital.waccUnavailable}</p>
          </div>
        )}

        {!fromCapm && (
          <div className="method-note">
            <p className="method-fallback">
            A taxa em uso foi digitada por você, não montada pelo CAPM. É exigência sua de retorno
            — legítima, e diferente do custo de oportunidade que o modelo estima. "Restaurar"
            devolve a taxa do CAPM.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
