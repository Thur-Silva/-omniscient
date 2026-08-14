/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Caminho do proxy que injeta o token da brapi no servidor. */
  readonly VITE_BRAPI_BASE_URL?: string
  readonly VITE_API_URL?: string
  /** Chave pública do Clerk (pk_test_... / pk_live_...). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
