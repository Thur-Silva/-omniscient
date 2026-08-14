import { Route, Routes } from 'react-router-dom'
import MainLayout from '../components/layout/Mainlayout'
import AssetsPage from '../components/pages/assets/AssetsPage'
import UserProfile from '../components/pages/profile/UserProfile'
import SettingsPage from '../components/pages/settings/SettingsPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<AssetsPage />} />
        <Route path="profile" element={<UserProfile />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<AssetsPage />} />
      </Route>
    </Routes>
  )
}
