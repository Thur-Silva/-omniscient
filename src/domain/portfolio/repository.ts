import type { NewPosition, Position } from './position'

export interface PositionRepository {
  list(): Promise<Position[]>
  add(position: NewPosition): Promise<Position>
  remove(id: string): Promise<void>
}
