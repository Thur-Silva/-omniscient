import type { Asset } from './entity'

export interface AssetRepository {
  findAll(): Promise<Asset[]>
  findById(id: string): Promise<Asset | null>
  findByTicker(ticker: string): Promise<Asset | null>
  save(asset: Asset): Promise<Asset>
  delete(id: string): Promise<void>
}
