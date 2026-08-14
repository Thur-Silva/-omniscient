import { useClerk } from '@clerk/react'
import { useCurrentUser } from '../../../hooks/useCurrentUser'

export default function UserProfile() {
  const { isLoaded, user } = useCurrentUser()
  const { openUserProfile, signOut } = useClerk()

  if (!isLoaded) {
    return (
      <div className="page">
        <p className="muted">Carregando perfil…</p>
      </div>
    )
  }

  // ProtectedRoute garante a sessão; isto cobre o caso de logout concorrente.
  if (!user) {
    return (
      <div className="page">
        <p className="muted">Sessão encerrada.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <section className="card profile-card">
        {user.imageUrl ? (
          <img className="avatar-image" src={user.imageUrl} alt={user.name} />
        ) : (
          <div className="avatar">{user.initials}</div>
        )}
        <h2>{user.name}</h2>
        <p className="muted">{user.email}</p>
        <dl className="details">
          <div>
            <dt>ID</dt>
            <dd className="mono">{user.id}</dd>
          </div>
          <div>
            <dt>Membro desde</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString('pt-BR')}</dd>
          </div>
        </dl>
        <div className="profile-actions">
          {/* Nome, e-mail, senha e MFA são gerenciados pelo Clerk. */}
          <button className="button" type="button" onClick={() => openUserProfile()}>
            Gerenciar conta
          </button>
          <button className="button button-ghost" type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </section>
    </div>
  )
}
