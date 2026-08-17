import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { STOCK_CRITERIA, type StockRejectionReason } from '../../../../domain/stock/ranking'
import { PERPETUAL_GROWTH } from '../../../../domain/valuation/models/two-phase-dcf'
import { DISCOUNT_RATE_OPTIONS, useStockRanking } from '../../../hooks/useStockRanking'
import StockRankRow from './StockRankRow'

const REASON_LABELS: Record<StockRejectionReason, string> = {
  'sem-premissas': 'sem LPA, payout, ROE ou nº de ações na fonte',
  'sem-lucro': 'sem lucro positivo (o modelo desconta lucro)',
  'liquidez-baixa': `liquidez abaixo de R$ ${STOCK_CRITERIA.minDailyLiquidity / 1_000_000}M/dia`,
  'sem-preco': 'sem cotação',
  'modelo-recusou': 'premissas fora do que o modelo aceita',
}

const integer = new Intl.NumberFormat('pt-BR')

export default function StockOpportunitiesPage() {
  const { ranking, discountRate, setDiscountRate, loading, error, refresh } = useStockRanking()
  const reduce = useReducedMotion()

  const ranked = ranking?.ranked ?? []

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 className="page-title">Ações descontadas</h1>
        <div className="section-actions">
          {/* A calculadora de uma ação só, para ajustar premissas à mão. */}
          <Link className="button button-ghost" to="/teto">
            Calcular uma ação
          </Link>
          <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Apurando…' : 'Atualizar'}
          </button>
        </div>
      </header>

      <div className="criteria">
        <span className="criteria-item">
          liquidez ≥ R$ {STOCK_CRITERIA.minDailyLiquidity / 1_000_000}M/dia
        </span>
        <span className="criteria-item">lucro positivo</span>
        <span className="criteria-item">
          g ≤ k − {(STOCK_CRITERIA.growthGapToDiscount * 100).toFixed(0)}pp
        </span>
        <span className="criteria-item">g perpétuo {(PERPETUAL_GROWTH * 100).toFixed(0)}%</span>
      </div>

      {/* k é premissa do investidor, então fica na mão dele. Conjunto discreto
          porque cada valor vira um registro próprio no banco. */}
      <div className="filter-group">
        <span className="filter-label">Retorno exigido (k)</span>
        <div className="chips" role="group" aria-label="Taxa de desconto">
          {DISCOUNT_RATE_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              aria-pressed={discountRate === rate}
              className={`chip${discountRate === rate ? ' is-active' : ''}`}
              onClick={() => setDiscountRate(rate)}
            >
              {(rate * 100).toFixed(0)}%
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="button button-ghost" type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      )}

      {loading && ranking == null ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Apurando o mercado</h3>
            <p>Calculando o preço teto de cada ação listada.</p>
          </div>
        </div>
      ) : ranked.length === 0 && !error ? (
        <div className="ledger">
          <div className="empty-invite">
            <h3>Nenhuma ação passou nos critérios</h3>
            <p>
              Nenhuma das {integer.format(ranking?.universeSize ?? 0)} ações analisadas atende aos
              filtros com k de {(discountRate * 100).toFixed(0)}%.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="rank-head">
            <span className="eyebrow">
              {ranked.length} {ranked.length === 1 ? 'ação aprovada' : 'ações aprovadas'} de{' '}
              {integer.format(ranking?.universeSize ?? 0)}
            </span>
            <span className="rank-legend">
              ordem = margem de desconto contra o preço teto · maior é melhor
            </span>
          </div>

          <motion.div
            className="ledger"
            key={discountRate}
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            {ranked.map((entry) => (
              <StockRankRow key={entry.fundamentals.ticker} entry={entry} />
            ))}
          </motion.div>

          {ranking != null && (
            <div className="rejected-note">
              <span className="eyebrow">Descartadas</span>
              <ul className="rejected-list">
                {(Object.entries(ranking.rejectedByReason) as [StockRejectionReason, number][])
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li key={reason}>
                      <b>{integer.format(count)}</b> {REASON_LABELS[reason]}
                    </li>
                  ))}
              </ul>
              {ranking.cappedCount > 0 && (
                <p className="muted picker-hint">
                  {ranking.cappedCount}{' '}
                  {ranking.cappedCount === 1 ? 'ação teve' : 'ações tiveram'} o crescimento truncado
                  em {((discountRate - STOCK_CRITERIA.growthGapToDiscount) * 100).toFixed(0)}%,
                  porque o ROE da fonte levaria o teto a valores sem sentido. Estão marcadas na
                  lista.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <p className="quote-note">
        Preço teto por fluxo de caixa descontado em duas fases (ver <code>/teto</code>), com as
        premissas vindas do StatusInvest e o crescimento derivado de ROE × (1 − payout). A ordem sai
        só da margem de desconto: o P/L aparece como referência, não como critério. O ranking é
        calculado no servidor e guardado no banco por 10 minutos, para a fonte não ser consultada
        mais que o necessário. Isto não é recomendação de investimento.
      </p>
    </div>
  )
}
