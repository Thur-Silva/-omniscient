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

## Metodologia por tipo de ativo

Uma fórmula só erra de modo sistemático. O que muda de uma empresa para outra não
é a preferência de quem calcula: é qual fluxo chega ao acionista e qual base é
estável. Sanepar e BBSE3 não se avaliam igual, e é isso que decide o método.

| Família | Setor B3 | Método padrão | Por quê |
| --- | --- | --- | --- |
| financeiro | Intermediários Financeiros, Previdência e Seguros, Serviços Financeiros, Holdings, Exploração de Imóveis | **Renda residual**, `VPA × (ROE − g)/(k − g)` | Para instituição financeira a dívida é insumo: FCFF, EBITDA e capital de giro não se definem. Restam modelos de equity, e a base estável é o patrimônio. |
| pagadora | Energia Elétrica, Água e Saneamento, Gás, Telecomunicações, Rodovias, Ferrovias | **DDM em 2 fases**, `Σ DPAₜ/(1+k)ᵗ + Gordon` | Receita regulada, payout alto, crescimento real baixo. O que chega ao acionista é o dividendo; projetar lucro retido credita à ação um caixa que não sai. |
| cíclica | Materiais Básicos, Petróleo e Gás, Siderurgia, Mineração, Papel, Químicos, Agro, Alimentos, Construção Civil, Automóveis | **Número de Graham**, `√(22,5 × LPA × VPA)` | Lucro reverte à média e é irregular. Projetar os últimos 12 meses por três anos multiplica um resultado de pico ou de fundo; a raiz com o patrimônio amortece. |
| crescimento | o resto: consumo, saúde, tecnologia, bens industriais | **FCD em 2 fases** sobre o FCFE | O valor está na trajetória do resultado, com a trava de retenção limitando o que pode sair da empresa. |

O sexto método, **FCFF em 2 fases**, desconta o fluxo da firma ao WACC e não é
padrão de nenhuma família: entra quando você o escolhe, ou quando o método da
família não fecha por falta de premissa. É a régua certa quando a dívida é parte da
história — o fluxo é o caixa antes do serviço da dívida, e o valor do acionista sai
por diferença, subtraindo a dívida líquida do valor da firma. Não se aplica a banco
e seguradora, e ali nem aparece na cadeia.

Entre crescimento e pagadora, os dados corrigem a etiqueta do setor: payout ≥ 60%
com DY ≥ 5% e receita quase parada (CAGR ≤ 8%) lê-se como pagadora; payout < 40%
com CAGR ≥ 15% lê-se como crescimento. Financeiro e cíclica não são
reclassificados por dados — ali a razão é estrutural, e payout nenhum torna um
banco avaliável por FCFF.

O quinto método, **Bazin** (`DPA ÷ yield exigido`), não é padrão de nenhuma
família: entra quando você o escolhe, ou quando o DDM não fecha. É uma exigência
de renda invertida, não desconto de fluxo. Na `/teto` ele usa a média dos cinco
exercícios encerrados, como no livro; no ranking, o DY de 12 meses.

**O que cada um mede, e onde erra**, aparece na própria tela: a página `/teto`
mostra o método em uso, a fórmula, o fluxo descontado, a justificativa do setor e o
parágrafo "onde erra" antes de você trocar de régua. O ranking mostra a etiqueta do
método em cada linha e, ao abrir, a mesma justificativa.

### A taxa: CAPM para fluxo do acionista, WACC para fluxo da firma

Por muito tempo a taxa de desconto foi a única premissa que a tela pedia sem
justificar: um campo com 20% dentro, e o mesmo 20% aplicado ao mercado inteiro.
Retorno exigido é escolha do investidor, mas *escolha* não é *arbítrio* — existe um
custo de oportunidade observável, e ele não é o mesmo para uma concessionária de
saneamento e para uma incorporadora. Uma taxa única premia sistematicamente o ativo
de risco alto, que é exatamente quem sobe numa lista ordenada por desconto.

Cada fluxo tem a sua taxa, e a escolha não é de tela:

| Fluxo | Métodos | Taxa | Por quê |
| --- | --- | --- | --- |
| do acionista | FCD (FCFE), DDM, renda residual | **Ke**, pelo CAPM | É o retorno que o acionista exige do capital dele. |
| da firma | FCFF em 2 fases | **WACC** | O fluxo é de acionista **e** credor, então a taxa é a média dos dois, ponderada pelo que cada um pôs. |
| nenhum | Bazin, número de Graham | — | Não descontam fluxo: um inverte uma exigência de renda, o outro é média geométrica de lucro e patrimônio. |

Descontar fluxo do acionista ao WACC credita a ele o benefício fiscal da dívida sem
cobrar o serviço dessa dívida; descontar fluxo da firma a Ke faz o contrário. Nos
dois casos o erro tem sinal conhecido: infla o teto da empresa alavancada.

**A montagem do Ke**, em moeda local, evita contar risco-país duas vezes. O caminho
ingênuo somaria à Selic o "ERP do Brasil" de tabela (~7,7%) — mas o título público
brasileiro já paga o spread de inadimplência do soberano, e o ERP de país deriva
desse mesmo spread. Então o spread sai da taxa livre de risco e volta no prêmio de
equity, amplificado pela volatilidade relativa da bolsa contra o título (Damodaran,
"Country Risk: Determinants, Measures and Implications"):

```
Rf_limpo = Selic − spread do soberano (2,4%)
ERP      = 4,33% de mercado maduro + 2,4% × 1,42 de risco-país = 7,74%
Ke       = Rf_limpo + β × ERP + prêmio adicional
```

A **Selic** vem do Banco Central (série 1178 do SGS, anualizada base 252), pelo
mesmo proxy de cache das outras fontes — juro muda por decisão do Copom, não por
minuto. Não é juro de longo prazo: o correto para uma perpetuidade seria a NTN-B
longa com inflação implícita, e a Selic é o juro de um dia anualizado, que em ciclo
de aperto fica acima do juro longo — o teto sai mais conservador, não mais frouxo. A
`/teto` mostra a taxa com a data da leitura e deixa trocar.

O **beta** é *bottom-up* (Damodaran), não de regressão: o risco de um negócio é o do
setor, e o que separa a empresa da média do setor é a alavancagem, devolvida pela
conta de Hamada (1972), `β_L = β_U × [1 + (1 − t) × D/E]`. Beta de regressão exigiria
uma série de preços por ticker — 617 requisições —, tem erro-padrão grande em papel
ilíquido e mede a estrutura de capital do passado. Instituição financeira é exceção:
alavancagem é o insumo do negócio, então ali a tabela já traz o beta alavancado e
Hamada não roda. O D/E é limitado em 3, porque a fonte reporta alavancagem de 10 em
empresa com patrimônio quase zerado, e ali o problema é solvência, não custo de
capital.

O **Kd** sai de `Selic + spread`, com o spread num degrau de dívida líquida sobre
EBIT (de 1,2% para quem tem caixa líquido a 9% acima de 6× o EBIT). O canônico é
rating sintético por cobertura de juros, mas a fonte não publica despesa financeira;
dívida sobre EBIT mede a mesma coisa pelo outro lado. Os pesos do WACC são de
mercado: capitalização contra dívida líquida. **Caixa líquido não vira peso
negativo** — isso puxaria o WACC abaixo do Ke e devolveria teto maior por a empresa
ter caixa, contando o caixa duas vezes; o peso da dívida é zero, o WACC colapsa em
Ke, e o caixa aparece somando ao valor do acionista quando a dívida líquida negativa
é subtraída da firma.

Medido em 19/08/2026, com Selic de 13,9%: SAPR11 fica com β 0,46 e Ke de 15,0%;
BBSE3 com β 0,85 e 18,1%; BBAS3 e ITUB4 com β 1,00 e 19,2%; PETR4 com β 1,14 e Ke de
20,3%, e WACC de 16,7% pela dívida que carrega; MTRE3 com β 1,40 e 22,3%. Era tudo
18% antes.

Na `/acoes` a taxa por ativo é o padrão, e **taxa fixa** continua disponível como
escolha explícita — comparar o mercado sob a mesma exigência de retorno é uma
pergunta legítima; ela só não pode ser a única. No modo fixo a taxa escolhida vale
para os dois fluxos, o que não é o ideal teórico e a tela diz.

### Limites que a fonte exige

Três travas existem por causa de dado ruim, e cada uma nasceu de um caso medido:

- **g ≤ k − 1pp** na fase explícita. A fonte reporta ROE de 366,8% para EQPA3, o
  que daria `g` de 361% e teto de R$ 3.654 contra preço de R$ 5,17.
- **g ≤ 3% na renda residual**, dentro do modelo. É fórmula de perpetuidade: com g
  truncado só em `k − 1pp`, o denominador `(k − g)` virava 0,01 e PINE4 saía com
  P/VP justificado de 11 e teto de R$ 106 contra preço de R$ 10.
- **DY de 12 meses acima de 20% não serve de base** para métodos de dividendo.
  GRND3 tem DY de 36,7% na fonte: distribuição extraordinária, que o Bazin
  multiplicaria por 16. Payout acima de 100% é aceito, mas limitado a 100% para
  efeito de g — sem retenção não há crescimento por reinvestimento.

O número de Graham só é usado onde é o método recomendado. Como degradação ele
capturava 73 das 158 ações — exige apenas LPA e VPA — e, por não descontar fluxo,
devolve teto mais generoso: o pior dado subia ao topo. Quando nenhum método
aplicável fecha, a ação sai da lista.

## Ações descontadas (`/acoes`)

Ranking automático do mercado pelo preço teto.

**Elegibilidade:** cotação e liquidez média diária ≥ R$ 2 milhões. Sai da lista
quem não tem premissa para nenhum método aplicável à sua família.

**Ranking:** eixo único — a **margem de desconto** contra o preço teto, do maior
desconto para o menor. Empate cai para o ticker, só para a ordem ser estável entre
duas apurações seguidas.

Diferente do ranking de FIIs, aqui não há soma de colocações. A margem já sai do
modelo de valuation, que embute lucro, payout, ROE e k; somar P/L a ela pesaria
lucro duas vezes e deslocaria a ordem para longe do desconto, que é justamente o
que se quer medir. O P/L continua na lista e no detalhe, como referência de tela.

**A régua é sua:** *por setor* avalia cada ação pelo método da natureza dela, e
qualquer um dos seis métodos pode ser fixado para toda a lista. Por setor, a lista
mistura métodos de propósito — é o que corrige avaliar SAPR11 e WEGE3 pela mesma
fórmula —, mas margens de modelos diferentes não são estritamente comparáveis: o
número de Graham não desconta fluxo, então devolve teto mais generoso. Para comparar
fórmula a fórmula, fixe um método.

**A taxa também é sua, mas não é chute:** o padrão é *CAPM por ativo* — Ke montado
com a Selic do dia e o beta do setor relavancado pela dívida da empresa, WACC para
quem desconta fluxo da firma (ver "A taxa", acima). *Taxa fixa* mantém o antigo
retorno exigido único (10% a 25%), e a diferença é grande: com k de 18% para todo o
mercado, SAPR11 exigia 18% de retorno; pelo CAPM, exige 15,0%, e o teto sobe na
mesma proporção.

Exemplo real (19/08/2026, régua por setor, taxa pelo CAPM com Selic de 13,9%, 617
ações → 163 avaliadas):

```
#   ticker  método   família       margem      Ke      β     teto    preco
1   ALLD3   FCD      crescimento    75,3%   18,9%   0,96    21,18     5,24
2   MTRE3   Graham   cíclica        75,0%   22,3%   1,40    11,63     2,91
3   EVEN3   Graham   cíclica        70,4%   21,6%   1,30    14,65     4,33
4   MELK3   Graham   cíclica        66,7%   22,1%   1,38     8,43     2,81
5   EUCA4   Graham   cíclica        64,0%   18,8%   0,94    56,37    20,27
```

Composição da lista: 49 por FCD, 28 por DDM, 28 por renda residual, 53 pelo número
de Graham, 5 por FCFF. Das 617 do universo, 38 caem sem cotação, 366 por liquidez e
50 sem premissa para método nenhum.

Os casos que motivaram o recorte por setor: **SAPR11** sai pelo DDM (teto R$ 4,63
contra preço de R$ 31,96 — o ROE na fonte é de 3,76% e o CAPM exige 15,0%), **BBSE3**
pela renda residual (teto R$ 29,65, P/VP justificado contra 6,62 de mercado),
**BBAS3** e **ITUB4** também por renda residual, **VALE3** e **PETR4** pelo número de
Graham, **WEGE3** pelo FCD.

Com a régua do FCFF forçada para todo o mercado, 85 ações fecham e 128 saem sem
premissa: banco e seguradora por construção — não há estrutura de capital a
ponderar —, e o resto por EBIT, ROIC ou dívida líquida ausentes na fonte. VALE3 sai
por um motivo que vale registrar: a fonte reporta ROIC de 1,6%, abaixo do
crescimento perpétuo de 3%, e crescer para sempre acima do próprio retorno exigiria
reinvestir mais do que a firma gera. O modelo recusa em vez de devolver valor
terminal zero.

As ações com crescimento truncado ficam marcadas com *g limitado* na lista, com o
valor original riscado no detalhe.

### Guardado no banco

O ranking é calculado **no servidor** e gravado no Postgres, porque só o servidor
alcança o banco. São duas camadas de cache encaixadas, cada uma com janela de 10
minutos:

| Chave | Conteúdo | Depende da régua |
| --- | --- | --- |
| `fundamentos:/category/…CategoryType=1` | resposta crua do StatusInvest (443 KB) | não |
| `fundamentos:/acao/companytickerprovents?…ticker=X` | histórico anual de proventos de um ativo | não |
| `bcb:/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json` | Selic anualizada do Banco Central | não |
| `ranking:acoes?r=capm&rf=13.9&m=setor&dy=6.0&v=4` | ranking já calculado (~57 KB) | sim |
| `ranking:acoes?r=fixo&k=18.0&m=setor&dy=6.0&v=4` | o mesmo, com taxa fixa | sim |

Tudo que muda o resultado entra na chave do ranking: `m` (a régua), `dy` (o yield
exigido do Bazin) e a taxa. No modo CAPM o que entra é a taxa livre de risco, porque
não existe um `k` só — quando o Copom mexe na Selic, o custo de capital de toda a
bolsa muda e o ranking guardado precisa ser outro registro. No modo fixo é o
contrário: `k` manda e a Selic é irrelevante, então nem é buscada.

O `v` é a versão da metodologia — hoje 4: a 1 somava colocação de margem com
colocação de P/L, a 2 ordenava só pela margem com uma fórmula única para todo o
mercado, a 3 escolhia o método pelo setor mas descontava tudo à mesma taxa. Sem
trocar a chave, um snapshot de até 10 minutos antes seguiria sendo servido com a
régua antiga.

Como a chave dos fundamentos não tem taxa, **uma só ida à fonte alimenta todas as
réguas** e também a página `/teto`. Medido: `chamadas=1` no `api_fetch_log` depois de
pedir k=20 e k=15. A Selic é chave própria, sem `k` nem régua: a mesma leitura serve
ao ranking e à calculadora.

Dentro da janela nem a fonte nem o cálculo são refeitos: a primeira chamada leva
~770 ms, as seguintes ~20 ms com `X-Cache: hit`.

O `k` é arredondado em meio ponto percentual e limitado a 4%–40%
(`normalizeDiscountRate`), senão um `k` livre viraria chave infinita no banco.

## Preço teto de ações (`/teto`)

Valuation por **fluxo de caixa descontado em duas fases** sobre o lucro líquido,
conforme `src/docs/BBAS3.MD`.

```
g       = ROE × (1 − payout)              crescimento sustentável por retenção
LL_n    = LL_0 × (1 + g)^n                n = 1..3
VP_n    = LL_n / (1 + k)^n
LL_4    = LL_3 × (1 + 3%)
VT_3    = LL_4 / (k − 3%)                 modelo de Gordon
VP_VT   = VT_3 / (1 + k)^3
teto    = (ΣVP_n + VP_VT) / nº de ações
```

O fluxo descontado é o **lucro integral**, não o dividendo — o payout entra apenas
na inclinação do crescimento. Descontar só o dividendo daria um número uma ordem
de grandeza menor (R$ 5,99 contra R$ 19,06 no exemplo do BBAS3).

Fixos: perpetuidade a **3% a.a.** e fase explícita de **3 anos**. Guardas de
domínio recusam prejuízo, payout fora de 0–100%, ROE negativo, ações ≤ 0 e
`k ≤ 3%` (que faria a perpetuidade explodir ou trocar de sinal).

### Premissas preenchidas pela API

O usuário edita as premissas do método em uso, todas já preenchidas — e desde a
montagem do custo de capital, **a taxa também tem origem em dado**: Ke vem do CAPM
com a Selic do Banco Central e o beta do setor relavancado pela dívida da empresa, e
WACC pondera esse Ke com o custo da dívida. O campo continua editável, porque exigir
mais que o custo de oportunidade é decisão de quem investe; editar à mão desliga o
CAPM, e a tela marca a taxa como exigência sua. O painel "Custo de capital" mostra a
montagem inteira, linha por linha, com a data da leitura da Selic.

| Campo | Origem | BBAS3 | Cobertura |
| --- | --- | --- | --- |
| Lucro líquido inicial | `LPA × nº de ações` | R$ 15,359 bi | 399/617 |
| Payout | `(DY × preço) / LPA` | 20,57% | 272/617 |
| ROE | direto | 8,27% | 614/617 |
| Custo de capital próprio (Ke) | CAPM: `(Selic − spread) + β × ERP` | 19,2% em 19/08/2026 | 617/617 |
| Nº de ações | `capitalização / preço` | 5.730.834.040 | 566/617 |

O número de ações derivado bate **exatamente** com os 5.730.834.040 que o
documento declara, o que valida a derivação.

Cada campo mostra se veio da fonte ou precisa ser digitado, e 270 das 617 ações
têm as quatro premissas completas — as demais pedem preenchimento. 218 estão sem
lucro positivo, e para elas o modelo não se aplica.

Os campos aceitam vírgula como separador decimal. Por isso são `type="text"` com
`inputMode="decimal"`: um `type="number"` descarta a vírgula e esvazia o campo,
que é justamente o gesto de quem digita em pt-BR.

A tela mostra a memória de cálculo ano a ano, com a participação de cada fase, para
o valuation ser auditável em vez de um número solto.

> O documento fixa `LL_1 = 15,60`, `LL_2 = 18,00`, `LL_3 = 20,50` à mão, sem taxa
> constante (0%, +15,38%, +13,89%), e não usa payout nem ROE. O sistema substitui
> essa projeção manual por `g = ROE × (1 − payout)` aplicado desde o ano 1. A
> máquina da perpetuidade reproduz o documento exatamente: ancorando `LL_3` em
> 20,50, saem `LL_4 = 21,115`, `VT_3 = 124,21` e `VP_VT = 71,88`, iguais aos dele.
> O teto difere (R$ 19,37 contra R$ 19,06) apenas porque o caminho dos anos 1 e 2
> é outro.

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

Liquidez **não** entra na soma: ela é critério de corte e, depois, um modo de
ordenar.

### Filtros da lista

Aplicados **depois** do ranking — não mexem na elegibilidade nem na soma:

- **Categoria** (Papel, Tijolo, Misto, Outros), combináveis. Nenhuma marcada
  mostra tudo. A categoria vem do `sectorname` da fonte; `Outros` recolhe o que
  ela classifica fora das três (financeiro, industrial, consumo cíclico), para
  nada ficar invisível.
- **Ordenar por**: Colocação (a soma) ou Maior liquidez.

O número ao lado do ativo é sempre a **colocação geral**, nunca renumerada. Isso
é o ponto: ordenando por liquidez você vê `22, 7, 28, 25, 31` e sabe onde cada
fundo está no ranking inteiro.

## Cache de servidor

As chamadas às fontes externas passam por `server/api/router.ts`, que guarda os
resultados no Postgres (Neon) antes de devolver.

Duas regras, um mecanismo:

- **Janela de 10 minutos, global por recurso.** Não por usuário: se alguém buscou
  os fundamentos há dois minutos, todos os outros leem o mesmo snapshot até a
  janela virar.
- **Fallback quando a cota estoura.** Se a fonte responde 429, 5xx ou cai, serve o
  último snapshot bem-sucedido marcado como `stale` em vez de falhar.

Os cabeçalhos dizem de onde veio a resposta: `X-Cache: miss | hit | stale | bypass`,
mais `X-Captured-At` e `X-Stale-Reason`.

Duas tabelas, porque são duas responsabilidades: `api_snapshot` guarda **o que** a
fonte devolveu, `api_fetch_log` guarda **quando** ela foi consultada.

A reserva da janela é um `insert ... on conflict do update ... where` com
`returning`: dois pedidos simultâneos disputam a mesma linha e só um recebe
resposta, então só um vai à fonte. Sobre isso há um *single-flight* em memória,
porque no cache frio quem perde a reserva ainda não tem snapshot para servir e
acabaria chamando a fonte também — com N usuários no primeiro acesso, seriam N
chamadas.

Sem `DATABASE_URL` a aplicação **continua funcionando**, só sem cache nem janela
(`X-Cache: bypass`) e com aviso no console.

> O plugin de dev copia o `.env` para `process.env` antes de subir. `loadEnv` do
> Vite devolve um objeto e **não** popula `process.env`, e os módulos de servidor
> leem de lá — como em produção, onde `tsx --env-file=.env` faz isso. Sem essa
> hidratação o cache ficava desligado só em dev, respondendo `X-Cache: bypass` e
> sem gravar nada, mesmo com a variável no arquivo.

### Rodar

```bash
npm run db:migrate   # aplica migrations/*.sql
npm run dev          # dev: as rotas /api/* passam pelo cache
npm run start        # produção: build + servidor Node servindo API e estáticos
```

O dev server e a produção usam **o mesmo handler** (`server/api/router.ts`), então
não divergem. Em dev ele entra como plugin do Vite; em produção, em
`server/index.ts`. Foi por isso que o `server.proxy` do Vite saiu: proxy puro não
consulta banco.

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

A taxa livre de risco é a exceção feliz: vem do **SGS do Banco Central**
(`api.bcb.gov.br`, série 1178), que é API pública documentada, sem chave e sem
cabeçalho de navegador. Passa pelo proxy `/api/bcb` só para ganhar a janela de cache
de 10 minutos — a Selic muda por decisão do Copom, não por minuto. Fonte fora do ar
não derruba nada: cai no número de reserva do código, e a tela avisa que a leitura é
de reserva, porque juro defasado muda o teto de todo o mercado de uma vez.

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
