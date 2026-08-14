import { ASSET_TYPE_LABELS, CURRENCY_SYMBOLS, type AssetType, type Currency } from '../../../../domain/asset/type'
import { usePortfolio } from '../../../hooks/usePortfolio'
import AddPositionForm from './AddPositionForm'

const formatters: Record<Currency, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  USD: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }),
}

function money(value: number | null | undefined, currency: Currency = 'BRL'): string {
  return value == null ? '—' : formatters[currency].format(value)
}

function percent(value: number | null | undefined, digits = 2): string {
  return value == null ? '—' : `${value.toFixed(digits)}%`
}

function signClass(value: number | null | undefined): string {
  if (value == null) return ''
  return value >= 0 ? 'positive' : 'negative'
}

export default function AssetsPage() {
  const { view, loading, error, refresh, addPosition, removePosition } = usePortfolio()

  const portfolio = view?.portfolio
  const rows = view?.rows ?? []
  const totalInvested = portfolio?.totalInvested ?? 0
  const totalValue = portfolio?.totalCurrentValue ?? null
  const totalProfit = portfolio?.totalProfit ?? null
  const totalProfitPercent = portfolio?.totalProfitPercent ?? null
  const allocation = portfolio?.allocationByType() ?? {}

  return (
    <div className="page">
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="button button-ghost" type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      )}

      {view != null && view.quoteErrors.length > 0 && (
        <div className="alert alert-warning">
          <strong>Algumas cotações não foram carregadas:</strong>
          <ul className="alert-list">
            {view.quoteErrors.map((quoteError) => (
              <li key={quoteError.ticker}>
                <code>{quoteError.ticker}</code> — {quoteError.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="summary-grid">
        <article className="card">
          <span className="card-label">Total investido</span>
          <strong className="card-value">{money(totalInvested)}</strong>
        </article>
        <article className="card">
          <span className="card-label">Valor atual</span>
          <strong className="card-value">{money(totalValue)}</strong>
        </article>
        <article className="card">
          <span className="card-label">Resultado</span>
          <strong className={`card-value ${signClass(totalProfit)}`}>
            {totalProfit == null ? '—' : `${money(totalProfit)} (${percent(totalProfitPercent)})`}
          </strong>
        </article>
        <article className="card">
          <span className="card-label">Alocação por tipo</span>
          {Object.keys(allocation).length === 0 ? (
            <span className="muted">Sem posições</span>
          ) : (
            <div className="allocation">
              {(Object.entries(allocation) as [AssetType, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([type, pct]) => (
                  <div key={type} className="allocation-row">
                    <span>{ASSET_TYPE_LABELS[type]}</span>
                    <div className="allocation-bar">
                      <div className="allocation-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <strong>{pct.toFixed(1)}%</strong>
                  </div>
                ))}
            </div>
          )}
        </article>
      </section>

      <section className="card">
        <div className="table-header">
          <h2>Ativos</h2>
          <div className="table-actions">
            <span className="table-count">
              {loading ? 'Carregando cotações…' : `${rows.length} ${rows.length === 1 ? 'posição' : 'posições'}`}
            </span>
            <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
              Atualizar
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="muted empty-state">
            {loading
              ? 'Carregando…'
              : 'Nenhuma posição cadastrada. Adicione um ativo abaixo para buscar a cotação na brapi.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Qtde</th>
                  <th>Preço médio</th>
                  <th>Preço atual</th>
                  <th>Dia</th>
                  <th>Investido</th>
                  <th>Valor atual</th>
                  <th>P/L</th>
                  <th>Valor justo</th>
                  <th>Margem de segurança</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const currency = row.quote?.currency ?? row.position.currency
                  const invested = row.position.quantity * row.position.averagePrice
                  const currentValue = row.quote == null ? null : row.position.quantity * row.quote.price
                  const profit = currentValue == null ? null : currentValue - invested
                  const profitPercent = profit == null || invested === 0 ? null : (profit / invested) * 100

                  return (
                    <tr key={row.position.id}>
                      <td>
                        <div className="asset-cell">
                          <strong>{row.asset.ticker}</strong>
                          <span>{row.quoteError ?? row.asset.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="badge">{ASSET_TYPE_LABELS[row.asset.type]}</span>
                      </td>
                      <td>{row.position.quantity}</td>
                      <td>{money(row.position.averagePrice, currency)}</td>
                      <td>{money(row.quote?.price, currency)}</td>
                      <td className={signClass(row.quote?.changePercent)}>
                        {percent(row.quote?.changePercent)}
                      </td>
                      <td>{money(invested, currency)}</td>
                      <td>{money(currentValue, currency)}</td>
                      <td className={signClass(profit)}>{percent(profitPercent)}</td>
                      <td>{money(row.fairValue, currency)}</td>
                      <td className={signClass(row.safetyMargin)}>
                        {row.safetyMargin == null ? '—' : `${(row.safetyMargin * 100).toFixed(1)}%`}
                      </td>
                      <td>
                        <button
                          className="button button-ghost"
                          type="button"
                          onClick={() => void removePosition(row.position.id)}
                          aria-label={`Remover ${row.asset.ticker}`}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddPositionForm onSubmit={addPosition} />

      <footer className="quote-note">
        Cotações em {CURRENCY_SYMBOLS.BRL} fornecidas pela{' '}
        <a href="https://brapi.dev" target="_blank" rel="noreferrer">
          brapi
        </a>
        {view?.lastUpdatedAt != null &&
          ` — atualizado às ${new Date(view.lastUpdatedAt).toLocaleTimeString('pt-BR')}`}
        . Valor justo pelo modelo de Graham, calculado apenas para posições com LPA e crescimento
        informados.
      </footer>
    </div>
  )
}
