# ADR-075: Asset Position Detail UX & Information Hierarchy

## Status

Accepted

## Context

Na Fase 2A, o Project Atlas entregou a visão consolidada da carteira (`/portfolio`), permitindo visualizar a lista de ativos em custódia aberta. No entanto, o investidor necessita de uma visão auditável aprofundada por ativo (Fase 2B), compreendendo:

1. Como sua posição consolidada está distribuída entre contas/corretoras de custódia.
2. Quais resultados foram efetivamente realizados com vendas anteriores deste ativo específico.
3. Quais rendimentos/proventos (dividendos, JCP, rendimentos de FII) foram creditados para o ativo.
4. O extrato cronológico auditável de todas as movimentações do ativo na carteira (compras, vendas, proventos, eventos corporativos e transferências).

## Decision

1. **Navegação Canônica:**
   - **Web:** Rota canônica `/portfolio/assets/[assetId]?portfolioId=...`. Acesso direto via clique na linha do ativo (ticker) ou no botão explícito "Ver detalhe →". Retorno via breadcrumb acessível (`← Carteira / [Nome da Carteira] / [Ticker]`).
   - **Mobile:** Rota canônica `/(app)/portfolio/[assetId]?portfolioId=...`. Acesso via toque no cabeçalho do `PositionCard` ou no botão touch com alvo mínimo $\ge 44\text{px}$ ("Ver detalhes do ativo →"). Retorno via `Header` com ação `onBack`.
2. **Hierarquia Visual de Informações:**
   - **Header:** Ticker em destaque, nome da empresa/ativo, badge de classe de ativo (`EQUITY` -> `Ações`, `FII` -> `Fundo Imobiliário`, etc.), contexto da carteira e badge de status da posição (`ABERTA` ou `ENCERRADA`).
   - **Card Primário Consolidado:** Quantidade total de cotas/ações, Preço médio ponderado e Custo total de aquisição conhecido. Alerta não alarmista em caso de custo incompleto.
   - **Custódia por Conta:** Detalhamento institucional de quantas cotas estão em cada conta de custódia, seus respectivos preços médios e custos conhecidos.
   - **Resultado Realizado:** Histórico de alienações encerradas do ativo com discriminação de data, conta, quantidade vendida, valor bruto, custos de venda, valor líquido e ganho/perda apurado (com percentual relativo).
   - **Rendimentos Recebidos:** Extrato dos proventos creditados especificamente para o ativo, categorizados por tipo (Dividendo, JCP, Rendimento FII).
   - **Histórico do Ativo:** Extrato auditável cronológico reverso com paginação por keyset cursor.
3. **Tratamento de Posições Encerradas:**
   - Posições com quantidade `0` que possuam histórico de eventos na carteira são apresentadas com clareza de encerramento (`POSIÇÃO ENCERRADA`), preservando a visualização integral dos resultados realizados, rendimentos e linha do tempo de eventos.

## Consequences

- Experiência transparente, auditável e alinhada às expectativas de investidores exigentes.
- Zero confusão entre valores globais da carteira e métricas isoladas de ativos.
