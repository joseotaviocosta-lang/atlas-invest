# ADR-208: Deterministic Offline AI Evaluation Harness

## Status

Aceito (Fase 3V)

## Contexto

Garantir a integridade contínua e a não regressão da esteira de IA é indispensável. Abordagens populares de avaliação baseadas em "LLM-as-a-judge" introduzem estocasticidade, custos de rede, fragilidade de execução em esteiras de integração contínua (CI) e falta de reprodutibilidade exata.

## Decisão

1. **Zero Juiz Modelo (No LLM Judge):**
   - É terminantemente proibido utilizar chamadas a modelos para avaliar a qualidade ou exatidão das respostas do sistema.
   - Todas as verificações são asserções lógicas puras em TypeScript (checagem de schemas, validação de fatos, formatação de decimais, status da esteira).
2. **Zero Chamadas Live em CI:**
   - A esteira de avaliação roda offline utilizando fixtures canônicas e o `FakeAiProvider`.
3. **Casos Canônicos Dourados (`AI-EVAL-001` a `AI-EVAL-016`):**
   - A suíte cobre os 16 cenários críticos do domínio (performance, benchmark, risco, cenários de estresse, qualidade de dados, isolamento cambial multimoeda, recusas de recomendação, previsão, cálculo e imposto, injeção de prompt, envenenamento de histórico, grounding desatualizado, alucinações, falhas de provedor e aborto de stream).
4. **Zero Notas de Qualidade Numéricas:**
   - O harness não gera notas arbitrárias (ex: "85/100" ou "confiança 0.95"). Cada invariante recebe estritamente a classificação binária PASS ou FAIL.

## Consequências

- Execução instantânea e 100% determinística em CI (`pnpm test:ai-evals`).
- Garantia de que nenhuma regressão semântica ou matemática passe despercebida.
