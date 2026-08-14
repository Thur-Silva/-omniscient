export interface UserProps {
  id: string
  name: string
  email: string
  imageUrl?: string
  createdAt?: string
}

/**
 * Representação de usuário no domínio. A identidade é gerenciada pelo Clerk;
 * esta entidade é o formato que o resto da aplicação consome, sem depender do
 * SDK.
 */
export class User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly imageUrl?: string
  readonly createdAt: string

  constructor(props: UserProps) {
    this.id = props.id
    this.name = props.name
    this.email = props.email
    this.imageUrl = props.imageUrl
    this.createdAt = props.createdAt ?? new Date().toISOString()
  }

  get initials(): string {
    const source = this.name.trim() === '' ? this.email : this.name
    const parts = source.split(/[\s@.]+/).filter((part) => part !== '')
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }
}
