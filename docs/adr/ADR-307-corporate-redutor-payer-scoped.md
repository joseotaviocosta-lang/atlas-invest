# ADR-307: Redutor da Carga Efetiva Corporativa por Identidade Canônica de Pagador

## Contexto

O art. 16-B da Lei nº 9.250/1995 (Lei nº 15.270/2025) concede redutor da tributação mínima quando a
soma da alíquota efetiva dos lucros da pessoa jurídica com a alíquota efetiva da pessoa física
ultrapassa o teto nominal (34%/40%/45%), calculado **por cada pessoa jurídica** distribuidora. A
Fase 4I.2 bloqueava o imposto líquido sempre que dividendos estavam presentes, por falta de fórmula
congelada. A Fase 4I.3 congela a mecânica a partir de fontes primárias e a implementa como motor
puro, preservando fail-closed onde a lei exige documentação ainda não regulamentada na forma final.

## Decisão

1. O redutor é **escopado por pagador** (`payerId` canônico; nome de exibição nunca é identidade).
   Distribuições do mesmo pagador no ano agregam; pagadores distintos nunca se compensam.
2. O Atlas **calcula as razões estatutárias** a partir de valores contábeis explícitos e
   evidenciados (IR+CSLL+Prouni ÷ lucro contábil; incremento PF via modelo 4I.2 congelado), mas
   **nunca fabrica valores contábeis**. Ausência de evidência falha fechado.
3. Somente documentação de origem (`PJ_FINANCIAL_STATEMENTS` ou `RFB_PREFILLED`) com autoridade
   `AUTHORITATIVE` computa. Confirmação do contribuinte sozinha nunca autoriza redução.
4. Tipos de pagador e tetos nominais seguem exatamente o §1º (34/40/45); tipo desconhecido falha
   fechado. JCP e dividendos de transição isentos nunca entram no redutor.
5. A redução é `D_p × max(0, effPJ_p + effPF − teto_p)`, exata por pagador, somada e arredondada uma
   única vez no final (`ROUND_HALF_UP`, centavos). Nunca negativa; sem carryforward; sem reembolso.
6. Evidência conflitante ou incompleta bloqueia o líquido autoritativo (grosso preservado);
   evidência completa destrava `CALCULABLE` com líquido autoritativo.
7. Fingerprints determinísticos por pagador e no agregado; sensíveis a evidência e a `ruleVersion`;
   invariantes à ordem.
8. O redutor é **derivado e não persistido**; sem API, sem UI, 0 queries.

## Consequências

- **Positivas:** o principal bloqueador do líquido autoritativo com dividendos é fechado com
  rastreabilidade por pagador; fórmula auditável contra o texto legal; fail-closed preservado.
- **Negativas:** dividendos com evidência corporativa ausente mantêm o líquido desconhecido;
  múltiplos exercícios de origem de lucro por pagador e forma documental do regulamento pendente
  permanecem como limitações explícitas (fail-closed).
