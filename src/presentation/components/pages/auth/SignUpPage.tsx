import { SignUp, useAuth } from '@clerk/react'
import { Navigate } from 'react-router-dom'

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return (
      <div className="centered-shell">
        <p className="muted">Carregando…</p>
      </div>
    )
  }

  if (isSignedIn) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="centered-shell">
      <SignUp signInUrl="/sign-in" />
    </div>
  )
}
