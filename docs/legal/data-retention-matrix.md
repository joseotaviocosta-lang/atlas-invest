# Matriz de Retenção e Descarte de Dados Pessoais

> [!WARNING]
> **DRAFT — LEGAL REVIEW REQUIRED — NOT FOR PRODUCTION PUBLICATION**
> Este documento é uma minuta preliminar técnica gerada na Fase 6B do Project Atlas para estruturação de conformidade. Exige revisão formal por assessoria jurídica antes de qualquer publicação pública.
> - **[LEGAL_ENTITY_INFORMATION_REQUIRED]:** Razão social, CNPJ e endereço da pessoa jurídica controladora pendentes de definição societária.
> - **[PRIVACY_CONTACT_REQUIRED]:** Identidade e canal de contato do Encarregado pelo Tratamento de Dados Pessoais (DPO) pendentes de nomeação formal.

---

## 1. Princípio da Retenção Responsável e Segurança Contra Destruição Ilícita

A Lei Geral de Proteção de Dados Pessoais estabelece expressamente em seu **Art. 16, I** que os dados pessoais serão eliminados após o término do tratamento, **autorizada a conservação para cumprimento de obrigação legal ou regulatória pelo controlador**.

No âmbito de investimentos financeiros e tributação de renda variável:
- O **Código Tributário Nacional (CTN, Arts. 173 e 174)** e as Instruções Normativas da Receita Federal do Brasil (IN RFB) impõem o prazo prescricional/decadencial de **5 anos** para a guarda de comprovantes contábeis, apuração de ganho de capital e notas de corretagem.
- Portanto, pedidos de eliminação (`DELETION`) ou anonimização (`ANONYMIZATION`) formulados por titulares **NÃO operam a destruição em cascata do livro-razão (ledger) de transações financeiras**.
- O sistema desativa a conta (`deactivated_at`), revoga compulsoriamente todas as sessões e isola o acesso, classificando a requisição com o status formal **`PENDING_LEGAL_RETENTION_REVIEW`**.

---

## 2. Tabela de Prazos de Retenção por Categoria

| Categoria de Dados | Tabelas Prisma Associadas | Prazo de Retenção | Justificativa Legal / Normativa | Ação ao Fim do Prazo |
| :--- | :--- | :--- | :--- | :--- |
| **Ledger de Transações e Notas** | `transactions`, `transaction_rectifications`, `reconciliation_decisions` | **5 anos fiscais** (a contar do encerramento do ano-calendário da apuração) | **Art. 16, I da LGPD** c/c **Arts. 173/174 do CTN** e normas da RFB | Bloqueio de acesso operacional; eliminação definitiva física após decurso decadencial pleno |
| **Obrigações Fiscais e DARF** | `tax_obligations`, `tax_payment_evidence`, `tax_settlement_records`, `official_darf_generation_records` | **5 anos fiscais** | **Art. 16, I da LGPD** c/c obrigação de comprovação de recolhimento tributário | Expurgado após o quinquênio tributário |
| **Registros de Sessão e Autenticação** | `sessions`, `password_reset_tokens` | **15 dias a 6 meses** (sessões revogadas após 15 dias; logs de acesso por 6 meses) | **Art. 15 da Lei 12.965/2014 (Marco Civil da Internet)** | Purga automatizada de sessões expiradas/revogadas |
| **Auditoria de Consentimentos** | `user_consents`, `legal_document_acceptances` | **5 anos** após o encerramento do vínculo com o usuário | **Art. 8º, § 2º da LGPD** (ônus da prova da obtenção do consentimento pelo controlador) | Arquivo digital imutável de evidência probatória |
| **Registros de Solicitações do Titular (DSR)** | `data_subject_requests` | **5 anos** | Comprovação perante a Autoridade Nacional de Proteção de Dados (ANPD) e judiciário | Arquivo histórico de conformidade |
| **Conversas e Perguntas de IA** | `ai_conversations`, `ai_conversation_messages` | Enquanto a conta estiver ativa ou até exclusão voluntária pelo investidor | **Consentimento do Titular** (Art. 7º, I) e **Legítimo Interesse** (Art. 7º, IX) | Exclusão lógica sob comando do titular na interface ou desativação da conta |
| **Watchlists e Preferências** | `watchlist_items`, configurações cadastrais | Enquanto a conta estiver ativa | **Execução de Contrato** (Art. 7º, V) | Excluído ou desvinculado no encerramento da conta |

---

## 3. Fluxo de Atendimento a Pedidos de Eliminação (Art. 18, VI LGPD)

1. **Recepção:** Titular solicita exclusão via Central de Privacidade (`POST /api/v1/privacy/requests` ou `/account/deactivate`).
2. **Desativação Imediata:** 
   - A conta do investidor é marcada com `deactivated_at = now()`.
   - Todas as sessões ativas são invalidadas (`revoked_at = now()`).
   - O e-mail é mantido em quarentena sem disparo de comunicações promocionais.
3. **Classificação Protetiva:** A solicitação é classificada como `PENDING_LEGAL_RETENTION_REVIEW`.
4. **Parecer Transparente:** É retornado ao titular o parecer explicativo:
   > _"Em conformidade com o Art. 16 da LGPD c/c legislação tributária federal, dados cadastrais de contato e credenciais foram bloqueados; registros contábeis e transações de custódia permanecem sob guarda obrigatória de 5 anos para eventual atendimento perante a administração tributária."_
5. **Decurso Decadencial:** Transcorrido o prazo quinquenal, rotina de segurança purga os registros fiscais sem prejuízo da responsabilidade legal.

