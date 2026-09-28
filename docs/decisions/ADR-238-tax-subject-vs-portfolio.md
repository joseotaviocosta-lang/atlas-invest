# ADR-238: Sujeito Passivo Distinto de Carteira

## Status

Aceito (Fase 4A)

## Contexto

Obrigações tributárias pertencem a uma **pessoa** (o sujeito passivo), não a uma carteira.
Um mesmo investidor pode possuir múltiplas carteiras e múltiplas contas. Acoplar a
arquitetura fiscal a um único `PortfolioId` tornaria impossível, no futuro, consolidar
corretamente os fatos tributáveis de todas as carteiras do mesmo titular.

## Decisão

1.  **TaxSubjectId:** Introduz-se a abstração `TaxSubjectId`, um identificador opaco.
    Na aplicação, mapeia para o usuário autenticado.

2.  **Sem PII no Domínio:** O Tax Engine nunca usa CPF, e-mail ou qualquer PII como
    identidade. `TaxSubjectId` é opaco.

3.  **Multi-Carteira:** O estado fiscal mensal agrega os eventos das múltiplas carteiras do
    mesmo sujeito passivo, sem dupla contagem de transferências internas.

4.  **Sem Acoplamento Permanente:** A arquitetura **não** fica permanentemente amarrada a
    uma carteira. O endpoint fiscal é escopado por sujeito passivo (usuário autenticado),
    não por `portfolioId`.

5.  **Classificação de Ativos:** A categoria fiscal do ativo deriva de metadados
    canônicos do ativo (`AssetType`), nunca do ticker.

6.  **Multi-Conta:** Transferências entre contas da mesma carteira (ou entre carteiras do
    mesmo sujeito) não geram venda nem compra fiscal.

## Consequências

- Consolidação fiscal correta por titular habilitada desde a fundação.
- Privacidade preservada: nenhum identificador pessoal no domínio fiscal.
- Transferências internas são neutras por construção.
