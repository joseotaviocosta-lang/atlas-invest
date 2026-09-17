# ADR-069: Release Candidate Compatibility Policy

## Status

Accepted

## Context

Com o lançamento do Portfolio Engine na versão `1.0.0-rc.1`, estabelece-se a transição da fase alfa experimental para um estágio estável de pré-lançamento para integração. É fundamental formalizar as regras de compatibilidade semântica, políticas de depreciação e governança de mudanças de contrato para o ciclo de vida do motor.

## Decision

1. **Versionamento Semântico e Release Candidate**:
   - O pacote `@atlas/portfolio-engine` adota estritamente o Versionamento Semântico (SemVer).
   - A versão `1.0.0-rc.1` representa o congelamento formal de contratos. Quaisquer ajustes antes da versão final `1.0.0` devem limitar-se a correções de bugs, hardening de invariantes e performance, mantendo compatibilidade retroativa com os contratos congelados.

2. **Terminologia Formal e Declaração de Maturidade**:
   - É terminantemente vedado o uso de jargões promocionais ou reivindicações como "production certified" ou "production proven".
   - A nomenclatura oficial é "Portfolio Engine 1.0 Release Candidate" ou "pronto para integração de MVP da carteira".

3. **Governança de Mudanças Contratuais**:
   - **Non-Breaking Changes**: Adição de campos opcionais em read models ou metadados é permitida e resulta em incremento de versão menor/patch.
   - **Breaking Changes**: Remoção de campos, alteração de tipos existentes, mudança na ordem canônica de ordenação ou modificação na semântica contábil de transações exigirão nova versão majoritária do motor (ex: `2.0.0`).

4. **Ciclo de Depreciação**:
   - Qualquer funcionalidade marcada para depreciação futura deve emitir avisos em documentação e permanecer suportada por no mínimo uma versão maior ou período de transição estabelecido formalmente via ADR.

## Consequences

- **Positivas:**
  - Clareza para times de desenvolvimento e segurança sobre a estabilidade das APIs.
  - Alinhamento rigoroso com as melhores práticas de governança de software financeiro.
- **Negativas:**
  - Disciplina adicional na revisão de PRs para impedir quebras acidentais de contrato.
