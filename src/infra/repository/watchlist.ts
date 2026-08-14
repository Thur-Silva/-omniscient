import { isAssetType } from '../../domain/asset/type'
import type { NewWatchlistItem, WatchlistItem } from '../../domain/watchlist/item'
import type { WatchlistRepository } from '../../domain/watchlist/repository'

const STORAGE_PREFIX = 'omniscient.watchlist.v1'

/** Observados do usuário, namespaced pelo id do Clerk como as posições. */
export class LocalStorageWatchlistRepository implements WatchlistRepository {
  private readonly storage: Storage | null
  private readonly storageKey: string

  constructor(userId: string, storage?: Storage) {
    if (userId.trim() === '') {
      throw new Error('LocalStorageWatchlistRepository exige um userId')
    }
    this.storage = storage ?? safeLocalStorage()
    this.storageKey = `${STORAGE_PREFIX}.${userId}`
  }

  async list(): Promise<WatchlistItem[]> {
    return this.read()
  }

  async add(item: NewWatchlistItem): Promise<WatchlistItem> {
    const items = this.read()
    const ticker = item.ticker.trim().toUpperCase()

    // Mesmo ticker duas vezes não faz sentido numa lista de observação: atualiza.
    const existing = items.find((candidate) => candidate.ticker === ticker)
    if (existing) {
      Object.assign(existing, item, { ticker })
      this.write(items)
      return existing
    }

    const created: WatchlistItem = {
      ...item,
      ticker,
      id: createId(),
      addedAt: new Date().toISOString(),
    }
    items.push(created)
    this.write(items)
    return created
  }

  async update(id: string, patch: Partial<NewWatchlistItem>): Promise<WatchlistItem | null> {
    const items = this.read()
    const target = items.find((item) => item.id === id)
    if (!target) return null
    Object.assign(target, patch)
    this.write(items)
    return target
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((item) => item.id !== id))
  }

  private read(): WatchlistItem[] {
    const raw = this.storage?.getItem(this.storageKey)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isWatchlistItem) : []
    } catch {
      return []
    }
  }

  private write(items: WatchlistItem[]): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(items))
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `wl_${Date.now()}_${Math.trunc(Math.random() * 1e6)}`
}

function isWatchlistItem(value: unknown): value is WatchlistItem {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.ticker === 'string' &&
    typeof candidate.type === 'string' &&
    isAssetType(candidate.type)
  )
}
