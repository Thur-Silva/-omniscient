export type TargetPriceDirection = 'above' | 'below'

export interface TargetPriceProps {
  id: string
  assetId: string
  price: number
  direction: TargetPriceDirection
  rationale?: string
  createdAt?: string
}

export class TargetPrice {
  readonly id: string
  readonly assetId: string
  readonly price: number
  readonly direction: TargetPriceDirection
  readonly rationale?: string
  readonly createdAt: string

  constructor(props: TargetPriceProps) {
    this.id = props.id
    this.assetId = props.assetId
    this.price = props.price
    this.direction = props.direction
    this.rationale = props.rationale
    this.createdAt = props.createdAt ?? new Date().toISOString()
  }

  distanceFrom(currentPrice: number): number {
    if (currentPrice <= 0) return 0
    return ((this.price - currentPrice) / currentPrice) * 100
  }
}
