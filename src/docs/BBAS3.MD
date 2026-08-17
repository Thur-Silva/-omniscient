# Valuation de BBAS3: Modelo de Fluxo de Caixa Descontado em Duas Fases

Este documento apresenta a demonstração matemática detalhada do cálculo de Valuation (Preço Justo) para as ações do Banco do Brasil (BBAS3), utilizando o Modelo de Fluxo de Caixa Descontado em Duas Fases (Projeção Explícita de 3 Anos + Perpetuidade).

---

## 1. Resumo dos Parâmetros e Premissas

| Parâmetro | Sinalização | Valor Adotado | Descrição |
| :--- | :---: | :---: | :--- |
| **Lucro Líquido Base (Ano 0)** | LL0 | R$ 15,60 bilhões | Resultado real de partida |
| **Taxa de Desconto Exigida** | k | 20,0% a.a. (0,20) | Retorno mínimo exigido pelo investidor |
| **Fator de Desconto Anual** | 1 + k | 1,20 | Fator para trazer valores ao Valor Presente |
| **Crescimento na Perpetuidade** | g | 3,0% a.a. (0,03) | Taxa de crescimento constante de longo prazo |
| **Ações em Circulação** | N_ações | 5.730.834.040 | Total de ações emitidas pela empresa |

---

## 2. Etapa 1: Valor Presente da Fase Explícita (Anos 1 a 3)

A fórmula geral para descontar um fluxo de caixa futuro a valor presente é:

VP_n = LL_n / (1 + k)^n

### Passo 1.1: Ano 1 (Espera de 1 ano)
* **Lucro Projetado (LL_1):** R$ 15,60 bilhões
* **Cálculo:**
  VP_1 = 15,60 / (1,20)^1
  VP_1 = 15,60 / 1,20
  VP_1 = R$ 13,00 bilhões

### Passo 1.2: Ano 2 (Espera de 2 anos)
* **Lucro Projetado (LL_2):** R$ 18,00 bilhões
* **Cálculo:**
  VP_2 = 18,00 / (1,20)^2
  VP_2 = 18,00 / 1,44
  VP_2 = R$ 12,50 bilhões

### Passo 1.3: Ano 3 (Espera de 3 anos)
* **Lucro Projetado (LL_3):** R$ 20,50 bilhões
* **Cálculo:**
  VP_3 = 20,50 / (1,20)^3
  VP_3 = 20,50 / 1,728
  VP_3 = R$ 11,86 bilhões

### Total da Fase Explícita (VP_Fase1)
VP_Fase1 = VP_1 + VP_2 + VP_3
VP_Fase1 = 13,00 + 12,50 + 11,86
VP_Fase1 = R$ 37,36 bilhões

---

## 3. Etapa 2: Valor Terminal (Perpetuidade do Ano 4 ao Infinito)

### Passo 2.1: Projetar o Lucro do Ano 4 (LL_4)
Aplica-se a taxa de crescimento perpétuo g = 3% sobre o lucro do Ano 3:

LL_4 = LL_3 * (1 + g)
LL_4 = 20,50 * (1 + 0,03)
LL_4 = 20,50 * 1,03
LL_4 = R$ 21,115 bilhões

### Passo 2.2: Aplicar o Modelo de Gordon no Ano 3 (VT_3)
A soma da série geométrica infinita de lucros futuros simplifica-se no Modelo de Gordon:

VT_3 = LL_4 / (k - g)
VT_3 = 21,115 / (0,20 - 0,03)
VT_3 = 21,115 / 0,17
VT_3 = R$ 124,21 bilhões

(Nota: O valor de R$ 124,21 bilhões representa o valor acumulado da perpetuidade medido na data do Ano 3).

### Passo 2.3: Trazer a Perpetuidade para o Valor Presente de Hoje (VP_VT)
Para descapitalizar o valor acumulado no Ano 3 para o Ano 0 (hoje), divide-se por (1 + k)^3:

VP_VT = VT_3 / (1 + k)^3
VP_VT = 124,21 / (1,20)^3
VP_VT = 124,21 / 1,728
VP_VT = R$ 71,88 bilhões

---

## 4. Etapa 3: Consolidação e Valor Por Ação

### Passo 3.1: Valor Presente Líquido Total (VPL_Total)
Soma-se o valor presente dos primeiros 3 anos ao valor presente da perpetuidade:

VPL_Total = VP_Fase1 + VP_VT
VPL_Total = 37,36 + 71,88
VPL_Total = R$ 109,24 bilhões

### Passo 3.2: Preço Justo Por Ação
Divide-se o VPL_Total pela quantidade total de ações no mercado:

Preço Justo = VPL_Total / N_ações
Preço Justo = 109.240.000.000 / 5.730.834.040
Preço Justo = R$ 19,06

---

## 5. Tabela Consolidada dos Resultados

| Componente de Valor | Valor Presente (R$) | Participação no Valuation (%) |
| :--- | :---: | :---: |
| **Anos 1 a 3 (Fase Explícita)** | R$ 37,36 bilhões | 34,2% |
| **Perpetuidade (Fase Terminal)** | R$ 71,88 bilhões | 65,8% |
| **Patrimônio Líquido Teórico Total (VPL)** | **R$ 109,24 bilhões** | **100,0%** |
| **Preço Justo Calculado por Ação** | **R$ 19,06** | — |