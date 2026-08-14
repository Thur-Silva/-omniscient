import { useAuth } from '@clerk/react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

/**
 * Libera as rotas filhas apenas para usuários autenticados.
 *
 * `isLoaded` precisa ser verificado antes de `isSignedIn`: enquanto o Clerk
 * carrega, `isSignedIn` é `undefined` e redirecionar aqui jogaria o usuário já
 * logado para o login a cada refresh.
 */
export default function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <div className="centered-shell">
        <p className="muted">Carregando sessão…</p>
      </div>
    )
  }

  if (!isSignedIn) {
    // Guarda a rota pedida para voltar nela depois do login.
    return <Navigate to="/sign-in" replace state={{ from: location }} />
  }

  return <Outlet />
}
