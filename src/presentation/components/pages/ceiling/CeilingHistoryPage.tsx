import { Link } from 'react-router-dom'
import type { CeilingValuation } from '../../../../domain/valuation/ceiling-valuation'
import { useCeilingHistory } from '../../../hooks/useCeilingHistory'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const when = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function money(value: number | null | undefined): string {
  return value == null ? '—' : brl.format(value)
}

function percent(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`
}

/**
 * Tudo o que o usuário salvou da calculadora, do cálculo mais recente para o
 * mais antigo. Cada linha reabre a calculadora com as premissas daquele save.
 */
export default function CeilingHistoryPage() {
  const { history, loading, error, refresh } = useCeilingHistory()

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1 className="page-title">Meus preços teto</h1>
        <div className="section-actions">
          <Link className="button button-ghost" to="/teto">
            Calcular novo
          </Link>
        </div>
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="button button-quiet" type="button" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted picker-hint">Lendo seu histórico…</p>
      ) : history.length === 0 ? (
        <div className="card history-empty">
          <h2 className="section-title">Nenhum preço teto salvo ainda</h2>
          <p>
            Quando você calcular o preço teto de uma ação e salvar, ela fica aqui com as
            premissas e a memória de cálculo daquele momento.
          </p>
          <Link className="button" to="/teto">
            Calcular preço teto
          </Link>
        </div>
      ) : (
        <ul className="history-list">
          {history.map((record) => (
            <HistoryCard key={record.id} record={record} />
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryCard({ record }: { record: CeilingValuation }) {
  const { ticker, ceilingPrice, marketPrice, safetyMargin, assumptions, breakdown, createdAt } =
    record
  const marginClass =
    safetyMargin == null ? 'is-idle' : safetyMargin >= 0 ? 'is-margin' : 'is-negative'

  return (
    <li>
      <Link className={`history-card ${marginClass}`} to={`/teto/salvo/${record.id}`}>
        <span className="history-head">
          <span className="picker-identity">
            <strong className="ticker">{ticker}</strong>
            <span>salvo em {when.format(new Date(createdAt))}</span>
          </span>
          <span className={`history-margin ${marginClass}`}>
            {safetyMargin == null
              ? 'sem preço de mercado'
              : `${safetyMargin > 0 ? '+' : ''}${(safetyMargin * 100).toFixed(1)}%`}
          </span>
        </span>

        <span className="history-readout">
          <span className="history-ceiling">{money(ceilingPrice)}</span>
          <span className="history-market">mercado {money(marketPrice)}</span>
        </span>

        <span className="criteria history-criteria">
          <span className="criteria-item">g {percent(breakdown.growthRate)}</span>
          <span className="criteria-item">g∞ {percent(breakdown.perpetualGrowthRate, 1)}</span>
          <span className="criteria-item">k {percent(breakdown.discountRate)}</span>
          <span className="criteria-item">ROE {percent(assumptions.returnOnEquity)}</span>
          <span className="criteria-item">payout {percent(assumptions.payout, 0)}</span>
        </span>

        <span className="history-recalc">Abrir na calculadora →</span>
      </Link>
    </li>
  )
}
