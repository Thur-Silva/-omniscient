import { InvalidQuoteError } from '../errors/asset-error'
import type { AssetSnapshot, AssetType, Currency } from './type'

export interface AssetProps {
  id: string
  ticker: string
  name: string
  type: AssetType
  currency: Currency
  sector?: string
  createdAt?: string
  updatedAt?: string
}

export class Asset {
  readonly id: string
  readonly ticker: string
  readonly name: string
  readonly type: AssetType
  readonly currency: Currency
  readonly sector?: string
  readonly createdAt: string
  readonly updatedAt: string
  private snapshot?: AssetSnapshot

  constructor(props: AssetProps) {
    const now = new Date().toISOString()
    this.id = props.id
    this.ticker = props.ticker
    this.name = props.name
    this.type = props.type
    this.currency = props.currency
    this.sector = props.sector
    this.createdAt = props.createdAt ?? now
    this.updatedAt = props.updatedAt ?? now
  }

  get currentPrice(): number | undefined {
    return this.snapshot?.price
  }

  get snapshotAsOf(): string | undefined {
    return this.snapshot?.asOf
  }

  updateQuote(snapshot: AssetSnapshot): void {
    if (!Number.isFinite(snapshot.price) || snapshot.price <= 0) {
      throw new InvalidQuoteError(`Preço inválido para ${this.ticker}: ${snapshot.price}`)
    }
    if (snapshot.currency !== this.currency) {
      throw new InvalidQuoteError(
        `Moeda da cotação (${snapshot.currency}) difere da moeda de ${this.ticker} (${this.currency})`,
      )
    }
    this.snapshot = snapshot
  }
}
