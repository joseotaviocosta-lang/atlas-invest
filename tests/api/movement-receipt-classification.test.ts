import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';
import { ConfirmPortfolioImportUseCase } from '../../apps/api/src/application/imports/confirm-portfolio-import.use-case';

/**
 * Partial receipt classification hotfix — server-side outcome matrix.
 *
 * Only deliberate non-imports must never count as technical errors:
 * pending-review and unsupported entries contribute to their own counts,
 * never to errorCount. Synthetic files only (mocked repos, no DB).
 */
describe('Partial receipt outcome classification', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Receipt matrix portfolio',
    baseCurrency: 'BRL',
  });

  const INST = 'XP INVESTIMENTOS CCTVM S/A.';
  const HEADER = [
    'Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição',
    'Quantidade', 'Preço unitário', 'Valor da Operação',
  ];

  let previewUseCase: PreviewPortfolioImportUseCase;
  let confirmUseCase: ConfirmPortfolioImportUseCase;
  let executeMany: ReturnType<typeof vi.fn>;
  let recordConfirmation: ReturnType<typeof vi.fn>;
  let assetTickers: string[];

  beforeEach(() => {
    assetTickers = [];
    const portfolioRepository = { findById: vi.fn().mockResolvedValue(samplePortfolio) };
    const accountRepository = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn().mockResolvedValue([{ id: accountId, name: 'XP', portfolioId }]),
    };
    const assetRepository = {
      list: vi.fn().mockImplementation(() =>
        Promise.resolve(
          assetTickers.map((ticker) => ({ id: `asset-${ticker.toLowerCase()}`, ticker })),
        ),
      ),
      create: vi.fn().mockImplementation((asset: { ticker: string }) =>
        Promise.resolve({ ...asset, id: `asset-${(asset.ticker as string).toLowerCase()}` }),
      ),
    };
    const transactionRepository = { findByPortfolioId: vi.fn().mockResolvedValue([]) };
    const institutionRepository = { list: vi.fn().mockResolvedValue([]) };
    const clock = { today: () => '2026-10-29' };
    recordConfirmation = vi.fn().mockResolvedValue({ id: 'run-1' });
    const runService = {
      startRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      recordPreview: vi.fn().mockResolvedValue({ id: 'run-1' }),
      getRun: vi.fn().mockResolvedValue({ status: 'AWAITING_REVIEW' }),
      recordConfirmation,
      linkTransactions: vi.fn().mockResolvedValue({ id: 'run-1' }),
    };
    previewUseCase = new PreviewPortfolioImportUseCase(
      portfolioRepository as never,
      accountRepository as never,
      assetRepository as never,
      transactionRepository as never,
      institutionRepository as never,
      clock as never,
      runService as never,
    );
    executeMany = vi.fn().mockImplementation((commands: Array<{ id?: string }>) =>
      Promise.resolve(commands.map((c, i) => ({ ...c, id: `tx-${i}` }))),
    );
    confirmUseCase = new ConfirmPortfolioImportUseCase(
      previewUseCase,
      { execute: vi.fn(), executeMany } as never,
      runService as never,
    );
  });

  function track(...tickers: string[]): void {
    assetTickers.push(...tickers);
  }

  async function toContent(rows: string[][]): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.addRow(HEADER);
    for (const row of rows) ws.addRow(row);
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  }

  const bonus = (ticker: string, date: string, qty: string): string[] =>
    ['Credito', date, 'Bonificação em Ativos', `${ticker} - TESTE`, INST, qty, '-', '-'];
  const transferOut = (ticker: string, date: string, qty: string, label = 'Transferência'): string[] =>
    ['Debito', date, label, `${ticker} - TESTE`, INST, qty, '-', '-'];
  const transferIn = (ticker: string, date: string, qty: string, label = 'Transferência'): string[] =>
    ['Credito', date, label, `${ticker} - TESTE`, INST, qty, '-', '-'];

  it('8 created + 45 pending + 127 unsupported + 0 error → errorCount 0, run PARTIAL', async () => {
    const rows: string[][] = [];
    const tickers: string[] = [];
    // 2 standalone bonuses + 3 fraction sets (bonus + paired debit + auction) = 8 READY.
    const bonusTickers = ['BON1', 'BON2'];
    tickers.push(...bonusTickers);
    bonusTickers.forEach((t, i) => rows.push(bonus(t, '2025-12-29', `${30 + i}`)));
    const fracTickers = ['FRA1', 'FRA2', 'FRA3'];
    tickers.push(...fracTickers);
    fracTickers.forEach((t) => {
      rows.push(bonus(t, '2025-12-22', '43.76'));
      rows.push(['Debito', '2026-01-27', 'Fração em Ativos', `${t} - TESTE`, INST, '0.76', '-', '-']);
      rows.push(['Credito', '2026-03-13', 'Leilão de Fração', `${t} - TESTE`, INST, '0.76', '8.06', '6.16']);
    });
    // 45 unpaired transfers → NEEDS_REVIEW (distinct tickers/qtys avoid pairing).
    const singleTickers = Array.from({ length: 45 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);
    tickers.push(...singleTickers);
    singleTickers.forEach((t, i) => rows.push(transferIn(t, '2026-06-15', `${1000 + i}`)));
    // 127 unsupported: 62 mirrored pairs (124) + 1 mirrored triple (3).
    for (let i = 1; i <= 62; i++) {
      const t = `P${String(i).padStart(2, '0')}`;
      tickers.push(t);
      rows.push(transferOut(t, '2026-10-08', `${500 + i}`));
      rows.push(transferIn(t, '2026-10-08', `${500 + i}`));
    }
    tickers.push('TRP');
    rows.push(transferOut('TRP', '2026-10-08', '999'));
    rows.push(transferOut('TRP', '2026-10-08', '999'));
    rows.push(transferIn('TRP', '2026-10-08', '999'));
    track(...tickers);

    const receipt = await confirmUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'matrix-8-45-127.xlsx',
      content: await toContent(rows),
      runId: '11111111-1111-4111-8111-111111111121',
      decisions: [],
    });

    expect(receipt.created).toBe(8);
    expect(receipt.pendingReviewCount).toBe(45);
    expect(receipt.unsupportedCount).toBe(127);
    expect(receipt.errorCount).toBe(0);
    expect(executeMany).toHaveBeenCalledTimes(1);
    expect((executeMany.mock.calls[0]![0] as unknown[])).toHaveLength(8);
    const recordArg = recordConfirmation.mock.calls[0]![0] as Record<string, unknown>;
    expect(recordArg).toMatchObject({ status: 'PARTIAL', confirmed: 8, partial: true });
  });

  it('malformed row counts as the single error (created + error, no confusion)', async () => {
    // A row with an impossible civil date is INVALID: actionable file error.
    // (Movement dateless rows route to notices; the generic CSV path yields
    // INVALID candidates, exercising the same receipt kind model.)
    const content = [
      'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
      '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Principal;NEG-1',
      '31/02/2026;PETR4;COMPRA;10;38,50;0;BRL;XP;Principal;NEG-2',
    ].join('\n');
    track('PETR4');
    const receipt = await confirmUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'GENERIC_CSV',
      fileName: 'matrix-error.csv',
      content,
      defaultAccountId: accountId,
      runId: '11111111-1111-4111-8111-111111111122',
      decisions: [],
    });
    expect(receipt.created).toBe(1);
    expect(receipt.errorCount).toBe(1);
    expect(receipt.pendingReviewCount).toBe(0);
    expect(receipt.unsupportedCount).toBe(0);
    expect(receipt.failed.some((f) => f.kind === 'error')).toBe(true);
    // PARTIAL != ERROR: errors alone do not mark the run partial.
    const recordArg = recordConfirmation.mock.calls[0]![0] as Record<string, unknown>;
    expect(recordArg).toMatchObject({ status: 'COMPLETED', partial: false });
  });

  it('only-unsupported file is not a technical failure', async () => {    const rows = [
      transferOut('HYPE3', '2026-10-08', '400'),
      transferIn('HYPE3', '2026-10-08', '400'),
    ];
    track('HYPE3');
    const receipt = await confirmUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'unsupported-only.xlsx',
      content: await toContent(rows),
      runId: '11111111-1111-4111-8111-111111111123',
      decisions: [],
    });
    expect(receipt.created).toBe(0);
    expect(receipt.errorCount).toBe(0);
    expect(receipt.unsupportedCount).toBe(2);
    expect(executeMany).not.toHaveBeenCalled();
  });
});
