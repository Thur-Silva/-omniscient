import { UserButton } from '@clerk/react'
import { useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'

/** Nome da seção atual. O título grande de cada página é outro: este é contexto. */
const SECTION_TITLES: Record<string, string> = {
  '/': 'Visão geral da carteira',
  '/fiis': 'FIIs',
  '/triagem': 'Triagem',
  '/profile': 'Perfil',
  '/settings': 'Ajustes',
}

export default function Header() {
  const { user } = useCurrentUser()
  const { pathname } = useLocation()

  const title = SECTION_TITLES[pathname] ?? 'Visão geral da carteira'

  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-actions">
        <span className="header-date">{today}</span>
        {user && <span className="header-user">{user.name}</span>}
        <UserButton userProfileUrl="/profile" />
      </div>
    </header>
  )
}
