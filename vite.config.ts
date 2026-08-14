import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiCachePlugin } from './server/vite-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefixo vazio carrega TODAS as variáveis do .env, inclusive as sem `VITE_`.
  // Isso acontece só no processo Node do Vite: nada aqui vai para o bundle do
  // browser, porque não passamos nenhuma delas para `define`.
  const env = loadEnv(mode, process.cwd(), '')

  if (!env.BRAPI_TOKEN) {
    console.warn(
      '[brapi] BRAPI_TOKEN não definido. Copie .env.example para .env e preencha o token, ' +
        'senão as cotações vão responder 401.',
    )
  }
  if (!env.DATABASE_URL) {
    console.warn(
      '[cache] DATABASE_URL não definida. As chamadas de API vão direto à fonte, sem cache ' +
        'nem janela de 10 minutos. Rode npm run db:migrate depois de configurar.',
    )
  }

  return {
    // As rotas /api/* são servidas pelo handler em server/api/router.ts, que
    // aplica o cache no Postgres antes de sair para a internet. Um proxy comum
    // não daria conta disso, então não há `server.proxy` aqui.
    plugins: [react(), apiCachePlugin(env)],
  }
})
