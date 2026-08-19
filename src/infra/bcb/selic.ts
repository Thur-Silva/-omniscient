import type { RiskFreeRate } from '../../domain/market/risk-free'

/**
 * Consulta e leitura da Selic no SGS do Banco Central, sem dependência de browser.
 *
 * Fica separado do provedor pelo mesmo motivo do mapeamento de ações: o servidor
 * também precisa desta taxa para montar o ranking, e o provedor carrega o
 * `HttpClient`, que lê `import.meta.env`. Com o caminho e a query aqui, cliente e
 * servidor geram a mesma chave de cache e uma só ida ao Banco Central serve aos
 * dois.
 *
 * Série 1178: Selic anualizada, base 252 dias úteis. Escolhida entre as candidatas
 * do próprio Banco Central — a 432 é a *meta* do Copom e traz data futura quando há
 * reunião marcada (em 19/08/2026 devolvia 16/09/2026), e a 11 é a taxa diária, que
 * precisaria ser anualizada aqui.
 *
 * O que ela **não** é: juro de longo prazo. O correto para uma perpetuidade seria a
 * NTN-B longa com a inflação implícita somada; a Selic é o juro de um dia
 * anualizado, e em ciclo de aperto fica acima do juro longo — o que torna o teto
 * mais conservador, não mais frouxo. A tela mostra a taxa e deixa trocar.
 */
export const SELIC_SERIES = 1178

export const SELIC_PATH = `/dados/serie/bcdata.sgs.${SELIC_SERIES}/dados/ultimos/1`

export const SELIC_QUERY: Record<string, string | number> = { formato: 'json' }

export const SELIC_LABEL = 'Selic anualizada (SGS 1178, Banco Central)'

interface SgsObservation {
  /** dd/MM/yyyy, como o SGS publica. */
  data?: string | null
  /** Número em texto, com ponto decimal: "13.90". */
  valor?: string | null
}

/** dd/MM/yyyy → ISO, sem depender de fuso: a data é a do fechamento no Brasil. */
function toIso(brazilian: string): string {
  const [day, month, year] = brazilian.split('/')
  if (day == null || month == null || year == null) return brazilian
  return `${year}-${month}-${day}`
}

/** Leitura da resposta do SGS. `null` quando não há observação utilizável. */
export function parseSelic(payload: unknown): RiskFreeRate | null {
  const series = Array.isArray(payload) ? (payload as SgsObservation[]) : null
  const observation = series?.[series.length - 1]
  if (observation == null) return null

  const value = Number(observation.valor)
  if (!Number.isFinite(value) || value <= 0) return null

  return {
    // A série vem em pontos percentuais ao ano.
    rate: value / 100,
    asOf: observation.data ? toIso(observation.data) : '',
    label: SELIC_LABEL,
    fallback: false,
  }
}
