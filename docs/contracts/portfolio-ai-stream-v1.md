# Portfolio AI Stream Contract v1 (Fase 3U)

**Schema Version:** `1`  
**Status:** ACTIVE  
**Package:** `@atlas/ai-engine`  

---

## 1. Finalidade

O contrato de entrega por fluxo (`Grounded AI Streaming`) define o protocolo de transporte unidirecional Server-Sent Events (SSE) para comunicação em tempo real de mensagens fundamentadas de inteligência artificial no Project Atlas.

O objetivo é fornecer ao investidor feedback de progresso determinístico e responsivo em interfaces web e móveis, mantendo fidelidade estrita à autoridade financeira no servidor (`Server Authority`) e ao modelo de validação prévia de alegações (ADR-193–ADR-198 e ADR-199–ADR-203).

---

## 2. Invariante Central: Proibição de Autoridade Financeira Parcial (ADR-200)

> **TEXTO PARCIAL DO PROVEDOR NÃO É RESPOSTA FINANCEIRA.**
> Eventos intermediários de progresso (`PROGRESS`) transmitem unicamente o estágio atual da esteira analítica e mensagens de cortesia livres de números, moedas, cotações, rentabilidades ou métricas financeiras.
> A resposta analítica final e todos os seus valores numéricos só são emitidos e disponibilizados ao investidor no evento terminal `FINAL`, após validação completa e renderização pelo servidor.

---

## 3. Tipos de Eventos (`STREAM_EVENT_TYPES`)

O protocolo define exatamente quatro tipos canônicos de eventos:

| Tipo | Semântica | Carga Útil (`data`) |
| :--- | :--- | :--- |
| `STARTED` | Notificação de início de processamento da mensagem | `conversationId`, `portfolioId` |
| `PROGRESS` | Transição de estágio determinístico da esteira analítica | `stage` (`CLASSIFYING`, `GROUNDING`, `GENERATING`, `VALIDATING`, `RENDERING`), `message` |
| `FINAL` | Entrega terminal da resposta validada e persistida | `messageId`, `turnIndex`, `status`, `intent`, `answer`, `evidence`, `claims`, `limitations` |
| `ERROR` | Falha fatal com término do fluxo e rollback limpo | `code`, `message` |

---

## 4. Estágios de Progresso Canônicos (`STREAM_PROGRESS_STAGES`)

A esteira de geração em streaming percorre sequencialmente os seguintes estágios:

1. `CLASSIFYING`: Classificação semântica da intenção do investidor contra o escopo de análise permitido.
2. `GROUNDING`: Extração determinística de fatos auditados do ledger e de motores upstream.
3. `GENERATING`: Geração de rascunho de afirmações estruturadas pelo provedor de inteligência artificial.
4. `VALIDATING`: Validação estrita de cada claim contra fatos do grounding no servidor (ADR-193–ADR-198).
5. `RENDERING`: Montagem da resposta canônica através de formatação exata de strings decimais.

### Mensagens Canônicas de Progresso (`CANONICAL_PROGRESS_MESSAGES`)
- `CLASSIFYING`: "Analisando sua pergunta e intenção analítica..."
- `GROUNDING`: "Obtendo fatos comprovados da carteira no ledger..."
- `GENERATING`: "Estruturando explicação analítica factual..."
- `VALIDATING`: "Validando alegações e evidências financeiras no servidor..."
- `RENDERING`: "Formatando resposta final autoritativa..."

Todas as mensagens canônicas são estritamente livres de algarismos numéricos e símbolos monetários.

---

## 5. Limites e Sequenciamento (ADR-199)

- **Numeração Monotônica:** Todo evento contém `sequence` inteiro iniciando estritamente em `1` e incrementado em exatamente `+1` a cada evento transmitido.
- **Limite Superior de Eventos:** O fluxo transmite no máximo **8 eventos** por mensagem.
- **Travamento Terminal:** Uma vez emitido um evento `FINAL` ou `ERROR`, a emissão de qualquer outro evento é expressamente bloqueada pelo `GroundedAiStreamEmitter`.
- **Persistência Atômica Antes do FINAL (ADR-203):** O registro do turno no banco de dados é gravado e confirmado antes da transmissão do evento `FINAL`. Em caso de erro técnico ou cancelamento prévio, nenhum turno de assistente respondido com sucesso é persistido.

