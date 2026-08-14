import { useState } from 'react'

export default function SettingsPage() {
  const [baseCurrency, setBaseCurrency] = useState('BRL')
  const [benchmark, setBenchmark] = useState('IBOV')
  const [aaBondYield, setAaBondYield] = useState('4.4')

  return (
    <div className="page">
      <section className="card">
        <h2>Preferências de análise</h2>
        <div className="form-grid">
          <label className="field">
            <span>Moeda base</span>
            <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
              <option value="BRL">Real (BRL)</option>
              <option value="USD">Dólar (USD)</option>
            </select>
          </label>
          <label className="field">
            <span>Benchmark de comparação</span>
            <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)}>
              <option value="IBOV">Ibovespa (IBOV)</option>
              <option value="SP500">S&P 500</option>
              <option value="CDI">CDI</option>
            </select>
          </label>
          <label className="field">
            <span>Yield de título AAA (% a.a.)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={aaBondYield}
              onChange={(e) => setAaBondYield(e.target.value)}
            />
          </label>
        </div>
        <p className="muted">
          Preferências aplicadas aos modelos de valuation (Graham e DCF). A persistência via
          backend será conectada na camada infra.
        </p>
      </section>
    </div>
  )
}
