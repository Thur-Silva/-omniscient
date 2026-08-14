import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const BRAPI_PROXY_PATH = '/api/brapi'
const BRAPI_ORIGIN = 'https://brapi.dev/api'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefixo vazio carrega TODAS as variáveis do .env, inclusive as sem `VITE_`.
  // Isso acontece só no processo Node do Vite: nada aqui vai para o bundle do
  // browser, porque não passamos BRAPI_TOKEN para `define`.
  const env = loadEnv(mode, process.cwd(), '')
  const brapiToken = env.BRAPI_TOKEN

  if (!brapiToken) {
    console.warn(
      '[brapi] BRAPI_TOKEN não definido. Copie .env.example para .env e preencha o token, ' +
        'senão as cotações vão responder 401.',
    )
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        // O browser chama /api/brapi/... sem credencial nenhuma; o proxy injeta
        // o Authorization aqui, no servidor. O token nunca chega ao frontend.
        [BRAPI_PROXY_PATH]: {
          target: BRAPI_ORIGIN,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(new RegExp(`^${BRAPI_PROXY_PATH}`), ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (brapiToken) {
                proxyReq.setHeader('Authorization', `Bearer ${brapiToken}`)
              }
              // Evita repassar cookies da app para um terceiro.
              proxyReq.removeHeader('cookie')
            })
          },
        },
      },
    },
  }
})
