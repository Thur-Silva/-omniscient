import { Outlet } from 'react-router-dom'
import Header from './Header'
import NavBar from './NavBar'

export default function MainLayout() {
  return (
    <div className="app-shell">
      <NavBar />
      <div className="app-main">
        <Header />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
