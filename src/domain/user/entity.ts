export interface UserProps {
  id: string
  name: string
  email: string
  createdAt?: string
}

export class User {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly createdAt: string

  constructor(props: UserProps) {
    this.id = props.id
    this.name = props.name
    this.email = props.email
    this.createdAt = props.createdAt ?? new Date().toISOString()
  }
}
