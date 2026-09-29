# ADR-291: Armazenamento Privado de Documento Oficial

## Status

Aceito (Fase 4F) — **não aplicável nesta fase**

## Contexto

Caso o Atlas viesse a receber bytes do DARF oficial, eles deveriam ser privados,
com hash SHA-256, autorização e imutabilidade.

## Decisão

1. **Nesta fase não há documento oficial** gerado/armazenado; apenas o registro
   de handoff.
2. **Regra futura**: se houver PDF oficial, armazenar apenas em storage privado
   (nunca bucket público), com SHA-256, autorização por usuário, validação de
   MIME/tipo, limite de tamanho e download seguro (sem conteúdo ativo).
3. **Nunca** servir URL pública nem conteúdo inline não seguro.
4. **Sem barcode/PIX/QR sintéticos**.

## Consequências

- Nenhum risco de exposição de documento oficial nesta fase.
- A regra fica pré-comprometida para a futura integração oficial.
