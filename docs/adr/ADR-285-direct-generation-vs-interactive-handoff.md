# ADR-285: Geração Direta vs. Entrega Interativa Oficial

## Status

Aceito (Fase 4F)

## Contexto

Sem API oficial suportada, automatizar o Sicalc exigiria sessão de navegador e
captcha — inaceitável. Ainda assim, o produto precisa levar o usuário da
preparação ao pagamento com segurança.

## Decisão

1. **Modo escolhido**: `OFFICIAL_INTERACTIVE_HANDOFF`.
2. **Atlas prepara**: código de receita, período de apuração, vencimento,
   principal, multa, juros e total exatos, além da fonte oficial.
3. **Usuário conclui**: abre o Sicalc oficial e emite o documento; o Atlas não
   finge geração.
4. **Sem automação de DOM, sem scraping, sem bypass de captcha**.
5. **Sem prefill fabricado**: nenhum parâmetro de URL inventado.
6. Rótulo de ação: "Abrir Sicalc" / "Usar dados no Sicalc", nunca "Gerar DARF
   oficial".

## Consequências

- O relatório final afirma `OFFICIAL DARF GENERATION: NO` e
  `OFFICIAL DARF HANDOFF: YES`, sem borrar a distinção.
