# ADR-237: Regras Fiscais Versionadas e Efetivas por Data

## Status

Aceito (Fase 4A)

## Contexto

A legislação tributária brasileira muda ao longo do tempo. Aplicar a regra "de hoje" a um
fato gerador passado produziria resultado incorreto (e não reproduzível). O sistema precisa
de conjuntos de regras com vigência explícita, sem espalhar percentuais, limites de isenção
ou condições legais pelo código de aplicação.

## Decisão

1.  **TaxRuleSet:** Toda regra fiscal material é representada por um `TaxRuleSet` com
    `id`, `jurisdiction`, `version`, `effectiveFrom`, `effectiveTo?` e `status`.

2.  **Status:** `TEST_ONLY | VERIFIED | RETIRED`. Somente regras `VERIFIED` poderão produzir
    responsabilidade tributária de produção (Fase 4B). A Fase 4A usa apenas fixtures
    `TEST_ONLY` e nunca calcula imposto.

3.  **Resolução Efetiva:** `resolveTaxRuleSet(ruleSets, jurisdiction, date)` resolve
    deterministicamente a regra vigente na data. Sem regra vigente → falha fechada
    (`MISSING_RULE_SET`).

4.  **Sobreposição Inválida:** Períodos de vigência sobrepostos para a mesma jurisdição
    são configuração inválida e falham validação (`AMBIGUOUS_RULE_SET`).

5.  **Sem Regra "Mais Próxima":** É proibido selecionar heurísticamente a regra mais
    próxima. Ausência de cobertura é erro, nunca aproximação.

6.  **Versionamento Imutável:** Atualizar uma fonte legal não muta um `TaxRuleSet` já
    `VERIFIED`. Exige-se nova versão. Meses históricos permanecem reproduzíveis sob a
    regra de sua época.

7.  **Sem Lei Inventada:** A Fase 4A não hardcoda alíquotas, isenções ou limites da
    legislação vigente sem fonte oficial verificada. Fixtures de teste são explicitamente
    rotuladas `TEST_ONLY`.

## Consequências

- O tratamento fiscal é determinado pela data do fato gerador/competência.
- A cobertura legal incompleta falha fechada em vez de inventar valores.
- A Fase 4B poderá introduzir regras de produção sem reescrever o motor.
