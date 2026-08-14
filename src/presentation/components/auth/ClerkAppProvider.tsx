import { ClerkProvider, type ClerkProviderProps } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import type { PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'

interface ClerkAppProviderProps {
  publishableKey: string
}

/**
 * Aparência alinhada aos tokens de global.css: tinta quente, latão e as três
 * famílias tipográficas. Sem isto o Clerk renderiza no tema claro padrão, com
 * botão azul e campo branco no meio da aplicação.
 *
 * Anotado com o tipo do SDK de propósito: assim o TypeScript recusa nomes de
 * variável inválidos. Atribuir um objeto solto desliga a checagem de
 * propriedades excedentes e o erro passa em silêncio.
 */
const appearance: ClerkProviderProps['appearance'] = {
  variables: {
    colorPrimary: '#c89b3f',
    colorPrimaryForeground: '#16130c',
    colorBackground: '#1c1f24',
    colorForeground: '#ede8df',
    colorMuted: '#0f1114',
    colorMutedForeground: '#7c8087',
    colorInput: '#0f1114',
    colorInputForeground: '#ede8df',
    colorBorder: '#343941',
    colorRing: '#c89b3f',
    colorNeutral: '#ede8df',
    colorDanger: '#d9583b',
    colorSuccess: '#4fb286',
    colorWarning: '#c89b3f',
    borderRadius: '3px',
    fontFamily: "'Archivo Variable', system-ui, sans-serif",
    fontFamilyButtons: "'Archivo Variable', system-ui, sans-serif",
    fontFamilyMono: "'IBM Plex Mono', ui-monospace, monospace",
  },
}

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
      localization={ptBR}
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
