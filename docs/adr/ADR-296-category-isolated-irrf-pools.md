# ADR-296: Pools de IRRF Isolados por Categoria

## Status

Aceito (Fase 4G.2B)

## Contexto

A tributação de renda variável separa operações comuns (15%) e day trade (20%),
com retenções na fonte distintas (0,005% e 1%). Misturar créditos de IRRF entre
categorias distorceria o imposto devido e não reflete a segregação legal.

## Decisão

1. Cada categoria mantém um **pool de IRRF próprio** (`EQUITY_NORMAL_IRRF`,
   `EQUITY_DAY_TRADE_IRRF`).
2. O IRRF de uma categoria só reduz o imposto bruto **da mesma categoria**.
3. Não existe pool genérico de código de receita: **mesmo código 6015 ≠ mesmo
   pool de IRRF**.
4. O IRRF nunca é consumido quando o imposto bruto é zero.
5. Cada evidência de retenção carrega identidade estável (`fingerprint`) para
   impedir uso duplo.

## Consequências

- Imposto líquido por categoria determinístico e auditável.
- FII permanece inteiramente isolado.
- A consolidação 6015 (fase posterior) parte de valores de categoria já isolados.
