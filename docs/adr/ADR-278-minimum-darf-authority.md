# ADR-278: Autoridade do DARF Mínimo

## Status

Aceito (Fase 4E)

## Contexto

A Fase 4D diferiu a regra de valor mínimo de recolhimento por DARF. Ativar esse
comportamento em produção exige texto oficial completo, vigência atual e
aplicabilidade ao código de receita 6015, sob pena de calcular obrigação de
pagamento com base em regra não verificada.

## Decisão

1. **Autoridade Controladora:**
   - Lei nº 9.430/1996, art. 68, _caput_ e § 1º (texto integral inspecionado).
   - IN SRF nº 82/1996, arts. 1º-2º (DOU 31/12/1996).
   - Decreto nº 9.580/2018 (RIR/2018), art. 757, §§ 4º-5º.
   - IN RFB nº 1.500/2014, art. 100, §§ 2º-3º (IRPF).
   - Manual RFB do ReVar — Renda Variável (aplicabilidade a bolsa).

2. **Vigência 2026:** art. 68 não revogado; regra restabelecida pelo RIR/2018 e
   pela página oficial do Sicalc atualizada em 29/09/2026.

3. **Aplicabilidade ao 6015:** tributo administrado pela RFB arrecadado sob
   código de receita; confirmado para renda variável pela fonte oficial do ReVar.

4. **Comparação:** `valor < R$ 10,00` ⇒ abaixo do mínimo; `valor >= R$ 10,00` ⇒
   pagável (igualdade pagável).

5. **Regra Versionada e Efetiva por Data:** `MinimumDarfRuleSet` com
   `effectiveFrom`/`effectiveTo`, código de receita em allow-list e proveniência
   (`sourceIds`, `sourceDocument`, `verifiedAt`). Sem regra vigente ⇒ falha
   fechada (`MISSING_MINIMUM_RULE`); ambiguidade ⇒ `AMBIGUOUS_MINIMUM_RULE`.

6. **Sem Float:** mínimo e comparações em strings decimais exatas.

## Consequências

- A elegibilidade de pagamento é derivada de autoridade verificada e datada.
- Ausência de regra nunca vira valor pagável estimado.
- Nenhuma geração de DARF oficial é habilitada por esta decisão.
