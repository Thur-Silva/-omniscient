export type QueryValue = string | number | boolean | null | undefined

export class HttpError extends Error {
  readonly status: number
  readonly url: string
  /** Corpo da resposta já parseado (JSON quando possível, texto caso contrário). */
  readonly body: unknown
  /** Código de erro da API, quando o corpo traz um campo `code`. */
  readonly code?: string

  constructor(params: { status: number; url: string; body: unknown; message: string; code?: string }) {
    super(params.message)
    this.name = 'HttpError'
    this.status = params.status
    this.url = params.url
    this.body = params.body
    this.code = params.code
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }
}

export class NetworkError extends Error {
  readonly url: string

  constructor(url: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
    this.url = url
  }
}

export interface RequestOptions {
  headers?: Record<string, string>
  query?: Record<string, QueryValue>
  signal?: AbortSignal
  /** Aborta a requisição após este tempo. Padrão: `HttpClientOptions.timeoutMs`. */
  timeoutMs?: number
}

export interface HttpClientOptions {
  baseUrl?: string
  /** Headers aplicados em toda requisição (ex.: chaves de API em ambiente servidor). */
  headers?: Record<string, string>
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

export class HttpClient {
  private readonly baseUrl: string
  private readonly defaultHeaders: Record<string, string>
  private readonly timeoutMs: number

  constructor(options?: HttpClientOptions) {
    this.baseUrl = stripTrailingSlash(options?.baseUrl ?? import.meta.env.VITE_API_URL ?? '/api')
    this.defaultHeaders = options?.headers ?? {}
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'GET' }, options)
  }

  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }, options)
  }

  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, options)
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' }, options)
  }

  private async request<T>(path: string, init: RequestInit, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, options?.query)
    const signal = this.buildSignal(options)

    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        signal,
        headers: {
          Accept: 'application/json',
          ...(init.body == null ? {} : { 'Content-Type': 'application/json' }),
          ...this.defaultHeaders,
          ...options?.headers,
        },
      })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw new NetworkError(url, `Requisição para ${path} abortada ou excedeu o tempo limite`, { cause })
      }
      throw new NetworkError(url, `Falha de rede ao acessar ${path}`, { cause })
    }

    if (!response.ok) {
      const body = await readBody(response)
      throw new HttpError({
        status: response.status,
        url,
        body,
        code: extractCode(body),
        message: buildErrorMessage(response, body),
      })
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T
    }

    return (await response.json()) as T
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const base = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    if (!query) return base

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value != null) params.set(key, String(value))
    }
    const search = params.toString()
    return search === '' ? base : `${base}?${search}`
  }

  private buildSignal(options?: RequestOptions): AbortSignal {
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs
    const timeout = AbortSignal.timeout(timeoutMs)
    return options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractCode(body: unknown): string | undefined {
  return isRecord(body) && typeof body.code === 'string' ? body.code : undefined
}

function buildErrorMessage(response: Response, body: unknown): string {
  // `statusText` vem vazio em HTTP/2, então a mensagem da API é a fonte melhor.
  if (isRecord(body) && typeof body.message === 'string' && body.message !== '') {
    return body.message
  }
  if (typeof body === 'string' && body !== '') {
    return body.slice(0, 200)
  }
  return response.statusText || `HTTP ${response.status}`
}
