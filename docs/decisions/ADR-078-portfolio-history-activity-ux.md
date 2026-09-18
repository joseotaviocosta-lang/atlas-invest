# ADR-078: Portfolio History & Activity UX and Consolidated Activity Timeline

## Status

Accepted

## Context

Após a entrega da visão consolidada de carteira (Fase 2A) e do detalhamento individual de ativos (Fase 2B), os investidores necessitam de uma visão cronológica unificada de eventos e movimentações patrimoniais que contemple todas as contas de custódia da carteira.
Esta visão deve responder com clareza auditável:

- O que aconteceu na carteira?
- Quando aconteceu?
- Em qual conta de custódia e com qual ativo?
- Qual a natureza contábil do evento (venda, rendimento, aporte, retirada, taxa, tributo pago, evento corporativo ou transferência)?
- Houve impacto em caixa, quantidade ou custo?
- O evento possui alertas de integridade (ex: transferência incompleta ou base de custo incompleta)?

## Decision

1. **Estrutura da Tela e Agrupamento Cronológico:**
   - A timeline é organizada em grupos por data civil gregoriana (`tradeDate` no formato `YYYY-MM-DD`), apresentando cabeçalhos localizados em português (ex: `18 de setembro de 2026`).
   - A ordenação dentro de cada grupo e entre os grupos respeita rigorosamente a ordenação determinística descendente fornecida pela API (`tradeDate DESC, id DESC`), sem qualquer reordenação temporal no cliente.
2. **Navegação Segura para Detalhes de Posição:**
   - Quando o evento refere-se a um ativo cuja posição encontra-se atualmente aberta (`quantity > 0` no `PortfolioStateDto`), o ticker do ativo é renderizado como link interativo navegando para `/portfolio/assets/[assetId]` (Web) ou `/(app)/portfolio/[assetId]` (Mobile).
   - Se a posição estiver encerrada (`quantity === '0'` ou inexistente no estado aberto atual), o link é suprimido e o ticker é exibido como texto estático, impedindo que o investidor seja conduzido a uma tela de detalhe que reporte erroneamente que a posição não pertence à carteira.
3. **Ausência de Cabeçalhos Financeiros Agregados:**
   - É expressamente vedado apresentar métricas consolidadas arbitrárias como "Total movimentado", "Fluxo líquido do período" ou "Retorno acumulado", pois misturariam naturezas econômicas heterogêneas (aportes, vendas, dividendos, taxas e retiradas) sem respaldo no motor contábil.
4. **Resolução de Metadados sem N+1:**
   - Contas e posições da carteira são carregadas em paralelo no nível do shell da página, permitindo que nomes amigáveis de corretoras e identificadores de ativos sejam resolvidos de maneira determinística em memória.

## Consequences

- Linha do tempo auditável, transparente e consistente em Web e Mobile.
- Prevenção de navegações enganosas para ativos de posições encerradas.
