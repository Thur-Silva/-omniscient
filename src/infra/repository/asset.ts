import { Asset } from '../../domain/asset/entity'
import type { AssetRepository } from '../../domain/asset/repository'
import type { AssetSnapshot } from '../../domain/asset/type'
import type { HttpClient } from '../http/client'

interface AssetDto {
  id: string
  ticker: string
  name: string
  type: string
  currency: string
  sector?: string
  createdAt?: string
  updatedAt?: string
  quote?: {
    price: number
    currency: string
    asOf: string
  } | null
}

export class AssetApiRepository implements AssetRepository {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async findAll(): Promise<Asset[]> {
    const dtos = await this.http.get<AssetDto[]>('/assets')
    return dtos.map((dto) => this.toAsset(dto))
  }

  async findById(id: string): Promise<Asset | null> {
    const dto = await this.http.get<AssetDto>(`/assets/${id}`)
    return dto == null ? null : this.toAsset(dto)
  }

  async findByTicker(ticker: string): Promise<Asset | null> {
    const dto = await this.http.get<AssetDto>(`/assets/${ticker}/ticker`)
    return dto == null ? null : this.toAsset(dto)
  }

  async save(asset: Asset): Promise<Asset> {
    const dto = await this.http.post<AssetDto>('/assets', {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      currency: asset.currency,
      sector: asset.sector,
    })
    return this.toAsset(dto)
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/assets/${id}`)
  }

  private toAsset(dto: AssetDto): Asset {
    const asset = new Asset({
      id: dto.id,
      ticker: dto.ticker,
      name: dto.name,
      type: dto.type as Asset['type'],
      currency: dto.currency as Asset['currency'],
      sector: dto.sector,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    })

    if (dto.quote) {
      const snapshot: AssetSnapshot = {
        price: dto.quote.price,
        currency: dto.quote.currency as AssetSnapshot['currency'],
        asOf: dto.quote.asOf,
      }
      asset.updateQuote(snapshot)
    }

    return asset
  }
}
