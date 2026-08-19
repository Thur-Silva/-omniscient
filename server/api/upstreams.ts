export interface UpstreamConfig {
  /** Prefixo público, o que o browser chama. */
  prefix: string
  /** Nome curto usado na chave de cache. */
  name: string
  origin: string
  /** Segredos e cabeçalhos entram aqui, no servidor, nunca no bundle. */
  headers: (env: NodeJS.ProcessEnv) => Record<string, string>
  timeoutMs: number
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Referer: 'https://statusinvest.com.br/fundos-imobiliarios/busca-avancada',
  'X-Requested-With': 'XMLHttpRequest',
}

export const UPSTREAMS: UpstreamConfig[] = [
  {
    prefix: '/api/brapi',
    name: 'brapi',
    origin: 'https://brapi.dev/api',
    headers: (env) => {
      const token = env.BRAPI_TOKEN?.trim()
      return {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
    },
    timeoutMs: 20_000,
  },
  {
    /**
     * Banco Central. Série pública, sem chave e sem cabeçalho de navegador: passa
     * pelo proxy só para ganhar a janela de cache de 10 minutos no banco, do
     * contrário cada abertura de tela consultaria a mesma Selic do dia.
     */
    prefix: '/api/bcb',
    name: 'bcb',
    origin: 'https://api.bcb.gov.br',
    headers: () => ({ Accept: 'application/json' }),
    timeoutMs: 15_000,
  },
  {
    prefix: '/api/fundamentos',
    name: 'fundamentos',
    origin: 'https://statusinvest.com.br',
    headers: () => BROWSER_HEADERS,
    timeoutMs: 30_000,
  },
]

export function matchUpstream(pathname: string): UpstreamConfig | null {
  return UPSTREAMS.find((upstream) => pathname.startsWith(upstream.prefix)) ?? null
}

export function upstreamByName(name: string): UpstreamConfig {
  const upstream = UPSTREAMS.find((candidate) => candidate.name === name)
  if (upstream == null) throw new Error(`upstream desconhecido: ${name}`)
  return upstream
}

/**
 * Chave de cache estável para um pedido.
 *
 * A query é ordenada para que `?a=1&b=2` e `?b=2&a=1` sejam a mesma pergunta e
 * compartilhem a janela de 10 minutos.
 */
export function buildSourceKey(upstream: UpstreamConfig, pathname: string, search: string): string {
  const path = pathname.slice(upstream.prefix.length) || '/'
  const params = new URLSearchParams(search)
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
  const query = sorted.map(([k, v]) => `${k}=${v}`).join('&')
  return query ? `${upstream.name}:${path}?${query}` : `${upstream.name}:${path}`
}

export function buildUpstreamUrl(
  upstream: UpstreamConfig,
  pathname: string,
  search: string,
): string {
  const path = pathname.slice(upstream.prefix.length) || '/'
  return `${upstream.origin}${path}${search}`
}
