# ADR-211: Canonical Portfolio Authority for Asset Grounding

## Status

Aceito (Fase 3W)

## Contexto

A explicação factual de um ativo na carteira precisa refletir a contabilidade e a custódia oficiais do sistema. Entregar listas brutas de transações para o modelo calcular saldos ou inventar dados intermediários viola os princípios fundamentais do Project Atlas.

## Decisão

1. **Origem Estrita dos Dados Canônicos:**
   - O contexto de grounding de ativos deriva estritamente dos modelos de leitura e avaliação aprovados (`PortfolioReadApi`, `PortfolioReplayEngine`, `PortfolioValuation`).
   - O transaction ledger bruto **NUNCA** é exposto ou enviado ao modelo de IA.
2. **Reaproveitamento de Estado e Snapshot:**
   - O estado contábil é derivado uma única vez por requisição através dos casos de uso canônicos, evitando recomputações redundantes.
3. **Isolamento e Anti-Enumeração:**
   - Se o ativo não pertencer à carteira do investidor autenticado, a API responde invariavelmente com `404 Not Found`, preservando a privacidade.

## Consequências

- Total alinhamento contábil entre a tela de detalhes do ativo e as explicações dadas pela IA.
- Prevenção absoluta de vazamentos do transaction ledger.
