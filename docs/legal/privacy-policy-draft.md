# Política de Privacidade e Proteção de Dados Pessoais

> [!WARNING]
> **DRAFT — LEGAL REVIEW REQUIRED — NOT FOR PRODUCTION PUBLICATION**
> Versão Técnica: 1.0.0 — Data de Vigência: 28 de outubro de 2026.
> Este documento é uma minuta preliminar elaborada para verificação técnica da conformidade com a LGPD (Lei Federal nº 13.709/2018). Exige revisão e validação jurídica antes de veiculação externa em produção.
> - **[LEGAL_ENTITY_INFORMATION_REQUIRED]:** Razão social, CNPJ e endereço da sociedade empresária titular do Project Atlas.
> - **[PRIVACY_CONTACT_REQUIRED]:** Nomeação formal e endereço eletrônico do Encarregado pelo Tratamento de Dados Pessoais (DPO).

---

## 1. Apresentação e Compromisso com a Privacidade

O **Project Atlas** (`[LEGAL_ENTITY_INFORMATION_REQUIRED]`) tem como premissa inegociável a transparência, segurança técnica e respeito aos direitos fundamentais de liberdade e privacidade dos investidores. Esta Política explica claramente como tratamos suas informações pessoais e patrimoniais.

---

## 2. Dados Pessoais que Tratamos

Para prover os serviços de consolidação de carteira e apuração fiscal, tratamos:

1. **Dados de Cadastro e Acesso:** Nome completo, e-mail, credenciais criptografadas via algoritmo Argon2id, preferências de localização e moeda base.
2. **Dados de Custódia e Carteira:** Ativos, quantidades, preços unitários, custos de aquisição, instituições financeiras conectadas e histórico de movimentações.
3. **Dados Fiscais:** Informações para preenchimento de DARF, cálculo de ganho de capital líquido em bolsa de valores, deduções legais e informes para DIRPF.
4. **Metadados de Conexão e Sessão:** Endereço IP de origem, identificador de sessão (`x-request-id`), User-Agent e carimbos de data/hora (cumprimento do Marco Civil da Internet).

**O que NUNCA coletamos ou comercializamos:**
- O Project Atlas **NÃO** comercializa, aluga ou cede dados pessoais ou dados de patrimônio a terceiros para fins de marketing ou publicidade comportamental.
- O Project Atlas **NÃO** realiza rastreamento invasivo por cookies de terceiros em sua aplicação.

---

## 3. Bases Legais para o Tratamento (Art. 7º da LGPD)

O tratamento de dados no Atlas apoia-se em bases legais legítimas e específicas:
- **Execução de Contrato (Art. 7º, V):** Para prestar os serviços de consolidação patrimonial contratados pelo investidor.
- **Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II):** Para apuração e guarda de registros exigidos pelo Código Tributário Nacional e normas da Receita Federal.
- **Consentimento Específico e Destacado (Art. 7º, I):** Para recursos opcionais, como análises contextuais apoiadas em Inteligência Artificial (`AI_GROUNDED_EXPLANATIONS`).
- **Legítimo Interesse (Art. 7º, IX):** Para telemetria agregada, segurança da infraestrutura e prevenção contra fraudes e acessos não autorizados.

---

## 4. Compartilhamento de Dados com Terceiros

Compartilhamos estritamente o volume indispensável de dados nas seguintes situações:
1. **B3 S.A. (Brasil, Bolsa, Balcão):** Quando autorizado pelo usuário, para importação automatizada de extratos de custódia e notas de negociação.
2. **Receita Federal do Brasil:** Mediante emissão e comando exclusivo do próprio investidor na apuração de DARF e DIRPF.
3. **Provedores de Nuvem e IA (Google Cloud):** Sob acordos de confidencialidade e operando estritamente como operadores; provedores de IA recebem apenas o contexto pontual da dúvida financeira enviada e nunca têm acesso a senhas ou hashes de autenticação.

---

## 5. Direitos do Titular de Dados (Art. 18 da LGPD)

Você possui controle total sobre suas informações através da nossa **Central de Privacidade** acessível diretamente em sua conta (`/profile/privacy`):
- **Confirmação e Acesso (Art. 18, I e II):** Confirmação da existência de tratamento e visualização de todos os seus dados.
- **Correção (Art. 18, III):** Retificação imediata de dados cadastrais incompletos, inexatos ou desatualizados.
- **Portabilidade (Art. 18, V):** Download instantâneo de arquivo estruturado em JSON contendo todo o seu histórico contábil e patrimonial.
- **Revogação do Consentimento (Art. 18, IX):** Revogação simples e facilitada de qualquer consentimento outorgado com efeito imediato.
- **Eliminação e Desativação (Art. 18, VI):** Desativação voluntária da conta a qualquer momento.

> **Aviso Importante sobre Retenção Fiscal:** Conforme o Art. 16, I da LGPD c/c legislação tributária (Arts. 173 e 174 do CTN), o encerramento da conta bloqueia seus acessos e desativa credenciais, contudo os registros contábeis de custódia e notas de negociação devem ser preservados pelo prazo legal de **5 anos** para eventual fiscalização tributária.

---

## 6. Segurança da Informação

Adotamos padrões rigorosos de segurança:
- Criptografia de senhas com Argon2id.
- Tokens de acesso efêmeros em memória volátil com tempo de vida de 15 minutos.
- Rotação estrita de refresh tokens com detecção de reuso e invalidação de sessão.
- Isolamento rígido multi-inquilino (tenant isolation) em nível de banco de dados.
- Bloqueio completo de logs de valores financeiros, saldos ou patrimônio total em ferramentas de observabilidade.

---

## 7. Canal de Atendimento e DPO

Para dúvidas, esclarecimentos ou exercício formal de direitos perante o Encarregado pelo Tratamento de Dados Pessoais (DPO):
- **Encarregado (DPO):** `[PRIVACY_CONTACT_REQUIRED]`
- **Canal Oficial de Privacidade:** `privacidade@atlas.local`
- **Endereço Postal:** `[LEGAL_ENTITY_INFORMATION_REQUIRED]`

