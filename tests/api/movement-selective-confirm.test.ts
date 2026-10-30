import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';
import { ConfirmPortfolioImportUseCase } from '../../apps/api/src/application/imports/confirm-portfolio-import.use-case';

/**
 * Selective READY confirmation hotfix — server-side contract (mocked, no DB).
 *
 * 1 BONUS (READY) + 1 unpaired transfer (NEEDS_REVIEW) + 1 loan pair
 * (2× UNSUPPORTED): confirmation persists exactly the READY row, flags the
 * review row as pending (never user-ignored), ignores unsupported rows, and
 * records the run as PARTIAL. Synthetic file only.
 */
describe('Selective confirmation: READY persists, REVIEW stays pending, run is PARTIAL', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Selective confirm portfolio',
    baseCurrency: 'BRL',
  });

  async function movementBuffer(): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.addRow([
      'Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição',
      'Quantidade', 'Preço unitário', 'Valor da Operação',
    ]);
    const inst = 'XP INVESTIMENTOS CCTVM S/A.';
    ws.addRow(['Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', inst, '30', '-', '-']);
    ws.addRow(['Credito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', inst, '400', '-', '-']);
    ws.addRow(['Debito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', inst, '400', '-', '-']);
    ws.addRow(['Credito', '15/06/2026', 'Transferência', 'PETR4 - PETROBRAS', inst, '50', '-', '-']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  let previewUseCase: PreviewPortfolioImportUseCase;
  let confirmUseCase: ConfirmPortfolioImportUseCase;
  let executeMany: ReturnType<typeof vi.fn>;
  let recordConfirmation: ReturnType<typeof vi.fn>;
  let linkTransactions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const portfolioRepository = { findById: vi.fn().mockResolvedValue(samplePortfolio) };
    const accountRepository = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn().mockResolvedValue([{ id: accountId, name: 'XP', portfolioId }]),
    };
    const assetRepository = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((asset: { ticker: string }) =>
        Promise.resolve({ ...asset, id: `asset-${(asset.ticker as string).toLowerCase()}` }),
      ),
    };
    const transactionRepository = { findByPortfolioId: vi.fn().mockResolvedValue([]) };
    const institutionRepository = { list: vi.fn().mockResolvedValue([]) };
    const clock = { today: () => '2026-10-29' };
    recordConfirmation = vi.fn().mockResolvedValue({ id: 'run-1' });
    linkTransactions = vi.fn().mockResolvedValue({ id: 'run-1' });
    const runService = {
      startRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      recordPreview: vi.fn().mockResolvedValue({ id: 'run-1' }),
      getRun: vi.fn().mockResolvedValue({ status: 'AWAITING_REVIEW' }),
      recordConfirmation,
      linkTransactions,
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

  it('persists only READY, flags REVIEW as pending, records PARTIAL', async () => {
    const content = await movementBuffer();
    const command = {
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content,
      runId: '11111111-1111-4111-8111-111111111112',
    };
    const receipt = await confirmUseCase.execute({ ...command, decisions: [] });

    // Exactly the BONUS row persisted, quantity-only, no fabricated cost.
    expect(receipt.created).toBe(1);
    expect(executeMany).toHaveBeenCalledTimes(1);
    const persisted = executeMany.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ type: 'BONUS', quantity: '30' });
    expect(persisted[0]).not.toHaveProperty('unitPrice');
    expect(persisted[0]).not.toHaveProperty('amount');

    // Review row pending (never user-ignored); loan legs not pending, not persisted.
    const pending = receipt.failed.filter((f) => f.kind === 'pending-review');
    expect(pending).toHaveLength(1);
    expect(receipt.pendingReviewCount).toBe(1);
    const unsupported = receipt.failed.filter((f) => f.kind === 'unsupported');
    expect(unsupported.length).toBeGreaterThanOrEqual(2);
    expect(receipt.unsupportedCount).toBe(unsupported.length);
    // No technical errors: deliberate non-imports are not errors.
    expect(receipt.failed.some((f) => f.kind === 'error')).toBe(false);
    expect(receipt.errorCount).toBe(0);

    // Run records PARTIAL with reconciliation intact.
    expect(recordConfirmation).toHaveBeenCalledTimes(1);
    const recordArg = recordConfirmation.mock.calls[0]![0] as Record<string, unknown>;
    expect(recordArg).toMatchObject({ status: 'PARTIAL', confirmed: 1, partial: true });
    expect(linkTransactions).toHaveBeenCalledTimes(1);
  });

  it('records COMPLETED when nothing is left pending', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.addRow([
      'Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição',
      'Quantidade', 'Preço unitário', 'Valor da Operação',
    ]);
    ws.addRow(['Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', 'XP INVESTIMENTOS CCTVM S/A.', '30', '-', '-']);
    const content = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const receipt = await confirmUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'bonus-only.xlsx',
      content,
      runId: '11111111-1111-4111-8111-111111111113',
      decisions: [],
    });
    expect(receipt.created).toBe(1);
    expect(receipt.failed).toHaveLength(0);
    const recordArg = recordConfirmation.mock.calls[0]![0] as Record<string, unknown>;
    expect(recordArg).toMatchObject({ status: 'COMPLETED', partial: false });
  });
});
