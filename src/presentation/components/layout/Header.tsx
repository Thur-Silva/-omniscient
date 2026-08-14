import { UserButton } from '@clerk/react'
import { useCurrentUser } from '../../hooks/useCurrentUser'

export default function Header() {
  const { user } = useCurrentUser()

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header className="header">
      <h1 className="header-title">Visão geral da carteira</h1>
      <div className="header-actions">
        <span className="header-date">{today}</span>
        {user && <span className="header-user">{user.name}</span>}
        <UserButton userProfileUrl="/profile" />
      </div>
    </header>
  )
}
