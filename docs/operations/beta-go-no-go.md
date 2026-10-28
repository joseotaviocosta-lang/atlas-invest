# Project Atlas — Beta Go / No-Go Decision Framework

**Data de Avaliação:** 2026-10-28  
**Versão Auditada:** Phase 6C (Commit base: `fdbe3eb`)  
**Status Atual:** `PHASE_6C_TECHNICAL_COMPLETE`  
**Decisão:** `EXTERNAL_BETA_BLOCKED` / `TECHNICALLY_READY_FOR_INTERNAL_BETA`

---

## 1. Critérios de Avaliação Go / No-Go

Para que o Atlas receba aprovação definitiva para lançamento em Beta Externo com investidores públicos, cada um dos 8 pilares fundamentais deve apresentar status `GO`.

| Pilar | Critério de Avaliação | Evidência Técnica / Status | Decisão |
| :--- | :--- | :--- | :---: |
| **1. Arquitetura Técnica** | Monorepo tipado, compilação limpa, zero dependência circular. | Typecheck 25/25, builds Web e API com código 0. | **GO** |
| **2. Integridade Financeira** | Zero floats em cálculos monetários, ledger imutável, replay puro determinístico. | Replay Engine determinístico com Decimal.js, 100% de testes fiscais e de portfólio verdes. | **GO** |
| **3. Segurança e Acesso** | Senhas com Argon2id, tokens rotativos, proteção contra força bruta, sanitização de logs. | Throttling em rotas de auth, segredos fortes validados no startup, headers de segurança HSTS e CSP. | **GO** |
| **4. Privacidade & LGPD** | Centro de privacidade com DSR, exportação JSON sem segredos, consentimentos granulares. | Fase 6B concluída com 8/8 testes de API e 2/2 testes web aprovados. | **GO** |
| **5. Operações & Banco** | Recuperação de desastres testada, 45 migrações aplicadas, RTO < 30s. | `pnpm db:restore:verify` aprovado (45 migrations, 64 tabelas, RTO ~20s). | **GO** |
| **6. Jurídico & Termos** | Aprovação de assessoria jurídica sobre Termos de Uso e Política de Privacidade. | Minutas em `docs/legal/` contêm watermark `NOT FOR PRODUCTION PUBLICATION`. CNPJ e DPO pendentes. | **NO-GO** |
| **7. E-mail Transacional** | Provedor de e-mail integrado para autorrecuperação de senhas. | `InMemoryPasswordResetNotifier` ativo na API; e-mails não chegam a caixas externas. | **NO-GO** |
| **8. Suporte e Monitoramento**| Canal de atendimento a usuários e alertas automáticos para falhas críticas da aplicação. | Alertas operacionais não conectados a canal externo (Pager/Slack/E-mail); canal de suporte não formalizado. | **NO-GO** |

---

## 2. Análise Detalhada dos Bloqueadores (No-Go)

### 2.1. Bloqueador 1: Minutas Jurídicas e Dados do Controlador Pendentes (P0)
- **Motivo:** O lançamento externo expõe o projeto à responsabilização civil e administrativa nos termos da LGPD e do Código de Defesa do Consumidor. A publicação de termos sem revisão de advogado e sem identificação da pessoa jurídica controladora é proibida pelas regras do projeto.
- **Resolução Exigida:** Submissão das minutas de `docs/legal/` para revisão de assessoria jurídica especializada e inserção do CNPJ, razão social e e-mail oficial do encarregado de dados (DPO).

### 2.2. Bloqueador 2: Ausência de Provedor de E-mail Transacional (P0)
- **Motivo:** Caso um usuário externo esqueça sua senha de acesso, ele ficará bloqueado sem possibilidade de recuperação autônoma, gerando atrito e chamados manuais de emergência.
- **Resolução Exigida:** Configuração de adaptador de e-mail (ex: Resend, Postmark ou AWS SES) para envio de links de redefinição de senha com tokens de uso único.

### 2.3. Bloqueador 3: Canais de Suporte e Alerting Crítico (P1)
- **Motivo:** Não há canal estruturado para reporte de problemas operacionais por usuários nem alertas proativos enviados aos engenheiros quando ocorrer taxa anormal de erro 5xx ou indisponibilidade de banco.
- **Resolução Exigida:** Criação de canal de suporte (ex: `suporte@atlasinvest.com.br`) e configuração de monitor sintético de `/ready`.

---

## 3. Deliberação Final

O sistema encontra-se plenamente preparado do ponto de vista de código e arquitetura para atender usuários reais.

Entretanto, observando o rigor e a conformidade inegociável do Project Atlas, o lançamento externo deve aguardar a resolução dos bloqueadores acima.

**Veredito Oficial:**
- **Beta Interno / Equipe / Testadores Convidados sob NDA:** **AUTORIZADO (GO)**.
- **Beta Externo / Público Aberto:** **SUSPENSO ATÉ SUPRESSÃO DOS P0 (NO-GO)**.
