/**
 * Configuração exposta ao browser.
 *
 * Só entra aqui o que pode ser público. Segredos (como BRAPI_TOKEN) ficam no
 * processo servidor — ver o proxy em vite.config.ts.
 */
export interface AppConfig {
  /** Base das chamadas de cotação; o proxy adiciona o Authorization. */
  brapiBaseUrl: string
  /** Base da API própria da aplicação (ativos, usuários). */
  apiBaseUrl: string
}

export const appConfig: AppConfig = {
  brapiBaseUrl: import.meta.env.VITE_BRAPI_BASE_URL ?? '/api/brapi',
  apiBaseUrl: import.meta.env.VITE_API_URL ?? '/api',
}
