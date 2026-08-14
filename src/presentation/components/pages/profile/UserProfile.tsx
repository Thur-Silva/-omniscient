import { User } from '../../../../domain/user/entity'

const user = new User({ id: 'u1', name: 'Arthur Cruz', email: 'arthur.cruz@example.com' })

export default function UserProfile() {
  return (
    <div className="page">
      <section className="card profile-card">
        <div className="avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
        <h2>{user.name}</h2>
        <p className="muted">{user.email}</p>
        <dl className="details">
          <div>
            <dt>ID</dt>
            <dd>{user.id}</dd>
          </div>
          <div>
            <dt>Membro desde</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString('pt-BR')}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
