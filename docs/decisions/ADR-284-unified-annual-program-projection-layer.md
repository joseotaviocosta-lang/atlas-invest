# ADR-284: Unified Annual IRPF Program as a Deterministic Projection Layer

**Status:** Accepted (Phase 4J.3)
**Data:** 2026-10-09

## Contexto

A conclusão do programa fiscal anual unificado (Fase 4J) exige uma formalização arquitetural clara sobre a hierarquia de autoridades, modelo de detecção de estados obsoletos (_stale-state_), garantias de isolamento de segurança e restrições operacionais.

## Decisão

1. **Camada de Projeção Determinística Pura:** O programa anual unificado (`@atlas/tax-engine` Phase 4J) opera estritamente como uma camada de agregação, consistência e projeção sobre os motores fiscais de autoridade (Fases 4H e 4I). É terminantemente proibido qualquer recálculo tributário de ganho de capital, dividendos, retenções ou alíquotas de alta renda dentro do 4J.
2. **Hierarquia de Autoridade Inviolável:**
   - A Fase 4J.1 (`UnifiedAnnualIrpfService`) é a **única autoridade** sobre o estado consolidado anual (`UnifiedAnnualIrpfState`).
   - A Fase 4J.2 (`UnifiedAnnualReviewPackageBuilder`) é a **única autoridade** sobre a projeção do pacote de revisão e exportações.
3. **Detecção de Staleness por Cadeia de Fingerprints:** O sistema estabelece frescor e rastreabilidade por comparação puramente funcional de hashes SHA-256 (`annualFingerprint` e `packageFingerprint`), sem necessidade de tabelas de histórico de exportação no banco de dados.
4. **Não-Otimismo de Status:** O status do pacote de revisão nunca pode ser mais otimista que o status consolidado 4J.1 (`package.status === annualState.overallStatus`).
5. **Apoio Não-Oficial:** Todos os artefatos de saída (telas, JSON, CSV) constituem relatórios de apoio informativo. O Atlas não realiza transmissão DIRPF, submissão à RFB, integração Gov.br, nem emissão de DARF anual.
6. **Banco de Dados Canônico:** A persistência oficial do projeto é fixada em **PostgreSQL 16.x** com 18 migrations canônicas, sendo vedado o uso de `prisma db push`.

## Consequências

- O ciclo de vida do programa anual unificado (4J.1, 4J.2, 4J.3) atinge fechamento definitivo com 100% de compatibilidade regressiva.
- Elimina-se qualquer risco de divergência matemática entre os módulos individuais e o pacote anual consolidado.
- Os contratos `docs/contracts/unified-annual-irpf-program-v1.md`, `unified-annual-irpf-orchestration-v1.md` e `unified-annual-review-package-v1.md` permanecem as autoridades formais do monorepo.
