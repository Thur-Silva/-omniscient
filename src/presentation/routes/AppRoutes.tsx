import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import MainLayout from '../components/layout/Mainlayout'
import AssetsPage from '../components/pages/assets/AssetsPage'
import SignInPage from '../components/pages/auth/SignInPage'
import SignUpPage from '../components/pages/auth/SignUpPage'
import OpportunitiesPage from '../components/pages/opportunities/OpportunitiesPage'
import UserProfile from '../components/pages/profile/UserProfile'
import ScreenerPage from '../components/pages/screener/ScreenerPage'
import SettingsPage from '../components/pages/settings/SettingsPage'

export default function AppRoutes() {
  return (
    <Routes>
      {/* Rotas públicas de autenticação. */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Tudo abaixo exige sessão ativa no Clerk. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index element={<AssetsPage />} />
          <Route path="fiis" element={<OpportunitiesPage />} />
          <Route path="triagem" element={<ScreenerPage />} />
          <Route path="profile" element={<UserProfile />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<AssetsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
