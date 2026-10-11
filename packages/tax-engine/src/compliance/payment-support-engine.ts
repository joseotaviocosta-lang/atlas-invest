/**
 * @atlas/tax-engine — Phase 4K.2 DARF Payment Support & Settlement Evidence Foundation.
 *
 * Pure, deterministic, zero-I/O projection engine for DARF payment support and
 * reconciliation with user-reported payment evidence.
 *
 * INVARIANTS:
 * - NEVER computes tax or DARF amounts.
 * - NEVER computes legal deadlines or penalties/interest.
 * - Consumes authoritative upstream state.
 * - Non-payable obligations never produce READY payment support.
 * - Produces deep-frozen read models.
 */

import { TaxComplianceObligation } from './compliance-types';
import {
  TaxPaymentSupport,
  TaxPaymentSupportStatus,
  TaxPaymentReconciliationStatus,
  TaxPaymentEvidenceRecord,
  TaxPaymentEvidenceSummary,
  TAX_PAYMENT_SUPPORT_DISCLAIMER,
} from './payment-support-types';

export interface DeriveTaxPaymentSupportInput {
  readonly obligation: TaxComplianceObligation;
  readonly evidenceHistory?: readonly TaxPaymentEvidenceRecord[];
  readonly todayCivilDate?: string;
}

export function deriveTaxPaymentSupport(
  input: DeriveTaxPaymentSupportInput,
): TaxPaymentSupport | null {
  const { obligation, evidenceHistory = [], todayCivilDate } = input;

  // 1. Ineligibility checks:
  // Only monthly payable tax obligations are supported for DARF payment support
  if (obligation.kind !== 'MONTHLY_TAX_PAYMENT') {
    return null;
  }

  // Must have a positive payable amount (null or "0" or "0.00" or negative is not payable)
  if (
    obligation.amount === null ||
    obligation.amount === '0' ||
    obligation.amount === '0.00' ||
    obligation.amount.startsWith('-')
  ) {
    return null;
  }

  // Must have a valid due date
  if (!obligation.dueDate) {
    return null;
  }

  // 2. Identify latest evidence for this obligationKey
  const matchingEvidences = evidenceHistory
    .filter((e) => e.obligationKey === obligation.obligationKey)
    .slice()
    .sort((a, b) => {
      if (b.revision !== a.revision) {
        return b.revision - a.revision;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const latest = matchingEvidences[0] ?? null;

  // 3. Determine reconciliation status & stale state
  let reconciliationStatus: TaxPaymentReconciliationStatus = 'NO_EVIDENCE';
  let supportStatus: TaxPaymentSupportStatus = 'READY';
  let isStale = false;

  if (obligation.status === 'SUPERSEDED') {
    supportStatus = 'STALE';
  }

  let latestEvidenceSummary: TaxPaymentEvidenceSummary | null = null;

  if (latest) {
    // Check if evidence was recorded against an older/different source fingerprint
    if (latest.sourceFingerprint !== obligation.sourceFingerprint) {
      reconciliationStatus = 'STALE_SOURCE';
      supportStatus = 'STALE';
      isStale = true;
    } else {
      // Fingerprint matches: check if amount, revenue code, and period match
      const amountMatches = latest.amountReported === obligation.amount;
      const periodMatches = latest.referencePeriod === obligation.period;
      const expectedRevenueCode = (obligation.metadata?.revenueCode as string | undefined) ?? null;
      const revenueCodeMatches =
        !latest.revenueCodeReported ||
        !expectedRevenueCode ||
        latest.revenueCodeReported === expectedRevenueCode;

      if (amountMatches && periodMatches && revenueCodeMatches) {
        reconciliationStatus = 'USER_REPORTED_MATCH';
        supportStatus = obligation.status === 'SUPERSEDED' ? 'STALE' : 'READY';
      } else {
        reconciliationStatus = 'USER_REPORTED_MISMATCH';
        supportStatus = 'REQUIRES_REVIEW';
      }
    }

    latestEvidenceSummary = {
      id: latest.id,
      revision: latest.revision,
      paymentDate: latest.paymentDate,
      amountReported: latest.amountReported,
      revenueCodeReported: latest.revenueCodeReported,
      referencePeriod: latest.referencePeriod,
      externalReference: latest.externalReference,
      verificationStatus: latest.verificationStatus,
      reconciliationStatus,
      isStale,
      note: latest.note,
      createdAt: latest.createdAt,
    };
  }

  // 4. Instructions
  const revenueCode = (obligation.metadata?.revenueCode as string | undefined) ?? null;
  const displayRevenueCode = revenueCode ?? '6015';

  const instructions: readonly string[] = Object.freeze([
    'Acesse o canal de pagamentos da sua instituição financeira (Internet Banking ou App) ou o Sicalcweb da Receita Federal.',
    `Informe o Código de Receita: ${displayRevenueCode}.`,
    `Informe o Período de Apuração: ${obligation.period}.`,
    `Informe a Data de Vencimento: ${obligation.dueDate}.`,
    `Informe o Valor Principal: R$ ${obligation.amount}.`,
    'Após realizar o pagamento externo, registre o comprovante no Atlas para manter seu histórico de conformidade organizado.',
  ]);

  const sourceReferences = Object.freeze([
    { label: 'Chave Canônica', ref: obligation.obligationKey },
    { label: 'Módulo de Origem', ref: obligation.sourceModule },
    { label: 'Referência de Origem', ref: obligation.sourceRef },
    { label: 'Fingerprint de Origem', ref: obligation.sourceFingerprint.substring(0, 16) },
  ]);

  const isOverdue = todayCivilDate ? todayCivilDate > obligation.dueDate : obligation.isOverdue;

  const result: TaxPaymentSupport = {
    obligationKey: obligation.obligationKey,
    sourceFingerprint: obligation.sourceFingerprint,
    taxSubjectId: obligation.taxSubjectId,
    calendarYear: obligation.calendarYear,
    period: obligation.period,
    kind: obligation.kind,
    taxCategory: (obligation.metadata?.bucket as string | undefined) ?? 'VARIABLE_INCOME',
    revenueCode,
    amount: obligation.amount,
    currency: obligation.currency ?? 'BRL',
    dueDate: obligation.dueDate,
    supportStatus,
    reconciliationStatus,
    paymentInstructions: instructions,
    sourceReferences,
    latestEvidence: latestEvidenceSummary ? Object.freeze(latestEvidenceSummary) : null,
    isOverdue,
    disclaimer: TAX_PAYMENT_SUPPORT_DISCLAIMER,
    version: '4K.2',
  };

  return Object.freeze(result);
}

import { escapeCsvCell } from '../annual-irpf/csv-escape';

export function serializeTaxPaymentSupportToJson(support: TaxPaymentSupport): string {
  return JSON.stringify(support);
}

export function exportTaxPaymentSupportToCsv(support: TaxPaymentSupport): string {
  const lines: string[] = [
    `# ${TAX_PAYMENT_SUPPORT_DISCLAIMER}`,
    '# PROJECT ATLAS - GUIA DE APOIO OPERACIONAL AO PAGAMENTO DE DARF',
    `# Chave da Obrigacao: ${support.obligationKey}`,
    `# Periodo: ${support.period}`,
    `# Vencimento: ${support.dueDate}`,
    `# Status do Suporte: ${support.supportStatus}`,
    `# Reconciliacao: ${support.reconciliationStatus}`,
    `# Codigo de Receita: ${support.revenueCode ?? '6015'}`,
    `# Valor Principal: ${support.amount}`,
    `# Fingerprint de Origem: ${support.sourceFingerprint}`,
    '',
    'SECAO A - DADOS DA OBRIGACAO',
    'Campo;Valor',
    `Chave da Obrigacao;${escapeCsvCell(support.obligationKey)}`,
    `Periodo de Apuracao;${escapeCsvCell(support.period)}`,
    `Data de Vencimento;${escapeCsvCell(support.dueDate)}`,
    `Valor Principal (BRL);${escapeCsvCell(support.amount)}`,
    `Codigo de Receita;${escapeCsvCell(support.revenueCode ?? '6015')}`,
    `Status do Suporte;${escapeCsvCell(support.supportStatus)}`,
    `Reconciliacao;${escapeCsvCell(support.reconciliationStatus)}`,
    `Vencida;${support.isOverdue ? 'SIM' : 'NAO'}`,
    '',
    'SECAO B - INSTRUCOES OPERACIONAIS',
    'Passo;Instrucao',
  ];

  support.paymentInstructions.forEach((inst, idx) => {
    lines.push(`${idx + 1};${escapeCsvCell(inst)}`);
  });

  lines.push('', 'SECAO C - COMPROVANTE DECLARADO PELO USUARIO', 'Campo;Valor');
  if (support.latestEvidence) {
    const ev = support.latestEvidence;
    lines.push(
      `ID do Comprovante;${escapeCsvCell(ev.id)}`,
      `Revisao;${ev.revision}`,
      `Data do Pagamento Informada;${escapeCsvCell(ev.paymentDate)}`,
      `Valor Informado (BRL);${escapeCsvCell(ev.amountReported)}`,
      `Codigo de Receita Informado;${escapeCsvCell(ev.revenueCodeReported ?? '')}`,
      `Periodo Informado;${escapeCsvCell(ev.referencePeriod)}`,
      `Referencia Externa / Autenticacao;${escapeCsvCell(ev.externalReference ?? '')}`,
      `Status de Verificacao;${escapeCsvCell(ev.verificationStatus)}`,
      `Obsoleto;${ev.isStale ? 'SIM' : 'NAO'}`,
      `Observacao;${escapeCsvCell(ev.note ?? '')}`,
      `Registrado em;${escapeCsvCell(ev.createdAt)}`,
    );
  } else {
    lines.push('Status;Nenhum comprovante registrado pelo usuario');
  }

  lines.push('', 'SECAO D - AVISO LEGAL E LIMITACOES DE RESPONSABILIDADE', 'Texto');
  lines.push(`${escapeCsvCell(support.disclaimer)}`);

  return lines.join('\r\n') + '\r\n';
}
