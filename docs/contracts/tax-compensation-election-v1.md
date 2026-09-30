# Contract: `tax-compensation-election-v1`

Fase 4G.2A.1a — persistência da eleição de compensação tributária. Congela
identidade, valores, versionamento, imutabilidade, idempotência, supersessão,
fingerprint e expectativas de concorrência.

## Identidade lógica

```
(taxSubjectId, competence, electionType)
```

- `taxSubjectId`: opaco (`UUID`), nunca CPF.
- `competence`: competência civil canônica `YYYY-MM` (`CHAR(7)`).
- `electionType`: enum explícito. Nesta fase apenas
  `EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION`.

## Identidade de revisão

```
(taxSubjectId, competence, electionType, version)
```

`version` é inteiro monotônico, iniciando em `1`, incrementado apenas em mudança
semântica de valor.

## Valores

Enum explícito (nunca booleano):

- `DECLARE_FOR_CARRYFORWARD`
- `DO_NOT_DECLARE`

## Fonte

Apenas `MANUAL_CONFIRMED` nesta fase. Sem fonte heurística ou inferida.

## Versionamento e imutabilidade

- Linhas persistidas são **imutáveis**; nunca há `UPDATE` semântico de `value`.
- Mudança de valor **insere** nova revisão com `supersedesId` apontando para a
  revisão anterior.
- A revisão corrente é a de **maior `version`**, nunca resolvida por `createdAt`.

## Idempotência

- Mesmo valor do corrente → resultado idempotente `DUPLICATE`; nenhuma nova
  revisão é criada.
- Valor diferente → exatamente uma nova revisão (`CREATED`).

## Fingerprint

SHA-256 determinístico sobre:

```
taxSubjectId | competence | electionType | value | version | source
```

Exclui `id` e `createdAt` (independência temporal).

## Concorrência

- Barreira de banco: `UNIQUE (tax_subject_id, competence, election_type, version)`.
- `putRevision` faz retry otimista limitado ao detectar `P2002`.
- Duas escritas idênticas concorrentes → exatamente uma revisão semântica.
- Duas escritas conflitantes concorrentes → versões monotônicas, sem duplicata.

## Fail-closed

- Valores/`electionType`/`source` inválidos: rejeitados (nunca normalizados).
- Linha malformada no mapeamento DB → domínio: falha fechada.
- Ausência de eleição persistida permanece semanticamente `ELECTION_REQUIRED`
  quando exigida pelo núcleo mensal.

## Fora de escopo

API HTTP, UI, integração de leitura mensal, IRRF, composição 6015 e DARF de
ações **não** fazem parte deste contrato.
