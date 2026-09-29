# ADR-277: Regra de DARF Mínimo Diferida do Núcleo

## Status

Aceito (Fase 4D.2)

## Contexto

A regra de DARF mínimo (R$ 10,00; IN SRF 82/1996) não foi totalmente
inspecionada e é independente do cálculo de acréscimos.

## Decisão

1. O mínimo de DARF é classificado como **DARF_ONLY_BLOCKER** e **não** bloqueia
   o motor de atualização por atraso.
2. Nenhuma lógica de carry-forward é ativada na Fase 4D.2.
3. A preparação de DARF pode expor principal/multa/juros/total atualizado, mas
   sinaliza `MINIMUM_DARF_RULE_UNVERIFIED` quando a elegibilidade final depende
   da regra de mínimo.

## Consequências

- Núcleo de atraso desbloqueado; mínimo tratado separadamente no futuro.
