import type { Asset } from '../asset/entity'

export interface PortfolioItemProps {
  asset: Asset
  quantity: number
  averagePrice: number
  acquiredAt: string
}

export class PortfolioItem {
  readonly asset: Asset
  quantity: number
  averagePrice: number
  acquiredAt: string

  constructor(props: PortfolioItemProps) {
    this.asset = props.asset
    this.quantity = props.quantity
    this.averagePrice = props.averagePrice
    this.acquiredAt = props.acquiredAt
  }

  get invested(): number {
    return this.quantity * this.averagePrice
  }

  get currentValue(): number | null {
    const price = this.asset.currentPrice
    return price == null ? null : this.quantity * price
  }

  get profit(): number | null {
    const current = this.currentValue
    return current == null ? null : current - this.invested
  }

  get profitPercent(): number | null {
    const profit = this.profit
    return profit == null ? null : this.invested === 0 ? 0 : (profit / this.invested) * 100
  }
}

export interface PortfolioProps {
  id: string
  userId: string
  name: string
  createdAt?: string
}

export class Portfolio {
  readonly id: string
  readonly userId: string
  name: string
  readonly createdAt: string
  private items: PortfolioItem[] = []

  constructor(props: PortfolioProps) {
    this.id = props.id
    this.userId = props.userId
    this.name = props.name
    this.createdAt = props.createdAt ?? new Date().toISOString()
  }

  addItem(item: PortfolioItem): void {
    const existing = this.items.find((i) => i.asset.id === item.asset.id)
    if (existing) {
      existing.quantity += item.quantity
      return
    }
    this.items.push(item)
  }

  removeItem(assetId: string): void {
    this.items = this.items.filter((i) => i.asset.id !== assetId)
  }

  get allItems(): readonly PortfolioItem[] {
    return this.items
  }

  get totalInvested(): number {
    return this.items.reduce((sum, item) => sum + item.invested, 0)
  }

  get totalCurrentValue(): number | null {
    const values = this.items.map((i) => i.currentValue)
    if (values.some((v) => v == null)) return null
    return values.reduce<number>((sum, v) => sum + (v as number), 0)
  }

  get totalProfit(): number | null {
    const current = this.totalCurrentValue
    return current == null ? null : current - this.totalInvested
  }

  get totalProfitPercent(): number | null {
    const profit = this.totalProfit
    return profit == null ? null : this.totalInvested === 0 ? 0 : (profit / this.totalInvested) * 100
  }

  allocationByType(): Record<string, number> {
    const total = this.totalInvested
    if (total === 0) return {}
    const allocation: Record<string, number> = {}
    for (const item of this.items) {
      const type = item.asset.type
      allocation[type] = ((allocation[type] ?? 0) + item.invested) / total * 100
    }
    return allocation
  }
}
