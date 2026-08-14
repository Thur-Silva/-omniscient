import { User } from '../../domain/user/entity'
import type { UserRepository } from '../../domain/user/repository'
import type { HttpClient } from '../http/client'

interface UserDto {
  id: string
  name: string
  email: string
  createdAt?: string
}

export class UserApiRepository implements UserRepository {
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  async findById(id: string): Promise<User | null> {
    const dto = await this.http.get<UserDto>(`/users/${id}`)
    return dto == null ? null : this.toUser(dto)
  }

  async findByEmail(email: string): Promise<User | null> {
    const dto = await this.http.get<UserDto>(`/users/email/${email}`)
    return dto == null ? null : this.toUser(dto)
  }

  async save(user: User): Promise<User> {
    const dto = await this.http.post<UserDto>('/users', {
      id: user.id,
      name: user.name,
      email: user.email,
    })
    return this.toUser(dto)
  }

  private toUser(dto: UserDto): User {
    return new User({
      id: dto.id,
      name: dto.name,
      email: dto.email,
      createdAt: dto.createdAt,
    })
  }
}
