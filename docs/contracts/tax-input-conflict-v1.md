# Contrato: TaxInputConflict v1 (Fase 4B.3)

Duplicata e conflito são estados **distintos** (ADR-255).

## Definições

- **Duplicata:** mesma identidade + mesmo `fingerprint` → idempotente (sem nova linha).
- **Conflito:** mesma identidade + `fingerprint` diferente (payload material diferente) → `CONFLICT`.

## Comportamento

1. Duplicata → `outcome = DUPLICATE`, HTTP 200, uma única linha.
2. Conflito → `outcome = CONFLICT`, HTTP 409 `TAX_INPUT.CONFLICT`; a linha existente é preservada (valor não sobrescrito) e marcada `conflictStatus = CONFLICT`.
3. Nunca há resolução silenciosa; resolução explícita é fase futura.
4. Input conflitado **não** é tratado como completo na prontidão:
   - trade → classificação vira `UNKNOWN` para cálculo;
   - retenção → status vira `UNVERIFIED` (prontidão `PARTIAL`);
   - FII → status vira `PARTIAL`.

## Concorrência

Criações concorrentes da mesma identidade são serializadas pela **unique constraint** do banco; exatamente uma linha canônica é criada.
