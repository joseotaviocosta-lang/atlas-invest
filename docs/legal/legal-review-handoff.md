# Project Atlas — Legal Review Handoff Package

**Data de Emissão:** 2026-10-28  
**Fase de Engenharia:** Phase 6D (External Beta Blocker Closure)  
**Status Jurídico Atual:** `LEGAL_REVIEW_PENDING` (Rascunho de Engenharia — Não aprovado para publicação)  
**Gate de Lançamento:** `EXTERNAL_BETA_LEGAL_BLOCKED`  

> [!IMPORTANT]
> Este documento consolida todos os artefatos de privacidade, conformidade e governança de dados produzidos pela engenharia do Project Atlas para análise, revisão e aprovação formal por **assessoria jurídica externa especializada (Advocacia / DPO as a Service)**. Nenhum componente do time de desenvolvimento ou agente de IA possui autoridade para aprovar ou remover os avisos de rascunho sem validação jurídica humana.

---

## 1. Dossiê de Documentos Legais Submetidos a Revisão

Os seguintes documentos foram elaborados sob estrita observância das capacidades factuais do software e estão arquivados em `docs/legal/`:

1. **[Minuta dos Termos de Uso (v1.0.0)](file:///c:/Projetos/atlas-invest/docs/legal/terms-of-service-draft.md):**  
   - Define a natureza do Atlas como ferramenta tecnológica e computacional de gestão patrimonial e cálculo tributário, sem prestação de consultoria, análise ou recomendação de investimentos (Art. 19 da Resolução CVM nº 19/2021).
   - Estabelece responsabilidade do investidor pela conferência de notas e extratos.
   - Status: Contém watermark obrigatório `NOT FOR PRODUCTION PUBLICATION - DRAFT FOR LEGAL COUNSEL REVIEW ONLY`.

2. **[Minuta da Política de Privacidade (v1.0.0)](file:///c:/Projetos/atlas-invest/docs/legal/privacy-policy-draft.md):**  
   - Descreve o ciclo de tratamento de dados pessoais e financeiros, categorias coletadas, finalidades e direitos do titular sob a LGPD (Lei nº 13.709/2018).
   - Status: Contém watermark obrigatório `NOT FOR PRODUCTION PUBLICATION - DRAFT FOR LEGAL COUNSEL REVIEW ONLY`.

3. **[Inventário de Tratamento de Dados Pessoais / ROPA](file:///c:/Projetos/atlas-invest/docs/legal/data-processing-inventory.md):**  
   - Registro das Operações de Tratamento de Dados Pessoais (Art. 37 da LGPD), mapeando finalidades, categorias, bases legais candidatas e operadores.

4. **[Matriz de Retenção e Descarte de Dados](file:///c:/Projetos/atlas-invest/docs/legal/data-retention-matrix.md):**  
   - Justificativa candidata de retenção fiscal de 5 anos para o ledger de transações e memória de cálculo de DARF com base no Código Tributário Nacional (Arts. 173 e 174 do CTN), fundamentando a recusa de deleção destrutiva sob o Art. 16, I da LGPD.

---

## 2. Decisões Mandatórias que Exigem Parecer Jurídico Humano

Para liberar o lançamento do Beta Externo do Project Atlas, o advogado/DPO responsável deve responder e aprovar formalmente as seguintes 13 questões:

### 2.1. Identificação e Estrutura Societária
1. **Identidade Formal do Controlador:**  
   - *Pergunta:* Qual a Razão Social, CNPJ e endereço da sede da pessoa jurídica controladora a constar no preâmbulo dos Termos de Uso e da Política de Privacidade?
   - *Status da Engenharia:* Marcado como placeholder `[RAZÃO SOCIAL / CNPJ DA ENTIDADE CONTROLADORA DO ATLAS - PENDENTE]`.

2. **Canal Oficial de Atendimento e DPO:**  
   - *Pergunta:* Quem será designado como Encarregado de Proteção de Dados (DPO) e qual o e-mail oficial para comunicações de titulares e ANPD (ex: `dpo@atlasinvest.com.br`)?
   - *Status da Engenharia:* Marcado como placeholder `[CONTATO DPO/ENCARREGADO DE DADOS - PENDENTE]`.

### 2.2. Bases Legais e Finalidades (Arts. 7º e 11 da LGPD)
3. **Bases Legais das Operações Principais:**  
   - *Pergunta:* O enquadramento candidato do processamento de carteiras em *Execução de Contrato* (Art. 7º, V) e das rotinas fiscais em *Cumprimento de Obrigação Legal* (Art. 7º, II) é considerado adequado e defensável perante a ANPD?
   - *Nota de Engenharia:* Trata-se de proposta candidata sujeita a validação jurídica.

4. **Base Legal da IA Contextual:**  
   - *Pergunta:* O processamento contextual de portfólio por modelos de linguagem (IA) deve operar estritamente sob *Consentimento Específico* (Art. 7º, I) ou pode ser enquadrado como funcionalidade acessória de *Execução de Contrato* (Art. 7º, V) com opção de recusa (opt-out)?
   - *Implementação Técnica:* O sistema implementou toggle de consentimento granular no Centro de Privacidade, pronto para qualquer uma das decisões.

5. **Base Legal para Notícias e Inteligência de Mercado:**  
   - *Pergunta:* A exibição de notícias públicas, cotações e fatos relevantes deve ser fundamentada em *Legítimo Interesse* (Art. 7º, IX) ou *Consentimento*?

6. **Relatório de Impacto à Proteção de Dados (RIPD / LIA):**  
   - *Pergunta:* É necessário formalizar Teste de Ponderação de Legítimo Interesse (LIA) ou RIPD prévio para o monitoramento técnico de telemetria, detecção de abusos em login e logs estruturados?

### 2.3. Retenção e Direitos do Titular (Arts. 16 e 18 da LGPD)
7. **Retenção Fiscal do Ledger Imutável:**  
   - *Pergunta:* A política do Atlas de **não permitir exclusão destrutiva** de transações do ledger (`transactions`), preservando-as por 5 anos civis com base no CTN (Arts. 173 e 174), encontra amparo cabal na exceção do Art. 16, inciso I da LGPD perante a ANPD?
   - *Implementação Técnica:* O software desativa a conta (`deactivated_at`), revoga sessões e preserva os registros contábeis para conformidade com a Receita Federal.

8. **Fluxo e Prazos de Atendimento a DSR:**  
   - *Pergunta:* O procedimento de exportação imediata em JSON (`GET /api/v1/privacy/export`) atende ao Art. 19, I (formato simplificado imediato) e o prazo de resposta administrativa de 15 dias atende ao Art. 19, II?

9. **Reconciliação Pós-Restauração de Backup:**  
   - *Pergunta:* O procedimento operacional documentado no runbook técnico para reaplicar revogações de consentimento e desativações em caso de restauração de desastre de backup é considerado suficiente para mitigar infração ao Art. 8º, § 5º da LGPD?

### 2.4. Transferência Internacional de Dados e Fornecedores
10. **Transferência Internacional via OpenAI:**  
    - *Pergunta:* O uso da API da OpenAI (com servidores situados nos Estados Unidos) exige cláusulas-padrão contratuais específicas ou consentimento prévio do titular sob o Art. 33, VIII da LGPD?

11. **Provedores de E-mail e Nuvem (Resend / AWS / Supabase):**  
    - *Pergunta:* Quais exigências contratuais de DPA (Data Processing Agreement) devem ser firmadas com os operadores de infraestrutura e e-mail transacional antes da entrada de usuários externos?

### 2.5. Minutas e Cláusulas Contratuais
12. **Validação das Cláusulas dos Termos de Uso:**  
    - *Pergunta:* As cláusulas de limitação de responsabilidade por oscilação de mercado, ausência de garantia de rentabilidade e eleição de foro estão em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/1990)?

13. **Autorização Formal para Remoção de Watermarks:**  
    - *Pergunta:* O parecer final autoriza formalmente a remoção do texto de aviso `NOT FOR PRODUCTION PUBLICATION` e a publicação dos documentos no ar?

---

## 3. Conclusão da Engenharia

Todos os mecanismos de software exigidos pela LGPD (registro de aceites com IP e User-Agent, histórico de versões, consentimentos granulares com revogação, formulário de DSR, exportação em formato aberto e desativação segura sem violação do ledger) estão **concluídos, testados e disponíveis no código**.

O lançamento público para investidores externos permanece **bloqueado (`EXTERNAL_BETA_LEGAL_BLOCKED`)** até que as questões acima sejam formalmente respondidas por advogado habilitado.

