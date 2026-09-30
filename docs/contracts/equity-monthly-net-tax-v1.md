# Contract: `equity-monthly-net-tax-v1`

Fase 4G.2B — imposto líquido mensal por categoria de renda variável.

## Ordem de cálculo (por categoria, determinística)

1. vendas/quantidade casada (núcleo 4G.2A);
2. resultado do mês;
3. compensação de prejuízo da categoria (`taxableBaseBeforeRate`);
4. isenção (somente normal; day trade nunca isenta);
5. **imposto bruto** = base × alíquota (15% normal / 20% day trade);
6. **IRRF** da categoria aplicado sobre o imposto bruto;
7. **imposto líquido da categoria** =
   `netTaxBefore6015Aggregation = grossTax − irrfUsed`.

## Campos expostos (por categoria)

- `taxRate`, `grossTax`
- `irrfOpening`, `irrfCurrent`, `irrfUsed`, `irrfClosing`
- `netTaxBefore6015Aggregation`
- `ruleId`, `ruleVersion`

Todos serializados como strings decimais exatas.

## Não é obrigação federal final

`netTaxBefore6015Aggregation` é o imposto líquido **da categoria**. **Não** é o
valor final do DARF. A consolidação no código de receita 6015, o mínimo de DARF
e o vencimento pertencem a fases posteriores (4G.2C+).

## Isolamento

FII permanece inalterado. Normal e day trade não se cruzam em prejuízo nem em
IRRF.

## Fora de escopo

6015, mínimo DARF, vencimento, atraso, Sicalc, IRPF anual, IA fiscal.
