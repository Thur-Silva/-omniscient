# Valuation de BBAS3: Modelo de Fluxo de Caixa Descontado em Duas Fases

Este documento apresenta a demonstração matemática detalhada do cálculo de Valuation (Preço Justo) para as ações do Banco do Brasil (BBAS3), utilizando o Modelo de Fluxo de Caixa Descontado em Duas Fases (Projeção Explícita de 3 Anos + Perpetuidade) com a correção de distribuição regulatória: o fluxo descontado é o **FCFE** (Fluxo de Caixa do Acionista), não o lucro líquido integral.

## 0. Correção Algorítmica (FCFE no lugar do LL)

Descontar 100% do Lucro Líquido projetado assume implicitamente um payout de 100% com crescimento g > 0 — o que matematicamente exige um ROE infinito e viola as regras de retenção de capital regulatório (Basileia / Solvência SUSEP). Para qualquer período t:

**Trava de retenção:** b_t = min(1,0; g_t / ROE_t)

**Payout distribuível:** Payout_t = 1 − b_t = 1 − (g_t / ROE_t)

**Fluxo descontado:** FCFE_t = LL_t × Payout_t = LL_t × (1 − g_t / ROE_t)

O sistema retém o capital necessário exigido pelos órgãos reguladores e desconta exclusivamente a margem de dividendos/JCP efetivamente distribuível.

---

## 1. Resumo dos Parâmetros e Premissas

| Parâmetro | Sinalização | Valor Adotado | Descrição |
| :--- | :---: | :---: | :--- |
| **Lucro Líquido Base (Ano 0)** | LL₀ | R$ 15,60 bilhões | Resultado real de partida |
| **Taxa de Desconto Exigida** | kₑ | 20,0% a.a. (0,20) | Retorno mínimo exigido pelo investidor (CAPM) |
| **Fator de Desconto Anual** | 1 + kₑ | 1,20 | Fator para trazer valores ao Valor Presente |
| **ROE** | ROE | 8,27% a.a. (0,0827) | Eficiência do banco em rentabilizar o capital retido |
| **Payout da Fonte** | payout | 20,56% (0,2056) | Fração distribuída reportada (define o g derivado) |
| **Crescimento da Fase Explícita** | g | ROE × (1 − payout) = 6,57% a.a. | Derivado de retenção de lucro |
| **Crescimento na Perpetuidade** | g_perp | 3,0% a.a. (0,03) | Taxa de crescimento constante de longo prazo |
| **Ações em Circulação** | N_ações | 5.730.834.040 | Total de ações emitidas pela empresa |

---

## 2. Etapa 1: Valor Presente da Fase Explícita (Anos 1 a 3)

A fórmula geral para descontar um fluxo de caixa futuro a valor presente é:

VP_n = FCFE_n / (1 + kₑ)^n

com FCFE_n = LL_n × (1 − g/ROE).

**Trava de retenção da fase explícita:**

b = min(1,0; 0,06570 / 0,0827) = 0,7944 → Payout = 1 − 0,7944 = **0,2056** (20,56%)

### Passo 1.1: Ano 1 (Espera de 1 ano)
* **Lucro Projetado (LL₁):** 15,60 × (1 + 0,06570) = R$ 16,62 bilhões
* **Fluxo Distribuível (FCFE₁):** 16,62 × 0,2056 = R$ 3,42 bilhões
* **Cálculo:**
  VP₁ = 3,42 / (1,20)^1
  VP₁ = 3,42 / 1,20
  VP₁ = R$ 2,85 bilhões

### Passo 1.2: Ano 2 (Espera de 2 anos)
* **Lucro Projetado (LL₂):** 16,62 × (1 + 0,06570) = R$ 17,72 bilhões
* **Fluxo Distribuível (FCFE₂):** 17,72 × 0,2056 = R$ 3,64 bilhões
* **Cálculo:**
  VP₂ = 3,64 / (1,20)^2
  VP₂ = 3,64 / 1,44
  VP₂ = R$ 2,53 bilhões

### Passo 1.3: Ano 3 (Espera de 3 anos)
* **Lucro Projetado (LL₃):** 17,72 × (1 + 0,06570) = R$ 18,88 bilhões
* **Fluxo Distribuível (FCFE₃):** 18,88 × 0,2056 = R$ 3,88 bilhões
* **Cálculo:**
  VP₃ = 3,88 / (1,20)^3
  VP₃ = 3,88 / 1,728
  VP₃ = R$ 2,25 bilhões

### Total da Fase Explícita (VP_Fase1)
VP_Fase1 = VP₁ + VP₂ + VP₃
VP_Fase1 = 2,85 + 2,53 + 2,25
VP_Fase1 = R$ 7,62 bilhões

---

## 3. Etapa 2: Valor Terminal (Perpetuidade do Ano 4 ao Infinito)

### Passo 2.1: Projetar o Lucro do Ano 4 (LL₄)
Aplica-se a taxa de crescimento perpétuo g_perp = 3% sobre o lucro do Ano 3:

LL₄ = LL₃ × (1 + g_perp)
LL₄ = 18,88 × (1 + 0,03)
LL₄ = 18,88 × 1,03
LL₄ = R$ 19,45 bilhões

### Passo 2.2: Aplicar a Trava de Payout da Perpetuidade sobre LL₄
A perpetuidade exige retenção estrita com o crescimento perpétuo:

b_perp = min(1,0; 0,03 / 0,0827) = 0,3628 → Payout_perp = 1 − 0,3628 = **0,6372** (63,72%)

FCFE₄ = LL₄ × (1 − g_perp / ROE)
FCFE₄ = 19,45 × 0,6372
FCFE₄ = R$ 12,39 bilhões

### Passo 2.3: Aplicar o Modelo de Gordon no Ano 3 (VT₃)
A soma da série geométrica infinita de fluxos distribuíveis simplifica-se no Modelo de Gordon:

VT₃ = FCFE₄ / (kₑ − g_perp)
VT₃ = 12,39 / (0,20 − 0,03)
VT₃ = 12,39 / 0,17
VT₃ = R$ 72,90 bilhões

(Nota: O valor de R$ 72,90 bilhões representa o valor acumulado da perpetuidade medido na data do Ano 3).

### Passo 2.4: Trazer a Perpetuidade para o Valor Presente de Hoje (VP_VT)
Para descapitalizar o valor acumulado no Ano 3 para o Ano 0 (hoje), divide-se por (1 + kₑ)^3:

VP_VT = VT₃ / (1 + kₑ)^3
VP_VT = 72,90 / (1,20)^3
VP_VT = 72,90 / 1,728
VP_VT = R$ 42,19 bilhões

---

## 4. Etapa 3: Consolidação e Valor Por Ação

### Passo 3.1: Valor Presente Líquido Total (VPL_Total)
Soma-se o valor presente dos primeiros 3 anos ao valor presente da perpetuidade:

VPL_Total = VP_Fase1 + VP_VT
VPL_Total = 7,62 + 42,19
VPL_Total = R$ 49,81 bilhões

### Passo 3.2: Preço Justo Por Ação
Divide-se o VPL_Total pela quantidade total de ações no mercado:

Preço Justo = VPL_Total / N_ações
Preço Justo = 49.810.000.000 / 5.730.834.040
Preço Justo = R$ 8,69

---

## 5. Tabela Consolidada dos Resultados

| Componente de Valor | Valor Presente (R$) | Participação no Valuation (%) |
| :--- | :---: | :---: |
| **Anos 1 a 3 (Fase Explícita)** | R$ 7,62 bilhões | 15,3% |
| **Perpetuidade (Fase Terminal)** | R$ 42,19 bilhões | 84,7% |
| **Patrimônio Líquido Teórico Total (VPL)** | **R$ 49,81 bilhões** | **100,0%** |
| **Preço Justo Calculado por Ação** | **R$ 8,69** | — |

> Comparação com o modelo anterior (desconto do LL integral): R$ 19,06. A queda reflete a correção — o modelo anterior pagava pelo lucro inteiro como se nada precisasse ser reinvestido para crescer; o corrigido retém o capital exigido e desconta apenas o distribuível, um preço teto preciso e seguro.