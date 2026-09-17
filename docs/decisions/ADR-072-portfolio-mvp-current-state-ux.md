# ADR-072: Portfolio MVP Current State UX Architecture

## Status

Accepted

## Context

A Fase 2A introduz a primeira experiência real da tela "Carteira" no Project Atlas, tanto no Web quanto no Mobile. Era necessário definir a arquitetura de informação e estrutura de apresentação da tela, assegurando clareza, responsividade e total alinhamento com os dados disponibilizados pelo Portfolio Engine 1.0.

## Decision

1. **Estrutura Canônica da Overview:**
   - **Cabeçalho:** Identificação da carteira ativa, tipo (Pessoal, Família, etc.), moeda base, status e contadores de posições e contas.
   - **Banner de Completude:** Exibido condicionalmente quando existirem posições com custo incompleto.
   - **Cards de Sumário:**
     - Posições abertas (contagem).
     - Custo total investido (ou "Custo total conhecido" se houver incompletude), segregado por moeda.
     - Resultado realizado (ganho/perda financeiro e percentual), segregado por moeda.
     - Rendimentos recebidos (total com discriminação de Dividendos, JCP e Rendimentos FII), segregado por moeda.
   - **Listagem de Posições:** Exibição de ativos abertos (`quantity > 0`) com quantidade, preço médio, custo total e acordeão expansível para visualização por conta de custódia.
2. **Estados Especiais:**
   - Loading: Skeletons anatômicos no mesmo formato dos cards e listas.
   - Replay Failed (HTTP 422): Mensagem amigável instruindo revisão do histórico sem expor stack traces.
   - Carteira Vazia (0 transações): Empty state com incentivo à primeira movimentação.
   - Carteira Sem Posições (apenas depósitos/retiradas de caixa): Card informativo específico distinguindo fluxo de caixa de ausência de carteira.
3. **Ordenação Estável:** Posições ordenadas por `displayIdentifier ASC`.

## Consequences

- A UI reflete fielmente o estado real da carteira derivado por replay.
- Usuários têm visibilidade clara dos custos, proventos e resultados realizados sem ruído ou distorções.
