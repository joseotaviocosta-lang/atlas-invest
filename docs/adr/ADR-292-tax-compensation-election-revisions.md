# ADR-292: Revisões Imutáveis da Eleição de Compensação Tributária

## Status

Aceito (Fase 4G.2A.1a)

## Contexto

O núcleo puro da Fase 4G.2A já modela a eleição explícita de reconhecimento de
prejuízo isento (`TaxCompensationElection`), mas esse fato precisa de persistência
confiável. A eleição afeta o estado de prejuízo a compensar em competências
futuras, então sobrescrevê-la apagaria a trilha de auditoria e poderia mascarar
uma reversão de decisão do investidor.

## Decisão

1. **Identidade lógica**: `(taxSubjectId, competence, electionType)`. A revisão
   acrescenta `version` monotônica (v1, v2, v3...).
2. **Append-only**: a linha persistida é imutável. Mudar a eleição **insere**
   nova revisão; nunca há `UPDATE` semântico no valor.
3. **Idempotência de mesmo valor**: se o valor atual já é igual ao solicitado,
   nenhuma nova revisão é criada (`DUPLICATE`).
4. **Valor diferente**: cria exatamente uma nova revisão, com `supersedesId`
   apontando para a revisão anterior.
5. **Revisão corrente**: resolvida deterministicamente pela **maior `version`**,
   nunca por `createdAt`.
6. **Fonte**: apenas `MANUAL_CONFIRMED` nesta fase; sem fonte heurística.
7. **Fingerprint semântico**: determinístico sobre
   `taxSubjectId|competence|electionType|value|version|source` (SHA-256),
   excluindo `id` e `createdAt`.
8. **Concorrência**: a unicidade de banco
   `(tax_subject_id, competence, election_type, version)` é a barreira; o
   repositório faz retry otimista limitado ao detectar `P2002`, garantindo
   histórico monotônico e sem versão duplicada.
9. **Sem CPF**: `TaxSubjectId` permanece opaco.

## Consequências

- Histórico completo e auditável de cada decisão do investidor.
- Reprocessamento e replay determinísticos por versão.
- Concorrência segura sem duplicar versões nem reconhecer prejuízo em dobro.
