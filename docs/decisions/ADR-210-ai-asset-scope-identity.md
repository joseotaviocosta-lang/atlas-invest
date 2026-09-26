# ADR-210: AssetId as Sole Canonical Identity in AI Scope

## Status

Aceito (Fase 3W)

## Contexto

Ativos financeiros no Project Atlas possuem identidades canônicas globais representadas por `AssetId`. Símbolos/tickers (como PETR4 ou VALE3) são metadados visuais de cotação que podem colidir entre bolsas ou sofrer alterações cadastrais. Inferir a identidade de um ativo através de processamento livre de linguagem natural (NLP/LLM) é não-determinístico e vulnerável a ambiguidades e alucinações.

## Decisão

1. **AssetId como Identidade Canônica Inegociável:**
   - Todo escopo de ativo na IA deve ser explicitado por `AssetId`.
   - Símbolo (`symbol`) e nome da empresa (`name`) atuam estritamente como metadados visuais decorativos.
2. **Resolução de Escopo Fora do Modelo:**
   - A seleção do ativo ocorre no cliente ou na camada de API antes de qualquer invocação ao provedor de IA.
   - É terminantemente proibido utilizar o LLM para adivinhar qual `AssetId` o usuário quis referenciar a partir de texto livre.
3. **Falha Fechada para Escopo Ausente:**
   - Perguntas que solicitem dados individuais de custódia sem escopo de ativo explícito são rejeitadas deterministicamente com `MISSING_ASSET_SCOPE` (0 chamadas a modelos).

## Consequências

- Eliminação de qualquer ambiguidade de tickers e ticker collisions.
- Integridade referencial determinística e reprodutível.
