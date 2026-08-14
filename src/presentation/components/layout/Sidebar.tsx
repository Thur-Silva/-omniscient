import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Carteira' },
  { to: '/profile', label: 'Perfil' },
  { to: '/settings', label: 'Configurações' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">O</span>
        <div>
          <strong>Omniscient</strong>
          <small>Consolidador de Carteira</small>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">v0.1.0</div>
    </aside>
  )
}
