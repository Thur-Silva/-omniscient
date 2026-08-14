import { isAssetType, isCurrency } from '../../domain/asset/type'
import type { NewPosition, Position } from '../../domain/portfolio/position'
import type { PositionRepository } from '../../domain/portfolio/repository'

const STORAGE_KEY = 'omniscient.positions.v1'

/**
 * Persiste as posições no navegador. Substitui a carteira fixa que existia na
 * AssetsPage: começa vazia e guarda só o que o usuário cadastrar.
 */
export class LocalStoragePositionRepository implements PositionRepository {
  private readonly storage: Storage | null

  constructor(storage?: Storage) {
    this.storage = storage ?? safeLocalStorage()
  }

  async list(): Promise<Position[]> {
    return this.read()
  }

  async add(position: NewPosition): Promise<Position> {
    const created: Position = { ...position, id: createId() }
    const positions = this.read()
    positions.push(created)
    this.write(positions)
    return created
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((position) => position.id !== id))
  }

  private read(): Position[] {
    const raw = this.storage?.getItem(STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isPosition) : []
    } catch {
      // Dado corrompido não deve derrubar a aplicação.
      return []
    }
  }

  private write(positions: Position[]): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(positions))
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Acesso pode ser bloqueado (modo privado, cookies desabilitados).
    return null
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pos_${Date.now()}_${Math.trunc(Math.random() * 1e6)}`
}

function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.ticker === 'string' &&
    typeof candidate.type === 'string' &&
    isAssetType(candidate.type) &&
    typeof candidate.currency === 'string' &&
    isCurrency(candidate.currency) &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.averagePrice === 'number' &&
    typeof candidate.acquiredAt === 'string'
  )
}
