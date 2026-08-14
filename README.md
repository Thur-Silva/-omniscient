# omniscient

Acompanhamento de carteira com autenticação [Clerk](https://clerk.com), cotações da
[brapi](https://brapi.dev) e modelos de valuation (Graham, DCF e margem de segurança).

## Setup

```bash
npm install
cp .env.example .env   # preencha VITE_CLERK_PUBLISHABLE_KEY e BRAPI_TOKEN
npm run dev
```

- Chave do Clerk: <https://dashboard.clerk.com/~/api-keys> (a publicável, `pk_test_...`)
- Token da brapi: <https://brapi.dev/dashboard>

Sem a chave do Clerk a aplicação abre uma tela explicando o que configurar, em vez
de renderizar em branco.

## Autenticação

O Clerk é a fonte de verdade dos usuários — a aplicação não guarda cadastro,
senha nem sessão própria.

- `ClerkAppProvider` liga o `ClerkProvider` ao React Router (`routerPush` /
  `routerReplace`), então a navegação pós-login não faz reload.
- `ProtectedRoute` protege todas as rotas do app; `/sign-in` e `/sign-up` são as
  únicas públicas. A rota pedida é guardada e restaurada depois do login.
- `useCurrentUser` devolve o usuário já convertido para a entidade de domínio
  `User`, via `infra/auth/clerk-user.ts`. O SDK do Clerk fica confinado à infra e
  à apresentação — o domínio não conhece o Clerk.
- Nome, e-mail, senha e MFA são gerenciados pelos componentes do Clerk
  (`<UserButton />` no header, `openUserProfile()` na página de perfil).

A chave publicável usa prefixo `VITE_` porque é pública por definição. A
`CLERK_SECRET_KEY` **não** é usada: esta é uma SPA sem backend, e a secret key só
faria sentido em código de servidor.

### Carteira por usuário

As posições são namespaced pelo id do Clerk
(`omniscient.positions.v1.<userId>`), então contas diferentes no mesmo navegador
não veem a carteira uma da outra. Por isso `createPortfolioServices(userId)` é
uma factory, e não um singleton de módulo.

## Cotações e o token da brapi

O token **nunca** vai para o browser. O fluxo é:

```
browser  ──GET /api/brapi/v2/stocks/quote?symbols=WEGE3──▶  proxy (Node)
                       (sem credencial)                       │
                                                              │ + Authorization: Bearer BRAPI_TOKEN
                                                              ▼
                                                        brapi.dev/api
```

- `BRAPI_TOKEN` **não** tem prefixo `VITE_`. Variáveis `VITE_*` são embutidas no
  bundle e ficariam públicas; esta é lida apenas pelo processo Node.
- O proxy de desenvolvimento está em `vite.config.ts` e injeta o header
  `Authorization` em `proxyReq`.
- `.env` é ignorado pelo git; só `.env.example` é versionado.

### Produção

O proxy do `vite.config.ts` só existe no dev server. **Em produção é preciso um
proxy equivalente** (Nginx, Cloudflare Worker, função serverless ou um backend
próprio) que receba `/api/brapi/*`, adicione o header `Authorization` a partir de
uma variável de ambiente do servidor e repasse para `https://brapi.dev/api`.
Aponte `VITE_BRAPI_BASE_URL` para esse endpoint. Sem isso, `npm run preview` e o
build de produção respondem 401 nas cotações.

### Limites do plano

O plano gratuito aceita **1 símbolo por requisição** — `?symbols=A,B,C` responde
`400 QUOTES_PER_REQUEST_EXCEEDED`. Por isso `BrapiQuoteProvider.getQuotes()`
dispara uma requisição por ticker, com concorrência limitada, e cada ticker falha
de forma isolada sem derrubar a carteira.

## Arquitetura

```
src/
  domain/         regras de negócio e portas (sem dependência de framework)
    asset/        Asset, AssetQuote, QuoteProvider, AssetUniverseProvider
    portfolio/    Portfolio, PortfolioItem, Position, PositionRepository
    watchlist/    WatchlistItem, WatchlistRepository
    user/         User (identidade gerenciada pelo Clerk)
    valuation/    Graham, DCF, P/VP, margem de segurança
    errors/       DomainError e subclasses
  application/    casos de uso que orquestram domínio + portas
    portfolio/    LoadPortfolio (posições + cotações + valuation)
    screener/     ScreenWatchlist (barato / justo / caro)
  infra/          implementações concretas das portas
    http/         HttpClient, HttpError, NetworkError
    brapi/        BrapiQuoteProvider + tipos da resposta da API
    auth/         adaptador Clerk -> entidade User
    repository/   persistência (localStorage)
    config/       configuração pública do browser
  composition/    composition root — o único lugar que conhece a infra
  presentation/   React: rotas, componentes, hooks
    components/auth/   ClerkAppProvider, ProtectedRoute
```

A dependência aponta sempre para dentro: `presentation → application → domain`.
A infra implementa as portas do domínio e é ligada em `composition/container.ts`.

## Oportunidades em FIIs (`/fiis`)

Ranking automático do mercado inteiro — sem cadastrar nada. Abre já apurado.

**Elegibilidade** (precisa passar nos três):

| Critério | Regra | Por quê |
| --- | --- | --- |
| Liquidez média diária | ≥ R$ 2 milhões | Abaixo disso não se entra nem se sai da posição |
| DY (12 meses) | ≤ 16% a.a. | Teto de armadilha: acima disso a distribuição costuma ser insustentável |
| P/VP | entre 0,80 e 1,05 | Acima paga prêmio sobre o patrimônio; abaixo, desconto exagerado esconde problema |

**Ranking** — soma de duas colocações independentes:

1. Ordena por **DY decrescente**. 1º lugar = 1 ponto, 2º = 2 pontos, e assim por diante.
2. Ordena por **P/VP crescente** (mais barato sobre o patrimônio é melhor). Mesma pontuação.
3. Soma as duas colocações de cada fundo e ordena **crescente**: **menor soma é o melhor**.

Somar colocações em vez de olhar um índice só evita que um DY alto isolado, ou um
P/VP baixo isolado, carregue o fundo ao topo sozinho. Empate na soma vai para a
melhor colocação de DY, o critério primário.

Exemplo real (14/08/2026, 603 fundos → 37 aprovados):

```
#   ticker    DY%    P/VP   rDY rPVP SOMA  liq/dia
1   TRXF11   14,98  0,823    2    2    4   R$ 24,1M
2   MCRE11   15,33  0,848    1    7    8   R$  3,2M
3   RZTR11   14,32  0,844    6    5   11   R$  2,8M
```

MCRE11 lidera o DY mas cai para 2º na soma, porque o P/VP dele é o 7º melhor.
Exatamente o efeito pretendido.

A tela mostra os critérios e a contagem de descartados por motivo, para o ranking
não ser caixa preta.

### Fonte dos fundamentos

A brapi **não fornece DY nem P/VP** em nenhum plano gratuito: `sortBy` aceita só
`name|close|change|change_abs|volume|market_cap_basic`, `dividends=true` não
acrescenta campo, e os `modules` são ignorados em silêncio.

DY, P/VP, VP por cota e liquidez média diária vêm da **busca avançada do
StatusInvest**, que devolve os ~600 FIIs numa única requisição.

> **Atenção:** não é API pública documentada — é o endpoint interno que o site
> deles consome. É gratuito e sem chave, mas pode mudar ou sair do ar sem aviso, e
> o uso automatizado pode contrariar os termos de uso do serviço. A dependência
> está isolada atrás da porta `FiiFundamentalsProvider` (`domain/fii`), então
> trocar de fonte é uma classe nova, sem tocar no ranking.
>
> Alternativa testada: Yahoo Finance (`quoteSummary` com cookie + crumb) entrega
> `dividendYield` e `priceToBook` para tickers `.SA`, mas exige **uma requisição
> por ativo** (~600) e também não é oficial.

O proxy `/api/fundamentos` (em `vite.config.ts`) injeta `User-Agent` e `Referer`
no servidor — sem ele a chamada é barrada por CORS. **Em produção precisa do proxy
equivalente**, igual ao caso da brapi.

## Triagem: barato ou caro

Aba `/triagem`, com duas partes:

- **Mercado** — abre já preenchida com o catálogo real da B3 vindo da API: ticker,
  nome, preço e variação do dia, filtrável por Ações / FIIs / BDRs e pesquisável
  por ticker ou nome. É daqui que se escolhe o que acompanhar.
- **Baratos / Justos / Caros / Pendentes** — a classificação dos ativos que você
  escolheu e para os quais informou os fundamentos.

A classificação usa a margem de segurança: acima de +20% é barato, abaixo de −20%
é caro, o meio é justo — a faixa do meio depende demais das premissas do modelo
para virar recomendação.

Cada tipo usa a régua própria:

| Ativo | Modelo | Entrada |
| ----- | ------ | ------- |
| Ação, BDR | Graham | LPA + crescimento (0–50%) |
| FII, REIT | P/VP | valor patrimonial por cota |

Graham parte de lucro por ação e não se aplica a fundo imobiliário; para FII o
referencial é o patrimônio, e negociar abaixo do VP é o desconto.

**Os fundamentos são informados por você.** O plano da brapi não devolve LPA, VP
nem P/L — verifiquei: `fundamental=true` não acrescenta campo, e os `modules`
(`defaultKeyStatistics`, `financialData`) são ignorados silenciosamente. Então o
que falta é dito na aba "Pendentes" em vez de estimado. Nada aqui é recomendação
de investimento.

### Uma requisição precifica a lista inteira

O catálogo vem de `GET /quote/list`, que devolve ~2000 ativos numa chamada e **não
sofre o limite de 1 símbolo por requisição** que vale no `/quote`. Por isso
`BrapiUniverseProvider.pricesFor()` precifica uma lista de dezenas de tickers com
uma única ida à rede, em vez de uma por ativo. O catálogo fica em cache por 2
minutos.

A busca de ativos usa o `search=` do mesmo endpoint, então o seletor pesquisa o
catálogo real da B3 (744 ações, 593 FIIs, 663 BDRs) por ticker ou nome.

> Ressalva de dados: a brapi classifica ETF como `fund`, o mesmo tipo dos FIIs.
> Um ETF adicionado à triagem cai como FII e recebe P/VP, que não é a régua certa
> para ele. É a taxonomia da API, não do domínio.

## Mobile first

O CSS parte do celular: uma coluna, barra de abas fixa na base (alcance do
polegar), alvos de toque de 44px, `env(safe-area-inset-bottom)` para o iOS e
campos com 16px de fonte para o Safari não dar zoom no foco. As media queries só
**somam** a partir de 600px e 960px — não há nenhuma `max-width` corrigindo o
desktop para baixo.

A navegação é a mesma marcação nos dois formatos: abas na base no celular, coluna
lateral a partir de 960px. Quem decide é o CSS, não o JavaScript.

Verificado em iframes de 390px e 430px (a janela do Chrome não desce abaixo de
~1000px, então o iframe é o jeito honesto de testar as media queries).

## Direção visual

Painel de instrumento de precisão, não dashboard genérico.

- **Cor**: tinta gráfica quente (`#14161A`), papel (`#EDE8DF`) e **latão**
  (`#C89B3F`) como cromo de instrumento — calibradores e balanças são de latão.
  Jade e vermelhão são semânticos (ganho/perda), nunca decorativos.
- **Tipografia**, com divisão semântica: **Newsreader** (serifa) carrega *valor*
  — juízo humano: valor justo, margem de segurança, veredicto. **IBM Plex Mono**
  carrega *preço* — o feed de máquina: tickers e cotações. **Archivo** faz a
  interface. Preço e valor têm vozes diferentes de propósito.
- **Assinatura**: o `SafetyGauge`. Régua com traços, datum de latão no custo,
  ponteiro no mercado e a folga até o valor justo anotada como **linha de cota**
  (notação de desenho técnico para medir um vão). Preencher esse vão com hachura
  fazia o instrumento parecer poste de barbeiro — a cota é mais precisa e calada.
- **Escala compartilhada**: na lista, todas as linhas usam a mesma régua
  (`buildSharedScale`). Com escala própria, uma queda de 8% desenharia a mesma
  barra que uma alta de 17%. Os datums também alinham em coluna.
- **Movimento** (`motion`): sequência de entrada escalonada, ponteiro em mola
  sub-amortecida que passa do ponto e assenta, totalizadores contando. Tudo
  respeita `prefers-reduced-motion`.

Fontes são auto-hospedadas via `@fontsource` — sem CDN em runtime.

## Scripts

| Script            | Descrição                        |
| ----------------- | -------------------------------- |
| `npm run dev`     | Dev server com o proxy da brapi  |
| `npm run build`   | Typecheck (`tsc -b`) + build     |
| `npm run lint`    | Oxlint                           |
| `npm run preview` | Serve o build (sem proxy — ver acima) |

## Dados

Não há dados fictícios na aplicação. As posições da carteira começam vazias e são
cadastradas pelo usuário, persistidas em `localStorage`
(`LocalStoragePositionRepository`). O valor justo é calculado somente para
posições em que o usuário informou LPA e crescimento — nada é presumido. Os dados
de perfil vêm do Clerk, não de um usuário fixo no código.
