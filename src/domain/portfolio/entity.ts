import type { Asset } from '../asset/entity'
import type { AssetType } from '../asset/type'

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
      // Aporte no mesmo ativo: o preço médio precisa ser reponderado pela
      // quantidade, senão o custo da posição fica errado.
      const totalQuantity = existing.quantity + item.quantity
      if (totalQuantity > 0) {
        existing.averagePrice = (existing.invested + item.invested) / totalQuantity
      }
      existing.quantity = totalQuantity
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
    if (this.items.length === 0) return null
    let total = 0
    for (const item of this.items) {
      const value = item.currentValue
      if (value == null) return null
      total += value
    }
    return total
  }

  get totalProfit(): number | null {
    const current = this.totalCurrentValue
    return current == null ? null : current - this.totalInvested
  }

  get totalProfitPercent(): number | null {
    const profit = this.totalProfit
    return profit == null ? null : this.totalInvested === 0 ? 0 : (profit / this.totalInvested) * 100
  }

  allocationByType(): Partial<Record<AssetType, number>> {
    const total = this.totalInvested
    if (total === 0) return {}

    // Soma o valor absoluto por tipo primeiro; converter para percentual dentro
    // do laço somava percentual com valor absoluto no segundo item de um tipo.
    const invested: Partial<Record<AssetType, number>> = {}
    for (const item of this.items) {
      const type = item.asset.type
      invested[type] = (invested[type] ?? 0) + item.invested
    }

    const allocation: Partial<Record<AssetType, number>> = {}
    for (const [type, value] of Object.entries(invested) as [AssetType, number][]) {
      allocation[type] = (value / total) * 100
    }
    return allocation
  }
}
