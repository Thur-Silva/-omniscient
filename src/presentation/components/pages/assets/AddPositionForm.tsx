import { useState } from 'react'
import {
  ASSET_TYPE_LABELS,
  isAssetType,
  isCurrency,
  type AssetType,
  type Currency,
} from '../../../../domain/asset/type'
import type { NewPosition } from '../../../../domain/portfolio/position'

interface AddPositionFormProps {
  onSubmit: (position: NewPosition) => Promise<void>
}

const EMPTY = {
  ticker: '',
  type: 'stock' as AssetType,
  currency: 'BRL' as Currency,
  quantity: '',
  averagePrice: '',
  acquiredAt: '',
  earningsPerShare: '',
  growthPercent: '',
}

export default function AddPositionForm({ onSubmit }: AddPositionFormProps) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const ticker = form.ticker.trim().toUpperCase()
    const quantity = Number(form.quantity)
    const averagePrice = Number(form.averagePrice)

    if (ticker === '') return setError('Informe o ticker do ativo, como WEGE3.')
    if (!Number.isFinite(quantity) || quantity <= 0) return setError('A quantidade precisa ser maior que zero.')
    if (!Number.isFinite(averagePrice) || averagePrice <= 0)
      return setError('O preço médio precisa ser maior que zero.')

    setSaving(true)
    try {
      await onSubmit({
        ticker,
        type: form.type,
        currency: form.currency,
        quantity,
        averagePrice,
        acquiredAt: form.acquiredAt === '' ? new Date().toISOString().slice(0, 10) : form.acquiredAt,
        earningsPerShare: form.earningsPerShare === '' ? undefined : Number(form.earningsPerShare),
        growthPercent: form.growthPercent === '' ? undefined : Number(form.growthPercent),
      })
      setForm(EMPTY)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a posição.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="section-head">
        <h2 className="section-title">Adicionar posição</h2>
        <span className="section-count">a cotação é lida ao salvar</span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Ticker</span>
          <input
            value={form.ticker}
            onChange={(e) => update('ticker', e.target.value)}
            placeholder="WEGE3"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Tipo</span>
          <select
            value={form.type}
            onChange={(e) => {
              if (isAssetType(e.target.value)) update('type', e.target.value)
            }}
          >
            {(Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Moeda</span>
          <select
            value={form.currency}
            onChange={(e) => {
              if (isCurrency(e.target.value)) update('currency', e.target.value)
            }}
          >
            <option value="BRL">Real (BRL)</option>
            <option value="USD">Dólar (USD)</option>
          </select>
        </label>
        <label className="field">
          <span>Quantidade</span>
          <input
            type="number"
            step="any"
            min="0"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Preço médio</span>
          <input
            type="number"
            step="any"
            min="0"
            value={form.averagePrice}
            onChange={(e) => update('averagePrice', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Data da compra</span>
          <input
            type="date"
            value={form.acquiredAt}
            onChange={(e) => update('acquiredAt', e.target.value)}
          />
        </label>
        <label className="field">
          <span>LPA</span>
          <input
            type="number"
            step="any"
            value={form.earningsPerShare}
            onChange={(e) => update('earningsPerShare', e.target.value)}
          />
          <span className="field-hint">Lucro por ação. Habilita o valor justo.</span>
        </label>
        <label className="field">
          <span>Crescimento</span>
          <input
            type="number"
            step="any"
            min="0"
            max="50"
            value={form.growthPercent}
            onChange={(e) => update('growthPercent', e.target.value)}
          />
          <span className="field-hint">Percentual anual, de 0 a 50.</span>
        </label>
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <button className="button" type="submit" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar posição'}
      </button>
    </form>
  )
}
