# Contrato: DarfGenerationStatus v1 (Fase 4F)

Estados do registro de geração/entrega oficial do DARF (ADR-287).

## Status

| Status                 | Significado                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `PREPARATION_READY`    | Dados preparados e válidos (sem ação registrada).              |
| `USER_ACTION_REQUIRED` | Handoff preparado; o usuário deve concluir no serviço oficial. |
| `GENERATING`           | Reservado (não usado no modo interativo).                      |
| `GENERATED`            | Documento emitido pelo serviço oficial (não nesta fase).       |
| `FAILED`               | Falha explícita de serviço oficial (sem sucesso fabricado).    |
| `SUPERSEDED`           | Preparação substituída por uma nova (fingerprint alterado).    |
| `EXPIRED`              | Reservado (validade prática do documento).                     |
| `BLOCKED`              | Não elegível (mínimo, código, vencimento, ajuste, identidade). |

## Regras

1. **GENERATED ≠ PAID**: nenhum status implica pagamento.
2. `OFFICIAL_SERVICE_UNAVAILABLE` / `CAPTCHA_REQUIRED` / `AUTH_REQUIRED` são
   falhas explícitas, nunca sucesso simulado.
3. `BLOCKED` nunca acompanha valores estimados.
4. Apenas os status usados são materializados; os demais são reservados.
