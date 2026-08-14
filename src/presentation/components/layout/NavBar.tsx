import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * Mesma marcação nos dois formatos: barra de abas na base no celular (alcance do
 * polegar) e coluna lateral no desktop. Quem decide é o CSS.
 */
const NAV_ITEMS: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Carteira',
    icon: (
      <>
        <path d="M3 6h14M3 11h14M3 16h9" />
        <circle cx="14" cy="16" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    to: '/triagem',
    label: 'Triagem',
    icon: (
      <>
        <path d="M10 4v12" />
        <path d="M4 8h12" />
        <path d="M4 8l-1.5 4h3L4 8zM16 8l-1.5 4h3L16 8z" />
      </>
    ),
  },
  {
    to: '/profile',
    label: 'Perfil',
    icon: (
      <>
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      </>
    ),
  },
  {
    to: '/settings',
    label: 'Ajustes',
    icon: (
      <>
        <path d="M3 6h14M3 14h14" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="13" cy="14" r="2" />
      </>
    ),
  },
]

export default function NavBar() {
  return (
    <nav className="nav" aria-label="Navegação principal">
      <div className="nav-brand">
        <span className="nav-logo" aria-hidden="true">
          O
        </span>
        <div>
          <strong>Omniscient</strong>
          <small>Preço · valor</small>
        </div>
      </div>

      <div className="nav-items">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <svg
              className="nav-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="nav-foot">
        <span>v0.1.0</span>
        <span>B3 · BRL</span>
      </div>
    </nav>
  )
}
