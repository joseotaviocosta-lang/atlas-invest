# ADR-214: Strict Prohibition of Cross-Asset Evidence

## Status

Aceito (Fase 3W)

## Contexto

Quando a IA gera uma resposta explicativa para um ativo A (ex.: PETR4), há risco de alucinação cruzada (citar quantidades, dividendos ou preços pertencentes ao ativo B, como VALE3), especialmente se o modelo citar fatos misturados.

## Decisão

1. **Validação Determinística de Evidência Cruzada:**
   - O validador de claims `validateGroundedClaims` recebe o parâmetro canônico `targetAssetId`.
   - Se qualquer claim citar um `factId` cujo prefixo (`ASSET:<outroId>.*`) ou cujo atributo `assetId` divirja do `targetAssetId`, a claim é imediatamente invalidada com o código `CROSS_ASSET_EVIDENCE_PROHIBITED`.
2. **Falha Fechada e Rejeição HTTP 422:**
   - Respostas do modelo contendo evidências de outros ativos falham fechado na API com status `422 Unprocessable Entity` (`AI.INVALID_MODEL_RESPONSE`), impedindo a persistência ou renderização da resposta corrompida.
3. **Consistência de Moeda:**
   - A validação de claims confere ainda se todas as métricas monetárias do ativo estão na mesma moeda declarada pelo ativo na custódia (`assetCurrency`).

## Consequências

- Isolamento estrito de evidências financeiras por ativo.
- Eliminação de alucinações cruzadas na camada de validação do servidor.
