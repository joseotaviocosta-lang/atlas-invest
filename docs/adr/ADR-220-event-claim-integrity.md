# ADR-220: Event Claim Integrity and Semantic Distinction

## Status

Aceito (Fase 3X)

## Contexto

Eventos financeiros possuem naturezas distintas com consequências fiscais e patrimoniais diversas. Confundir uma transferência de custódia com uma compra, um desdobramento com um aporte, ou juros sobre capital próprio (JCP) com dividendos isentos causaria desinformação crítica ao investidor.

## Decisão

1. **Distinção Semântica Estrita:**
   - Tipos de eventos (`BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT`, `DIVIDEND`, `JCP`, `SPLIT`, `BONUS`, `AMORTIZATION`) são modelados como categorias independentes no motor de alegações.
   - Qualquer tentativa do modelo de reclassificar semanticamente um evento ou misturar naturezas é rejeitada na validação de claims.
2. **Valores Numéricos Renderizados pelo Servidor:**
   - Datas, quantidades e valores monetários citados em `FACT_VALUE` são resolvidos a partir dos fatos canônicos `EVENT:<id>.*`. O texto final entregue ao cliente utiliza strings decimais exatas renderizadas pelo servidor.
3. **Isolamento de Escopo por Ativo:**
   - Em escopos `ASSET_TIMELINE`, alegações citando eventos de outros ativos disparam `CROSS_ASSET_EVIDENCE_PROHIBITED` e falham fechado.

## Consequências

- Eliminação de alucinações sobre transações e proventos.
- Garantia de que transferências, eventos corporativos e compras permaneçam claramente distinguidos.
