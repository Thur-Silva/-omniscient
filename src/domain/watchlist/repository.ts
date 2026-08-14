import type { NewWatchlistItem, WatchlistItem } from './item'

export interface WatchlistRepository {
  list(): Promise<WatchlistItem[]>
  add(item: NewWatchlistItem): Promise<WatchlistItem>
  update(id: string, patch: Partial<NewWatchlistItem>): Promise<WatchlistItem | null>
  remove(id: string): Promise<void>
}
