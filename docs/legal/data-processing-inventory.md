# Inventário de Operações de Tratamento de Dados Pessoais (ROPA — Art. 37 LGPD)

> [!WARNING]
> **DRAFT — LEGAL REVIEW REQUIRED — NOT FOR PRODUCTION PUBLICATION**
> Este documento é uma minuta preliminar técnica gerada na Fase 6B do Project Atlas para estruturação de conformidade. Exige revisão formal por assessoria jurídica antes de qualquer publicação pública.
> - **[LEGAL_ENTITY_INFORMATION_REQUIRED]:** Razão social, CNPJ e endereço da pessoa jurídica controladora pendentes de definição societária.
> - **[PRIVACY_CONTACT_REQUIRED]:** Identidade e canal de contato do Encarregado pelo Tratamento de Dados Pessoais (DPO) pendentes de nomeação formal.

---

## 1. Identificação do Controlador e Papéis de Tratamento

- **Controlador Principal:** Project Atlas Tecnologia Financeira `[LEGAL_ENTITY_INFORMATION_REQUIRED]`
- **Encarregado (DPO):** `[PRIVACY_CONTACT_REQUIRED]` — Contato provisório: `privacidade@atlas.local`
- **Operadores Contratados / Conectores:**
  - Provedor de Infraestrutura de Nuvem e Banco de Dados (PostgreSQL / VPS / Cloud)
  - Provedores de Inteligência Artificial: Google Cloud / Vertex AI (sob consentimento granular)
  - Conectores de Custódia e Bolsa: B3 S.A. (quando autorizado pelo investidor)
  - Autoridade Tributária: Secretaria da Receita Federal do Brasil (RFB) — apuração local pelo contribuinte

---

## 2. Inventário de Dados e Matriz de Bases Legais Candidatas (Art. 7º e 11 da LGPD)

| Categoria de Dados | Dados Específicos | Finalidade do Tratamento | Base Legal Candidata (Art. 7º LGPD) | Papel do Atlas | Compartilhamento Externo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Identificação & Acesso** | Nome completo, e-mail, senha (hash Argon2id), fuso horário, localidade | Autenticação, controle de acesso e auditoria de segurança da sessão | **Execução de Contrato** (Art. 7º, V) | Controlador | Nenhum. Credenciais e hashes nunca são transmitidos. |
| **Identidade Fiscal** | CPF, data de nascimento (quando informado para apuração) | Identificação em declarações anuais (DIRPF) e emissão de guias de DARF | **Cumprimento de Obrigação Legal/Regulatória** (Art. 7º, II) c/c CTN | Controlador | Apenas para guias geradas pelo próprio usuário; sem envio automático não autorizado. |
| **Custódia & Transações** | Ativos (ticker), quantidade, preço unitário, corretora, datas de negociação/liquidação | Registro de custódia, cálculo de preço médio (ADR-040) e livro de transações | **Execução de Contrato** (Art. 7º, V) e **Cumprimento de Obrigação Legal** (Art. 7º, II) | Controlador | Nenhum terceiro tem acesso não autorizado; integração B3 apenas mediante comando do investidor. |
| **Tributação e DARF** | Lucros/prejuízos mensais, retenção IRRF dedo-duro, compensações, DARF | Apuração de imposto sobre renda variável e guarda de memória de cálculo | **Cumprimento de Obrigação Legal** (Art. 7º, II) c/c IN RFB | Controlador | Exportação direta pelo investidor para declaração perante a RFB. |
| **Interações com IA** | Dúvidas enviadas, explicações contextuais de carteira geradas pelo modelo | Auxílio na interpretação factual de relatórios e métricas de rentabilidade | **Consentimento Granular do Titular** (Art. 7º, I) | Controlador | Google Vertex AI (operador) — estritamente contexto de pergunta; sem CPF ou senhas. |
| **Telemetria e Logs** | Endereço IP, User-Agent, latência de rotas, identificador de request (`x-request-id`) | Segurança operacional, prevenção a fraudes (Marco Civil) e diagnóstico de falhas | **Cumprimento de Obrigação Legal** (Art. 7º, II / Marco Civil) e **Legítimo Interesse** (Art. 7º, IX) | Controlador | Armazenamento interno sob rotação e retenção técnica; sem cookies de rastreamento publicitário. |

---

## 3. Princípios Fundamentais Aplicados

1. **Finalidade e Adequação (Art. 6º, I e II):** O tratamento é estritamente limitado à gestão patrimonial do investidor, escrituração de custódia e conformidade fiscal.
2. **Necessidade e Minimização (Art. 6º, III):** Não coletamos dados de geolocalização precisa, biometria facial, dados de navegação em sites terceiros ou contatos da agenda.
3. **Não Discriminação e Segurança (Art. 6º, VII e IX):** Dados financeiros não são utilizados para score de crédito predatório, venda a bureaus de dados ou marketing invasivo.
4. **Livre Acesso e Transparência (Art. 6º, IV e VI):** Central de Privacidade disponibilizada em `/profile/privacy` com download instantâneo em JSON de todo o acervo mantido.

