# ADR-017: Documentação e Validação de Contratos da API com OpenAPI e Zod

## Status

Aprovado

## Contexto

A plataforma Project Atlas é consumida por múltiplos clientes (aplicativo mobile Expo/React Native, aplicação web Next.js e futuros microsserviços de sincronização). É fundamental que a documentação da API esteja sempre sincronizada com o código em tempo real e que as validações de payload sejam declarativas e estritas.

## Decisão

1. **Documentação Automatizada via OpenAPI 3.0 (Swagger):**
   - Integrado `@nestjs/swagger` em `apps/api`.
   - Documentação interativa servida na rota `/docs`.
   - Especificação serializada em formato JSON servida em `/docs-json`.
   - Todos os endpoints possuem anotações semânticas de tags, sumários, descrições, parâmetros de rota, query parameters e status codes.
2. **Validação de Entrada com Zod (@atlas/validation):**
   - Os schemas de validação residem no pacote compartilhado `@atlas/validation` e são acionados via `ZodValidationPipe` e `UUIDParamPipe`.
   - DTOs de Swagger espelham a estrutura dos schemas Zod com metadados tipados explícitos (`type: String`, `enum`, `example`), prevenindo erros de reflexão de metadados em compilações rápidas.
3. **Imposição de Strings Decimais para Valores Financeiros:**
   - O schema rejeita números ou floats de JavaScript (`Expected string, received number`) com `400 Bad Request`.
   - Valores monetários e quantitativos devem ser obrigatoriamente strings decimais de precisão exata (`"123456789.12345678"`).
4. **Validação de Calendário em Datas Econômicas:**
   - Datas no formato `YYYY-MM-DD` são validadas contra o calendário real (rejeitando ex: `2026-02-30`) diretamente na camada de validação.

## Consequências

- **Positivas:**
  - Garantia de que contratos OpenAPI refletem a implementação sem esforço manual.
  - Bloqueio imediato na borda (edge) de qualquer dado numérico que possa introduzir imprecisão de ponto flutuante.
- **Negativas / Mitigações:**
  - Manutenção sincronizada entre Swagger DTOs e Zod Schemas. O isolamento em `dto/*.dto.ts` mantém a responsabilidade clara e localizada.
