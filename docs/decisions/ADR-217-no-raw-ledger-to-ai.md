# ADR-217: No Raw Ledger to AI Provider

## Status

Aceito (Fase 3X)

## Contexto

O Transaction Ledger contém dados brutos com campos de infraestrutura (chaves estrangeiras, IDs internos, metadados de custódia, notas de corretagem, timestamps técnicos `createdAt`). O envio direto dessas entidades ao modelo viola princípios de privacidade, inunda o orçamento de contexto e permite alucinações sobre transações não liquidadas ou metadados de execução.

## Decisão

1. **Barreira Estrutural contra o Ledger Bruto:**
   - Nenhuma linha bruta da tabela `Transaction` ou entidade do Prisma é passada aos modelos LLM.
   - O grounding utiliza estritamente projeções sanitizadas `PortfolioAiEventV1` contendo apenas dados econômicos relevantes (`eventType`, `economicDate`, `assetId`, `quantity`, `moneyAmount`, `currency`).
2. **Proibição de PII e Notas Brutas:**
   - Notas fiscais de corretagem, números de conta completos e notas textuais de liquidação são descartados do payload antes de qualquer serialização para o provedor.

## Consequências

- Proteção de dados e privacidade em conformidade com as diretrizes do Atlas.
- Redução substancial do consumo de tokens e eliminação de ruídos técnicos no prompt.

