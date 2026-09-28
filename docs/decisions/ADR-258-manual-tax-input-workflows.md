# ADR-258: Fluxos Manuais de Input Tributário

## Status

Aceito (Fase 4B.4)

## Contexto

Os inputs persistidos na 4B.3 careciam de UX. Usuários precisam informar fatos
canônicos sem que a interface decida lei tributária.

## Decisão

1. UX manual para classificação de operação, retenção/IRRF e fatos de FII.
2. A UX coleta fatos; nunca alíquota/isenção/imposto/compensação.
3. Estado inicial `UNKNOWN`; sem pré-seleção de `NORMAL`.
4. Salvar registra proveniência manual (`MANUAL*` + `confirmedAt`).
5. Editar com valor diferente gera conflito explícito (nunca sobrescreve).
6. Decimal exato como string; comma brasileiro normalizado deterministicamente.
7. Copy factual, sem aconselhamento.

## Consequências

- Usuário fornece e revisa inputs reais com segurança.
- Nenhuma decisão legal delegada à UI.
