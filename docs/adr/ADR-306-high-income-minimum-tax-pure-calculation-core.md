# ADR-306: Núcleo de Cálculo Puro e Determinístico da Tributação Mínima de Alta Renda

## Contexto

A Fase 4I.1 congelou a fundação legal e de dados da tributação mínima de alta renda (IRPFM) da Lei
nº 15.270/2025, com limiar em `TOTAL_ANNUAL_INCOME`, base após exclusões e alíquota de 0% a 10%.
A Fase 4I.2 deve calcular o tributo com precisão decimal arbitrária, distinguindo rigorosamente o
imposto **bruto** (potencialmente calculável) do imposto **líquido** (autoritativo apenas quando
todos os créditos/reduções legalmente exigidos estiverem suportados e comprovados).

A fundação 4I.1 modela a redução corporativa do art. 16-B como CONDICIONAL/PARCIAL, **sem fórmula
congelada**. Portanto, o núcleo 4I.2 não pode implementá-la nem ignorá-la silenciosamente.

## Decisão

1. O cálculo é uma **função pura, determinística e sem I/O** (`calculateHighIncomeMinimumTax`), que
   consome a fundação 4I.1 sem reinterpretá-la. Nenhum acesso a Prisma, Nest, React, rede ou banco
   (0 queries).
2. **Limiar e base são quantidades distintas**: a aplicabilidade usa `TOTAL_ANNUAL_INCOME`; o
   cálculo usa a base após as exclusões do § 1º.
3. A alíquota é derivada de forma determinística do `HighIncomeMinimumTaxRuleSet` (offset = alíquota
   máxima; divisor = limiar/offset), sem literais mágicos. É limitada a 10% e monotônica.
4. **Imposto bruto e líquido são distintos.** O bruto é calculado sempre que a base é resolvível. O
   líquido só é emitido quando todos os créditos/reduções exigidos estão suportados e evidenciados.
5. **Créditos suportados** (art. 16-A §3/§5) podem ser subtraídos; o imposto líquido **nunca é
   negativo** e o excedente é classificado (não restituído). A redução corporativa do art. 16-B
   **não é implementada**; quando potencialmente aplicável, o líquido é bloqueado
   (`INCOMPLETE_REDUCTION_DATA`).
6. **Desconhecido ≠ zero**: base não resolvida produz `null` (nunca `"0"`); crédito exigido ausente
   produz `net = null` com `gross` conhecido; `NOT_APPLICABLE` produz `null` (nunca zero calculado).
7. **Entradas não suportadas falham fechado** (`UNSUPPORTED_INPUT`); duplicatas conflitantes
   bloqueiam (`BLOCKED`); duplicatas idênticas não são contadas em dobro.
8. **Arredondamento em ponto único**: precisão operacional de 40 dígitos; moeda em 2 casas
   (centavos), `ROUND_HALF_UP`, aplicado uma única vez às saídas monetárias finais. Zero float.
9. **Fingerprints determinísticos**: `sourceFingerprint` (snapshot 4I.1) e
   `calculationFingerprint` (conteúdo canônico). Revisão de fonte ou de `ruleVersion` altera o
   fingerprint; a ordem das entradas não o altera.
10. O cálculo é **derivado e não persistido**; a 4I.2 não adiciona API, UI nem persistência.

## Consequências

- **Positivas:** cálculo auditável e reprodutível; separação explícita entre bruto e líquido;
  impossibilidade de fabricar imposto líquido quando faltam componentes legais; conformidade com a
  política de zero floats e de fail-closed.
- **Negativas:** o imposto líquido permanece indisponível sempre que a redução corporativa do
  art. 16-B for potencialmente aplicável (dividendos incluídos) até que sua fórmula seja congelada em
  fase futura; créditos exigidos ausentes mantêm o líquido desconhecido.
