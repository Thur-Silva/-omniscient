/**
 * Configuração exposta ao browser.
 *
 * Só entra aqui o que pode ser público. Segredos (como BRAPI_TOKEN ou
 * CLERK_SECRET_KEY) ficam no processo servidor — ver o proxy em vite.config.ts.
 */
export interface AppConfig {
  /** Base das chamadas de cotação; o proxy adiciona o Authorization. */
  brapiBaseUrl: string
  /** Base da API própria da aplicação. */
  apiBaseUrl: string
  /** Proxy dos fundamentos de FII (DY, P/VP, liquidez). */
  fundamentalsBaseUrl: string
  /** Chave pública do Clerk. Publicável por definição — não é segredo. */
  clerkPublishableKey: string
}

export const appConfig: AppConfig = {
  brapiBaseUrl: import.meta.env.VITE_BRAPI_BASE_URL ?? '/api/brapi',
  apiBaseUrl: import.meta.env.VITE_API_URL ?? '/api',
  fundamentalsBaseUrl: import.meta.env.VITE_FUNDAMENTALS_BASE_URL ?? '/api/fundamentos',
  clerkPublishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
}
