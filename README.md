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
    asset/        Asset, AssetQuote, QuoteProvider (porta), AssetRepository
    portfolio/    Portfolio, PortfolioItem, Position, PositionRepository
    user/         User (identidade gerenciada pelo Clerk)
    valuation/    Graham, DCF, margem de segurança
    errors/       DomainError e subclasses
  application/    casos de uso que orquestram domínio + portas
    portfolio/    LoadPortfolio (posições + cotações + valuation)
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
