import { Asset } from '../../../../domain/asset/entity'
import { ASSET_TYPE_LABELS, CURRENCY_SYMBOLS, type AssetType } from '../../../../domain/asset/type'
import { Portfolio, PortfolioItem } from '../../../../domain/portfolio/entity'
import { DcfModel, type DcfInput } from '../../../../domain/valuation/models/dcf'
import { GrahamModel, type GrahamInput } from '../../../../domain/valuation/models/graham'
import { calculateSafetyMargin } from '../../../../domain/valuation/models/safety-margin'

interface AssetRow {
  asset: Asset
  quantity: number
  averagePrice: number
  invested: number
  currentValue: number | null
  profit: number | null
  profitPercent: number | null
  fairValue: number | null
  safetyMargin: number | null
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function buildPortfolio(): Portfolio {
  const petro = new Asset({ id: '1', ticker: 'PETR4', name: 'Petrobras PN', type: 'stock', currency: 'BRL', sector: 'Petróleo' })
  petro.updateQuote({ price: 42.15, currency: 'BRL', asOf: new Date().toISOString() })

  const vale = new Asset({ id: '2', ticker: 'VALE3', name: 'Vale ON', type: 'stock', currency: 'BRL', sector: 'Mineração' })
  vale.updateQuote({ price: 58.9, currency: 'BRL', asOf: new Date().toISOString() })

  const itau = new Asset({ id: '3', ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'stock', currency: 'BRL', sector: 'Bancos' })
  itau.updateQuote({ price: 34.72, currency: 'BRL', asOf: new Date().toISOString() })

  const hglg = new Asset({ id: '4', ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'fii', currency: 'BRL', sector: 'Logística' })
  hglg.updateQuote({ price: 152.4, currency: 'BRL', asOf: new Date().toISOString() })

  const bova = new Asset({ id: '5', ticker: 'BOVA11', name: 'iShares Ibovespa ETF', type: 'etf', currency: 'BRL', sector: 'Índices' })
  bova.updateQuote({ price: 129.8, currency: 'BRL', asOf: new Date().toISOString() })

  const selic = new Asset({ id: '6', ticker: 'SELIC', name: 'Tesouro Selic 2029', type: 'treasury', currency: 'BRL', sector: 'Renda Fixa' })
  selic.updateQuote({ price: 11_452.03, currency: 'BRL', asOf: new Date().toISOString() })

  const portfolio = new Portfolio({ id: 'p1', userId: 'u1', name: 'Carteira Principal' })
  portfolio.addItem(new PortfolioItem({ asset: petro, quantity: 100, averagePrice: 38.2, acquiredAt: '2024-03-10' }))
  portfolio.addItem(new PortfolioItem({ asset: vale, quantity: 80, averagePrice: 62.1, acquiredAt: '2024-05-22' }))
  portfolio.addItem(new PortfolioItem({ asset: itau, quantity: 120, averagePrice: 29.85, acquiredAt: '2024-08-01' }))
  portfolio.addItem(new PortfolioItem({ asset: hglg, quantity: 10, averagePrice: 165.5, acquiredAt: '2023-11-14' }))
  portfolio.addItem(new PortfolioItem({ asset: bova, quantity: 30, averagePrice: 118.4, acquiredAt: '2024-02-05' }))
  portfolio.addItem(new PortfolioItem({ asset: selic, quantity: 1, averagePrice: 10_980.0, acquiredAt: '2024-01-20' }))
  return portfolio
}

const graham = new GrahamModel()
const dcf = new DcfModel()

const FUNDAMENTALS: Partial<Record<string, { eps: number; growth: number } | { fcf: number; shares: number; growth: number }>> = {
  PETR4: { eps: 7.9, growth: 6 },
  VALE3: { eps: 6.4, growth: 5 },
  ITUB4: { eps: 3.1, growth: 9 },
}

function fairValueFor(asset: Asset): number | null {
  const fundamentals = FUNDAMENTALS[asset.ticker]
  const price = asset.currentPrice
  if (!fundamentals || price == null) return null

  if ('eps' in fundamentals) {
    const input: GrahamInput = {
      marketPrice: price,
      earningsPerShare: fundamentals.eps,
      growthPercent: fundamentals.growth,
    }
    return graham.evaluate(input).fairValue
  }

  const input: DcfInput = {
    marketPrice: price,
    freeCashFlow: fundamentals.fcf,
    sharesOutstanding: fundamentals.shares,
    growthRate: fundamentals.growth,
    discountRate: 0.11,
    terminalGrowthRate: 0.03,
  }
  return dcf.evaluate(input).fairValue
}

export default function AssetsPage() {
  const portfolio = buildPortfolio()

  const rows: AssetRow[] = portfolio.allItems.map((item) => {
    const currentValue = item.currentValue
    const fairValue = fairValueFor(item.asset)
    const marketPrice = item.asset.currentPrice

    return {
      asset: item.asset,
      quantity: item.quantity,
      averagePrice: item.averagePrice,
      invested: item.invested,
      currentValue,
      profit: item.profit,
      profitPercent: item.profitPercent,
      fairValue,
      safetyMargin:
        fairValue != null && marketPrice != null
          ? calculateSafetyMargin(fairValue, marketPrice)
          : null,
    }
  })

  const totalInvested = portfolio.totalInvested
  const totalValue = portfolio.totalCurrentValue
  const totalProfit = portfolio.totalProfit
  const totalProfitPercent = portfolio.totalProfitPercent
  const allocation = portfolio.allocationByType()

  return (
    <div className="page">
      <section className="summary-grid">
        <article className="card">
          <span className="card-label">Total investido</span>
          <strong className="card-value">{brl.format(totalInvested)}</strong>
        </article>
        <article className="card">
          <span className="card-label">Valor atual</span>
          <strong className="card-value">
            {totalValue == null ? '—' : brl.format(totalValue)}
          </strong>
        </article>
        <article className="card">
          <span className="card-label">Resultado</span>
          <strong className={`card-value${totalProfit != null && totalProfit >= 0 ? ' positive' : ' negative'}`}>
            {totalProfit == null ? '—' : `${brl.format(totalProfit)} (${totalProfitPercent?.toFixed(2)}%)`}
          </strong>
        </article>
        <article className="card">
          <span className="card-label">Alocação por tipo</span>
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
        </article>
      </section>

      <section className="card">
        <div className="table-header">
          <h2>Ativos</h2>
          <span className="table-count">{rows.length} posições</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Tipo</th>
                <th>Qtde</th>
                <th>Preço médio</th>
                <th>Preço atual</th>
                <th>Investido</th>
                <th>Valor atual</th>
                <th>P/L</th>
                <th>Valor justo</th>
                <th>Margem de segurança</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.asset.id}>
                  <td>
                    <div className="asset-cell">
                      <strong>{row.asset.ticker}</strong>
                      <span>{row.asset.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{ASSET_TYPE_LABELS[row.asset.type]}</span>
                  </td>
                  <td>{row.quantity}</td>
                  <td>{brl.format(row.averagePrice)}</td>
                  <td>{row.asset.currentPrice == null ? '—' : brl.format(row.asset.currentPrice)}</td>
                  <td>{brl.format(row.invested)}</td>
                  <td>{row.currentValue == null ? '—' : brl.format(row.currentValue)}</td>
                  <td className={row.profit != null && row.profit >= 0 ? 'positive' : 'negative'}>
                    {row.profit == null ? '—' : `${row.profitPercent?.toFixed(2)}%`}
                  </td>
                  <td>{row.fairValue == null ? '—' : brl.format(row.fairValue)}</td>
                  <td className={row.safetyMargin != null && row.safetyMargin >= 0 ? 'positive' : 'negative'}>
                    {row.safetyMargin == null ? '—' : `${(row.safetyMargin * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="quote-note">
        Cotações de exemplo em {CURRENCY_SYMBOLS.BRL} para fins de demonstração. Valores justos calculados com os modelos Graham e DCF do domínio.
      </footer>
    </div>
  )
}
