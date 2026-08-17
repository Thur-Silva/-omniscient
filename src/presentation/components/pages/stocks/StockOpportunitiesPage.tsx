import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { STOCK_CRITERIA, type StockRejectionReason } from '../../../../domain/stock/ranking'
import {
  CEILING_METHODS,
  CEILING_METHOD_IDS,
  type CeilingMethodId,
} from '../../../../domain/valuation/methods'
import {
  DISCOUNT_RATE_OPTIONS,
  REQUIRED_YIELD_OPTIONS,
  useStockRanking,
} from '../../../hooks/useStockRanking'
import StockRankRow from './StockRankRow'

const REASON_LABELS: Record<StockRejectionReason, string> = {
  'liquidez-baixa': `liquidez abaixo de R$ ${STOCK_CRITERIA.minDailyLiquidity / 1_000_000}M/dia`,
  'sem-preco': 'sem cotação',
  'sem-metodo': 'sem premissa para nenhum método aplicável',
}

const integer = new Intl.NumberFormat('pt-BR')

/** Métodos que dependem do retorno exigido; para os outros, k não muda nada. */
const USES_DISCOUNT_RATE: readonly CeilingMethodId[] = [
  'fcd-2-fases',
  'ddm-gordon',
  'renda-residual',
]

export default function StockOpportunitiesPage() {
  const {
    ranking,
    discountRate,
    setDiscountRate,
    mode,
    setMode,
    requiredYield,
    setRequiredYield,
    loading,
    error,
    refresh,
  } = useStockRanking()
  const reduce = useReducedMotion()

  const ranked = ranking?.ranked ?? []
  const showDiscountRate = mode === 'setor' || USES_DISCOUNT_RATE.includes(mode as CeilingMethodId)
  const showRequiredYield = mode === 'setor' || mode === 'bazin'
  const singleMethod = mode === 'setor' ? null : CEILING_METHODS[mode]

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
        <span className="criteria-item">
          g ≤ k − {(STOCK_CRITERIA.growthGapToDiscount * 100).toFixed(0)}pp
        </span>
        <span className="criteria-item">ordem por margem contra o teto</span>
      </div>

      {/* A régua: por setor cada ativo é avaliado pelo modelo da economia dele;
          um método fixo compara todo o mercado pela mesma fórmula. */}
      <div className="filter-group">
        <span className="filter-label">Régua de avaliação</span>
        <div className="chips" role="group" aria-label="Método de preço teto">
          <button
            type="button"
            aria-pressed={mode === 'setor'}
            className={`chip${mode === 'setor' ? ' is-active' : ''}`}
            onClick={() => setMode('setor')}
          >
            Por setor
          </button>
          {CEILING_METHOD_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              className={`chip${mode === id ? ' is-active' : ''}`}
              onClick={() => setMode(id)}
              title={CEILING_METHODS[id].label}
            >
              {CEILING_METHODS[id].short}
            </button>
          ))}
        </div>
        <p className="muted picker-hint">
          {singleMethod == null ? (
            <>
              Cada ação é avaliada pelo método da natureza dela: banco pelo patrimônio,
              concessão pelo dividendo, cíclica pela média com o patrimônio. O método aparece
              em cada linha.
            </>
          ) : (
            <>
              <strong>{singleMethod.label}</strong> — {singleMethod.formula}. {singleMethod.fits}{' '}
              <em>{singleMethod.limits}</em>
            </>
          )}
        </p>
      </div>

      {showDiscountRate && (
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
      )}

      {showRequiredYield && (
        <div className="filter-group">
          <span className="filter-label">Yield exigido (Bazin)</span>
          <div className="chips" role="group" aria-label="Yield exigido">
            {REQUIRED_YIELD_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={requiredYield === rate}
                className={`chip${requiredYield === rate ? ' is-active' : ''}`}
                onClick={() => setRequiredYield(rate)}
              >
                {(rate * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
      )}

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
              Nenhuma das {integer.format(ranking?.universeSize ?? 0)} ações analisadas pode ser
              avaliada por esta régua com os dados que a fonte traz.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="rank-head">
            <span className="eyebrow">
              {ranked.length} {ranked.length === 1 ? 'ação avaliada' : 'ações avaliadas'} de{' '}
              {integer.format(ranking?.universeSize ?? 0)}
            </span>
            <span className="rank-legend">
              ordem = margem de desconto contra o preço teto · maior é melhor
              {/* Aviso honesto: o número de Graham não desconta fluxo a k, então
                  produz teto mais generoso e sobe na lista mista. Comparação
                  estrita é dentro de um método — daí a régua única. */}
              {mode === 'setor' && ' · margens de métodos diferentes não são estritamente comparáveis'}
            </span>
          </div>

          {/* Composição da lista: qual método avaliou quantas ações. */}
          {ranking != null && Object.keys(ranking.methodCounts).length > 1 && (
            <div className="method-mix">
              {CEILING_METHOD_IDS.filter((id) => (ranking.methodCounts[id] ?? 0) > 0).map((id) => (
                <span className="method-mix-item" key={id}>
                  <b>{ranking.methodCounts[id]}</b> {CEILING_METHODS[id].short}
                </span>
              ))}
            </div>
          )}

          <motion.div
            className="ledger"
            key={`${discountRate}-${mode}-${requiredYield}`}
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
        Premissas do StatusInvest, que não publica API oficial. A ordem sai só da margem de
        desconto; o P/L aparece como referência, não como critério. Cada régua é um registro
        próprio no banco, guardado por 10 minutos, e todas partem do mesmo snapshot de
        fundamentos. Isto não é recomendação de investimento.
      </p>
    </div>
  )
}
