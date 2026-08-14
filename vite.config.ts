import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const BRAPI_PROXY_PATH = '/api/brapi'
const BRAPI_ORIGIN = 'https://brapi.dev/api'

const FUNDAMENTALS_PROXY_PATH = '/api/fundamentos'
const FUNDAMENTALS_ORIGIN = 'https://statusinvest.com.br'

/**
 * O endpoint de fundamentos exige cabeçalhos de navegador e só responde a
 * requisições vindas do próprio site. Injetá-los aqui, no servidor, evita CORS e
 * mantém isso fora do bundle.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Referer: 'https://statusinvest.com.br/fundos-imobiliarios/busca-avancada',
  'X-Requested-With': 'XMLHttpRequest',
}

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

        // Fundamentos de FII (DY, P/VP, VP por cota, liquidez média diária).
        [FUNDAMENTALS_PROXY_PATH]: {
          target: FUNDAMENTALS_ORIGIN,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(new RegExp(`^${FUNDAMENTALS_PROXY_PATH}`), ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              for (const [name, value] of Object.entries(BROWSER_HEADERS)) {
                proxyReq.setHeader(name, value)
              }
              proxyReq.removeHeader('cookie')
            })
          },
        },
      },
    },
  }
})
