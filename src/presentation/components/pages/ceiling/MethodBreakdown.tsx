import type { CeilingBreakdown } from '../../../../domain/valuation/breakdown'
import { EXPLICIT_YEARS, PERPETUAL_GROWTH } from '../../../../domain/valuation/models/two-phase-dcf'
import { GRAHAM_DEFENSIVE_PRODUCT } from '../../../../domain/valuation/models/graham-number'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function money(value: number | null | undefined): string {
  return value == null ? '—' : brl.format(value)
}

function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

function ratio(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

interface MethodBreakdownProps {
  /** A memória de cálculo do método em uso, exceto o FCD, que tem tabela própria. */
  breakdown: Exclude<CeilingBreakdown, { method: 'fcd-2-fases' }>
}

/**
 * Memória de cálculo dos métodos que não são o FCD.
 *
 * Cada um mostra a sua própria conta, na ordem em que a conta acontece: não há um
 * formato comum a impor, e achatar tudo em "premissa → resultado" esconderia
 * justamente o passo que o usuário precisa conferir — o dividendo projetado no
 * DDM, o múltiplo justificado na renda residual, a divisão no Bazin.
 */
export default function MethodBreakdown({ breakdown }: MethodBreakdownProps) {
  if (breakdown.method === 'ddm-gordon') {
    const { ddm } = breakdown
    return (
      <div className="ledger">
        {ddm.years.map((year) => (
          <div className="calc-row" key={year.year}>
            <span className="calc-label">
              Ano {year.year}
              <small>
                dividendo projetado {money(year.dividend)} · g {percent(year.growthRate)}
              </small>
            </span>
            <span className="price calc-value">{money(year.presentValue)}</span>
          </div>
        ))}

        <div className="calc-row is-subtotal">
          <span className="calc-label">
            Fase explícita
            <small>{percent(ddm.explicitShare, 1)} do valuation</small>
          </span>
          <span className="price calc-value">{money(ddm.explicitPresentValue)}</span>
        </div>

        <div className="calc-row is-subtotal">
          <span className="calc-label">
            Perpetuidade
            <small>
              dividendo do ano {EXPLICIT_YEARS + 1} de {money(ddm.terminalDividend)} ÷ (k −{' '}
              {percent(ddm.perpetualGrowthRate, 0)}) = {money(ddm.terminalValue)} no ano{' '}
              {EXPLICIT_YEARS}, trazido a hoje · {percent(ddm.terminalShare, 1)} do valuation
            </small>
          </span>
          <span className="price calc-value">{money(ddm.terminalPresentValue)}</span>
        </div>

        <div className="calc-row is-total">
          <span className="calc-label">
            Preço teto por ação
            <small>
              soma dos valores presentes, com k de {percent(ddm.discountRate)}
              {ddm.perpetualGrowthCapped
                ? ` · g∞ pedido de ${percent(ddm.requestedPerpetualGrowth, 1)} limitado a ${(PERPETUAL_GROWTH * 100).toFixed(0)}%`
                : ''}
            </small>
          </span>
          <span className="calc-value is-ceiling">{money(ddm.fairValue)}</span>
        </div>
      </div>
    )
  }

  if (breakdown.method === 'bazin') {
    const { bazin } = breakdown
    return (
      <div className="ledger">
        <div className="calc-row">
          <span className="calc-label">
            Dividendo por ação
            <small>base do método; o original usa a média de cinco exercícios</small>
          </span>
          <span className="price calc-value">{money(bazin.dividendPerShare)}</span>
        </div>

        <div className="calc-row">
          <span className="calc-label">
            Yield exigido
            <small>quanto de renda você exige do preço pago</small>
          </span>
          <span className="price calc-value">{percent(bazin.requiredYield, 1)}</span>
        </div>

        {bazin.currentYield != null && (
          <div className="calc-row is-subtotal">
            <span className="calc-label">
              Yield no preço de hoje
              <small>o que o mercado entrega com este dividendo</small>
            </span>
            <span className="price calc-value">{percent(bazin.currentYield, 2)}</span>
          </div>
        )}

        <div className="calc-row is-total">
          <span className="calc-label">
            Preço teto por ação
            <small>
              {money(bazin.dividendPerShare)} ÷ {percent(bazin.requiredYield, 1)}
            </small>
          </span>
          <span className="calc-value is-ceiling">{money(bazin.fairValue)}</span>
        </div>
      </div>
    )
  }

  if (breakdown.method === 'renda-residual') {
    const { residual } = breakdown
    return (
      <div className="ledger">
        <div className="calc-row">
          <span className="calc-label">
            Valor patrimonial por ação
            <small>a base: é o capital que a empresa administra</small>
          </span>
          <span className="price calc-value">{money(residual.bookValuePerShare)}</span>
        </div>

        <div className="calc-row">
          <span className="calc-label">
            Retorno sobre o patrimônio
            <small>
              contra k de {percent(residual.discountRate)}: excedente de{' '}
              {percent(residual.excessReturn)}
            </small>
          </span>
          <span className="price calc-value">{percent(residual.returnOnEquity)}</span>
        </div>

        <div className="calc-row">
          <span className="calc-label">
            Crescimento perpétuo (g)
            <small>
              {residual.growthCapped
                ? `derivado de ${percent(residual.requestedGrowthRate, 1)} e limitado a ${(PERPETUAL_GROWTH * 100).toFixed(0)}%: a fórmula é de perpetuidade`
                : 'de ROE × (1 − payout), dentro do limite de perpetuidade'}
            </small>
          </span>
          <span className="price calc-value">{percent(residual.growthRate)}</span>
        </div>

        <div className="calc-row is-subtotal">
          <span className="calc-label">
            P/VP justificado
            <small>
              (ROE − g) ÷ (k − g) = ({percent(residual.returnOnEquity, 1)} −{' '}
              {percent(residual.growthRate, 1)}) ÷ ({percent(residual.discountRate, 1)} −{' '}
              {percent(residual.growthRate, 1)})
            </small>
          </span>
          <span className="price calc-value">{ratio(residual.justifiedPriceToBook)}×</span>
        </div>

        <div className="calc-row is-total">
          <span className="calc-label">
            Preço teto por ação
            <small>
              {money(residual.bookValuePerShare)} × {ratio(residual.justifiedPriceToBook)}
            </small>
          </span>
          <span className="calc-value is-ceiling">{money(residual.fairValue)}</span>
        </div>
      </div>
    )
  }

  const { graham } = breakdown
  return (
    <div className="ledger">
      <div className="calc-row">
        <span className="calc-label">
          Lucro por ação
          <small>últimos 12 meses, como a fonte publica</small>
        </span>
        <span className="price calc-value">{money(graham.earningsPerShare)}</span>
      </div>

      <div className="calc-row">
        <span className="calc-label">
          Valor patrimonial por ação
          <small>a metade patrimonial da conta, que amortece o lucro de ciclo</small>
        </span>
        <span className="price calc-value">{money(graham.bookValuePerShare)}</span>
      </div>

      <div className="calc-row is-subtotal">
        <span className="calc-label">
          Múltiplos no teto
          <small>
            P/L de {ratio(graham.priceToEarningsAtCeiling)} × P/VP de{' '}
            {ratio(graham.priceToBookAtCeiling)} = 22,5. O produto é o que a fórmula fixa; cada
            lado passa do limite defensivo quando lucro e patrimônio divergem
          </small>
        </span>
        <span className="price calc-value">{GRAHAM_DEFENSIVE_PRODUCT}</span>
      </div>

      <div className="calc-row is-total">
        <span className="calc-label">
          Preço teto por ação
          <small>
            √({GRAHAM_DEFENSIVE_PRODUCT} × {money(graham.earningsPerShare)} ×{' '}
            {money(graham.bookValuePerShare)})
          </small>
        </span>
        <span className="calc-value is-ceiling">{money(graham.fairValue)}</span>
      </div>
    </div>
  )
}
