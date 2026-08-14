import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './presentation/resources/styles/global.css'
import App from './App.tsx'
import MissingClerkKey from './presentation/components/auth/MissingClerkKey.tsx'
import ClerkAppProvider from './presentation/components/auth/ClerkAppProvider.tsx'
import { appConfig } from './infra/config/env.ts'

const root = createRoot(document.getElementById('root')!)

// Sem a chave o ClerkProvider renderiza em branco; melhor explicar o que fazer.
root.render(
  <StrictMode>
    {appConfig.clerkPublishableKey === '' ? (
      <MissingClerkKey />
    ) : (
      <ClerkAppProvider publishableKey={appConfig.clerkPublishableKey}>
        <App />
      </ClerkAppProvider>
    )}
  </StrictMode>,
)
