import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';
import { ConfirmPortfolioImportUseCase } from '../../apps/api/src/application/imports/confirm-portfolio-import.use-case';

/**
 * Phase R1 hotfix — STEP 5/21 confirm defense in depth.
 *
 * Even with an explicit malicious/stale `import` decision, the backend must
 * refuse to persist a movement candidate whose post-gate classification is
 * not READY (UNSUPPORTED loan leg here). Proves ledger delta 0 for the
 * blocked row through the real confirm path (mocked repos, no DB).
 */
describe('Confirm defense: forced import of a blocked movement row persists nothing', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Confirm defense portfolio',
    baseCurrency: 'BRL',
  });

  async function movementBuffer(): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.addRow([
      'Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição',
      'Quantidade', 'Preço unitário', 'Valor da Operação',
    ]);
    ws.addRow(['Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', 'XP INVESTIMENTOS CCTVM S/A.', '30', '-', '-']);
    ws.addRow(['Debito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    ws.addRow(['Credito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  let previewUseCase: PreviewPortfolioImportUseCase;
  let confirmUseCase: ConfirmPortfolioImportUseCase;
  let executeMany: ReturnType<typeof vi.fn>;

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
    const runService = {
      startRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      recordPreview: vi.fn().mockResolvedValue({ id: 'run-1' }),
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
    executeMany = vi.fn().mockResolvedValue([]);
    const createTransactionUseCase = { execute: vi.fn(), executeMany };
    confirmUseCase = new ConfirmPortfolioImportUseCase(
      previewUseCase,
      createTransactionUseCase as never,
      runService as never,
    );
  });

  it('rejects a forced import of an UNSUPPORTED loan leg with zero ledger writes', async () => {
    const content = await movementBuffer();
    const preview = await previewUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_NEGOTIATION_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content,
    });

    const blocked = preview.candidates.filter((c) => c.status === 'UNSUPPORTED');
    expect(blocked.length).toBeGreaterThan(0);
    const blockedRow = blocked[0]!.rowNumber;
    const readyRows = preview.candidates
      .filter((c) => c.status === 'READY')
      .map((c) => ({ rowNumber: c.rowNumber, action: 'skip' as const }));

    const receipt = await confirmUseCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_NEGOTIATION_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content,
      decisions: [...readyRows, { rowNumber: blockedRow, action: 'import' }],
    });

    expect(receipt.created).toBe(0);
    expect(receipt.failed.some((f) => f.rowNumber === blockedRow)).toBe(true);
    // The writer was never reached: ledger delta is structurally 0.
    expect(executeMany).not.toHaveBeenCalled();
  });
});
