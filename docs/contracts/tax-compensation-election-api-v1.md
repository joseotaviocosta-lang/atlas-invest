# Contract: `tax-compensation-election-api-v1`

Fase 4G.2A.1b — API de leitura/escrita da eleição de compensação tributária.
Expõe a persistência imutável aprovada na Fase 4G.2A.1a (`ADR-292`).

## Rotas

```
GET /api/v1/fiscal/monthly/:competence/elections/equity-exempt-loss
PUT /api/v1/fiscal/monthly/:competence/elections/equity-exempt-loss
```

## Autenticação e escopo

- Requer JWT (`Authorization: Bearer <token>`); sem token → `401`.
- O `taxSubjectId` é resolvido **exclusivamente** pelo principal autenticado.
- O cliente **nunca** envia `taxSubjectId`; o corpo aceita apenas `value`.
- Não existe endereçamento de sujeito de terceiros: um usuário só alcança o
  próprio escopo, o que equivale, por construção, a `404` anti-enumeração para
  qualquer sujeito estrangeiro.

## Competence

- Formato civil canônico `YYYY-MM` (ex.: `2026-08`).
- Validada por `parseFiscalCompetence` (calendário gregoriano real).
- Inválida (ex.: `2026-13`) → `400 FISCAL.INVALID_COMPETENCE`.

## Valores permitidos (write)

Enum explícito, sem coerção:

- `DECLARE_FOR_CARRYFORWARD`
- `DO_NOT_DECLARE`

Qualquer outro valor → `400 FISCAL.INVALID_ELECTION_VALUE`.

## Resposta (GET)

```json
{
  "data": {
    "competence": "2026-08",
    "electionType": "EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION",
    "status": "MISSING | DECLARED | NOT_DECLARED",
    "current": {
      "value": "DECLARE_FOR_CARRYFORWARD",
      "version": 1,
      "source": "MANUAL_CONFIRMED",
      "fingerprint": "…",
      "supersedesId": null,
      "createdAt": "2026-08-31T12:00:00.000Z"
    }
  }
}
```

`current` é `null` quando não há revisão persistida (`status: MISSING`).

## Resposta (PUT)

Envelope `{ data }` com o read model do GET acrescido de `created`:

- `created: true` → nova revisão persistida.
- `created: false` → idempotência de mesmo valor (nenhuma nova revisão).

## Idempotência e revisão

- Mesmo valor corrente → `200`, mesma `version`, `created: false`, nenhuma linha
  nova.
- Valor diferente → `200`, nova `version` monotônica, `created: true`; histórico
  anterior preservado (`supersedesId` aponta para a revisão anterior).
- A revisão corrente é resolvida pela maior `version`.

## Códigos de erro

| Situação                  | HTTP                 | Código                          |
| ------------------------- | -------------------- | ------------------------------- |
| Competence inválida       | 400                  | `FISCAL.INVALID_COMPETENCE`     |
| Valor de eleição inválido | 400                  | `FISCAL.INVALID_ELECTION_VALUE` |
| Não autenticado           | 401                  | `AUTH.*`                        |
| Sujeito estrangeiro       | 404 (por construção) | —                               |

## Fronteiras

- O controller não acessa Prisma; delega ao caso de uso → porta de repositório.
- Sem cálculo fiscal na API: a API apenas lê/persiste a eleição.
- IRRF, composição 6015, DARF e mínimo DARF permanecem fora deste contrato.
