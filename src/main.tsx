import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Três papéis tipográficos: serifa para VALOR (juízo), mono para PREÇO (feed),
   grotesca para a interface. Auto-hospedados — sem CDN em runtime. */
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/standard-italic.css'
import '@fontsource-variable/archivo'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

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
