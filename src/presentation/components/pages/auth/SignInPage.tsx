import { SignIn, useAuth } from '@clerk/react'
import { Navigate, useLocation } from 'react-router-dom'

interface RedirectState {
  from?: { pathname?: string }
}

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <div className="centered-shell">
        <p className="muted">Carregando…</p>
      </div>
    )
  }

  // Já autenticado: volta para a rota original ou para a carteira.
  if (isSignedIn) {
    const state = location.state as RedirectState | null
    return <Navigate to={state?.from?.pathname ?? '/'} replace />
  }

  return (
    <div className="centered-shell">
      <SignIn signUpUrl="/sign-up" />
    </div>
  )
}
