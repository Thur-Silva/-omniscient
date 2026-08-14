import { ClerkProvider } from '@clerk/react'
import type { PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'

interface ClerkAppProviderProps {
  publishableKey: string
}

/**
 * Aparência alinhada ao tema escuro em global.css, para os componentes do Clerk
 * não entrarem claros no meio da aplicação.
 */
const appearance = {
  variables: {
    colorPrimary: '#4f8cff',
    colorBackground: '#12161f',
    colorInputBackground: '#0b0e14',
    colorText: '#e6e9f0',
    colorTextSecondary: '#8b93a7',
    colorInputText: '#e6e9f0',
    colorDanger: '#ff5d5d',
    colorSuccess: '#2ecc71',
    borderRadius: '10px',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
} as const

/**
 * O Clerk precisa navegar pela aplicação (após login, logout, etc.). Ligar
 * `routerPush`/`routerReplace` ao React Router evita full reload entre telas.
 */
function ClerkWithRouter({ publishableKey, children }: PropsWithChildren<ClerkAppProviderProps>) {
  const navigate = useNavigate()

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/sign-in"
    >
      {children}
    </ClerkProvider>
  )
}

/**
 * O BrowserRouter fica por fora do ClerkProvider porque `useNavigate` só existe
 * dentro de um Router.
 */
export default function ClerkAppProvider({
  publishableKey,
  children,
}: PropsWithChildren<ClerkAppProviderProps>) {
  return (
    <BrowserRouter>
      <ClerkWithRouter publishableKey={publishableKey}>{children}</ClerkWithRouter>
    </BrowserRouter>
  )
}
