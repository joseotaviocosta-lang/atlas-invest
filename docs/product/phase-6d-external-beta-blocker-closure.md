# Project Atlas — Phase 6D: External Beta Blocker Closure Report

**Data:** 2026-10-28  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**HEAD de Entrada:** `ba4434fdcd3271420eba9e682c42cb018dd23652`  
**Status Técnico:** `PHASE_6D_TECHNICAL_COMPLETE`  
**Status de Lançamento:** `TECHNICALLY_READY_FOR_EXTERNAL_BETA_DEPLOYMENT / EXTERNAL_BETA_LEGAL_BLOCKED`  
**Regra Permanente:** `NO PUSH`, `NO DEPLOY`, `NO DNS CHANGE`, `NO PAID INFRASTRUCTURE PURCHASE`

---

## 1. Visão Geral e Objetivos Atingidos

A Fase 6D teve como missão resolver todos os bloqueadores técnicos (P0) identificados na auditoria de readiness da Fase 6C, transformando o Project Atlas de um produto estritamente interno em um candidato **tecnicamente pronto para deployment em Beta Externo (`TECHNICALLY_READY_FOR_EXTERNAL_BETA_DEPLOYMENT`)**, mantendo explicitamente a trava jurídica **`EXTERNAL_BETA_LEGAL_BLOCKED`** até que uma assessoria jurídica humana conclua a revisão das minutas.

### Principais Entregas Técnicas:
1. **Subsistema de E-mail Transacional Neutro e Seguro:**
   - Abstração `TransactionalEmailSender` desacoplada.
   - Implementação de adaptadores reais para **Resend** (REST API nativa sem dependências extras) e **SMTP**.
   - Proibição estrita de simuladores (`InMemoryPasswordResetNotifier` é **fatal** em produção).
   - Template pt-BR claro com link de redefinição único de 15 minutos, proteção anti-enumeração e higienização absoluta de logs (tokens nunca são gravados).
   - Suíte de 13 testes de segurança automatizados aprovada (`tests/api/phase-6d-email-security.test.ts`).
2. **Pacote Completo de Deployment para Produção:**
   - Dockerfiles multi-stage não-root para `apps/api` e `apps/web` (Next.js Standalone).
   - Configurações de Proxy Reverso em **NGINX** e **Caddy** com HTTPS obrigatório, HSTS, SSE para IA contextual sem buffer e limite de upload de 1MB.
   - `docker-compose.prod.yml` estruturado para orquestração local/staging.
3. **Dossiê Consolidado de Handoff Jurídico (`legal-review-handoff.md`):**
   - Rastreamento dos rascunhos com watermarks obrigatórios.
   - Questionário objetivo de 13 decisões fundamentais para parecer do advogado/DPO.
   - Correção preventiva de afirmações sobre obrigatoriedade do CTN, tratando-as como fundamentação candidata sujeita a validação legal.
4. **Auditoria Precisa de Vulnerabilidades de Dependências:**
   - Análise detalhada das 5 vulnerabilidades críticas reportadas pelo `pnpm audit`.

---

## 2. Auditoria Precisa das 5 Vulnerabilidades Críticas (Steps 57 a 60)

O `pnpm audit --audit-level high` identificou 5 advisories classificados como críticos. A análise detalhada da cadeia de suprimentos revelou:

| Pacote | Caminho de Dependência | Escopo | Acessível em Produção? | Versão Corrigida | Risco de Upgrade / Decisão |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **tinypool** | `vitest > tinypool` | **Dev-Only** | **NÃO** | $\ge 2.1.1$ | Ferramenta interna de execução de testes do Vitest. Não empacotada no build da API ou Web. Não afeta o ambiente de execução de produção. |
| **undici** | `apps/mobile > expo > @expo/cli > undici` | **Dev-Only** | **NÃO** | $\ge 6.29.1$ | CLI de desenvolvimento do ecossistema Expo Mobile. Inacessível pelo tráfego web/API de produção. |
| **undici** | `apps/mobile > expo-constants > expo > @expo/cli > undici` | **Dev-Only** | **NÃO** | $\ge 6.29.1$ | Mesma cadeia do Expo CLI no monorepo mobile. Inacessível em produção. |
| **undici** | `apps/mobile > expo-router > expo > @expo/cli > undici` | **Dev-Only** | **NÃO** | $\ge 6.29.1$ | Mesma cadeia do Expo CLI no monorepo mobile. Inacessível em produção. |
| **proxy-addr** | `apps/api > @nestjs/platform-express > express > proxy-addr` | **Runtime** | **Mitigado** | $\ge 2.0.8$ | Vulnerabilidade teórica de spoofing de IP via sub-redes IPv4 mapeadas em IPv6 quando `trust proxy` estiver ativo. No Atlas, o proxy reverso (NGINX/Caddy) atua como sentinela de borda fixando `$remote_addr`. Atualização pontual do Express poderá ser absorvida no ciclo normal do NestJS sem quebras prematuras. |

**Conclusão de Segurança:** Zero vulnerabilidades críticas desprotegidas ou exploráveis no runtime de produção.

---

## 3. Matriz de Resolução de Bloqueadores P0 (Step 76)

| Bloqueador P0 | Status na Fase 6C | Status na Fase 6D | Ação Restante para o Lançamento Externo |
| :--- | :---: | :---: | :--- |
| **E-mail Transacional** | P0 Blocker | **Tecnicamente Resolvido** | Inserir credenciais reais do provedor (`RESEND_API_KEY` ou credenciais SMTP) nas variáveis de ambiente. |
| **Infraestrutura HTTPS**| P0 Blocker | **Tecnicamente Resolvido** | Apontar o DNS do domínio público para o proxy reverso e emitir certificado TLS (Caddy automatizado ou Certbot). |
| **Aprovação Jurídica** | P0 Blocker | **BLOQUEADO (Ação Humana)**| Enviar o arquivo `docs/legal/legal-review-handoff.md` para assessoria jurídica e obter parecer formal assinado. |

---

## 4. Matriz de Responsabilidades do Owner / Próximos Passos (Step 77)

```text
========================================================================================
PROJECT ATLAS — OWNER & STAKEHOLDER ACTION MATRIX
========================================================================================

[ ENGENHARIA DE SOFTWARE ] (Concluída nesta fase)
✔ Implementar adaptadores de e-mail transacional (Resend e SMTP) com fail-fast.
✔ Implementar suíte de testes de segurança de reset de senha e anti-enumeração.
✔ Gerar Dockerfiles multi-stage não-root para API e Web (Next.js Standalone).
✔ Configurar proxies reversos (NGINX e Caddy) com HTTPS, HSTS, SSE e limite de 1MB.
✔ Estruturar dossiê de handoff para assessoria jurídica.

[ OWNER / DECISÃO DE NEGÓCIO ] (Próxima etapa controlada)
◻ Contratar ou selecionar o provedor de e-mail (recomendação técnica: Resend).
◻ Definir a Razão Social, CNPJ e domínio final do projeto.
◻ Provisionar a infraestrutura de staging/beta (VPS ou Managed PostgreSQL + Cloud).
◻ Encaminhar o pacote legal para o advogado do projeto.

[ ASSESSORIA JURÍDICA EXTERNA ] (Etapa mandatória)
◻ Responder às 13 questões em `docs/legal/legal-review-handoff.md`.
◻ Validar a política de retenção fiscal de 5 anos do ledger sob o CTN e LGPD Art. 16.
◻ Autorizar a remoção dos avisos de rascunho (watermarks) dos Termos e Política.
========================================================================================
```

---

## 5. Deliberação e Veredito Final

```text
=====================================================
PROJECT ATLAS — PHASE 6D VERDICT
=====================================================
TECHNICAL READINESS:      [ READY ] (Deploy artifacts, email adapters & tests approved)
REGRESSION TESTING:       [ PASS ]  (Full Web 548/548 tests, API suites passing, 45 migrations)
MIGRATIONS DELTA:         [ 0 ]     (Database remains locked at 45 migrations / 64 tables)
PUSH / DEPLOY:            [ STRICTLY FORBIDDEN ]

STATUS OF SYSTEM:
- PHASE_6D_TECHNICAL_COMPLETE
- TECHNICALLY_READY_FOR_EXTERNAL_BETA_DEPLOYMENT
- EXTERNAL_BETA_LEGAL_BLOCKED (Awaiting legal counsel sign-off)
=====================================================
```

