import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';

/**
 * Phase R1 hotfix — BLOCKER B1 regression.
 *
 * Declared sourceType (client filename sniffing) must NEVER disable movement
 * safety gates. When the detected layout is B3_MOVEMENT, gates apply even if
 * the client declared B3_NEGOTIATION_XLSX.
 *
 * Fails before the fix (loan-roll transfers stay READY); passes after.
 */
describe('B1 regression: declared NEGOTIATION + detected MOVEMENT still gates', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Gate test portfolio',
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
    // Mirrored loan-roll pair: must never be READY (LOAN_CUSTODY_STATE).
    ws.addRow(['Debito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    ws.addRow(['Credito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  let useCase: PreviewPortfolioImportUseCase;

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
    useCase = new PreviewPortfolioImportUseCase(
      portfolioRepository as never,
      accountRepository as never,
      assetRepository as never,
      transactionRepository as never,
      institutionRepository as never,
      clock as never,
      runService as never,
    );
  });

  it('applies movement gates when declared=NEGOTIATION but detected=MOVEMENT', async () => {
    const preview = await useCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_NEGOTIATION_XLSX',
      fileName: 'movimentacao-2026-10-29-11-47-54.xlsx',
      content: await movementBuffer(),
    });

    // The movement parser ran (content sniffing), so gates must also run.
    const bonus = preview.candidates.filter((c) => c.operation === 'BONUS');
    expect(bonus).toHaveLength(1);
    expect(bonus[0]!.status).toBe('READY');

    const legs = preview.candidates.filter((c) => c.ticker === 'HYPE3');
    expect(legs).toHaveLength(2);
    // BLOCKER assertion: loan-roll legs must NOT stay READY.
    expect(legs.every((c) => c.status !== 'READY')).toBe(true);
    expect(legs.every((c) => c.status === 'UNSUPPORTED')).toBe(true);
    expect(
      legs.every((c) => c.issues.some((i) => i.code === 'LOAN_CUSTODY_STATE')),
    ).toBe(true);

    // The response exposes the detected layout for honest UI labeling.
    expect((preview as { detectedLayout?: string }).detectedLayout).toBe('B3_MOVEMENT');
  });
});
