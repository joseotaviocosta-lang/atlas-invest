import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';

/**
 * Phase R1 — movement preview end-to-end with mocked repositories (no DB).
 * Synthetic movement workbook only; real B3 files never enter fixtures.
 */
describe('PreviewPortfolioImportUseCase with B3_MOVEMENT_XLSX (R1)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Carteira Real (test double)',
    baseCurrency: 'BRL',
  });

  async function movementBuffer(): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.addRow([
      'Entrada/Saída',
      'Data',
      'Movimentação',
      'Produto',
      'Instituição',
      'Quantidade',
      'Preço unitário',
      'Valor da Operação',
    ]);
    ws.addRow(['Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', 'XP INVESTIMENTOS CCTVM S/A.', '30', '-', '-']);
    ws.addRow(['Credito', '23/10/2026', 'Rendimento', 'SNAG11 - SUNO AGRO', 'XP INVESTIMENTOS CCTVM S/A.', '1846', '0,12', '221,52']);
    ws.addRow(['Debito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    ws.addRow(['Credito', '08/10/2026', 'Transferência', 'HYPE3 - HYPERA', 'XP INVESTIMENTOS CCTVM S/A.', '400', '-', '-']);
    ws.addRow(['Credito', '07/08/2026', 'Atualização', 'COGN3 - COGNA', 'XP INVESTIMENTOS CCTVM S/A.', '330', '-', '-']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  let useCase: PreviewPortfolioImportUseCase;
  let transactionRepository: { findByPortfolioId: ReturnType<typeof vi.fn> };

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
    transactionRepository = { findByPortfolioId: vi.fn().mockResolvedValue([]) };
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

  it('previews bonus candidates, transfer gates and notices without writing the ledger', async () => {
    const preview = await useCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content: await movementBuffer(),
    });

    expect(preview.sourceType).toBe('B3_MOVEMENT_XLSX');
    // 1 BONUS candidate + 2 transfer legs = 3 candidates; 2 notices (cash + marker).
    expect(preview.candidates).toHaveLength(3);
    expect(preview.notices).toHaveLength(2);

    const bonus = preview.candidates.find((c) => c.operation === 'BONUS')!;
    expect(bonus).toBeDefined();
    expect(bonus.ticker).toBe('COGN3');
    expect(bonus.quantity).toBe('30');
    expect(bonus.status).toBe('READY');

    // Mirrored loan-roll pair is neutralized by gates (never READY).
    const legs = preview.candidates.filter((c) => c.ticker === 'HYPE3');
    expect(legs).toHaveLength(2);
    expect(legs.every((c) => c.status === 'UNSUPPORTED')).toBe(true);
    expect(
      legs.every((c) => c.issues.some((i) => i.code === 'LOAN_CUSTODY_STATE')),
    ).toBe(true);

    const groups = preview.notices.map((n) => n.group).sort();
    expect(groups).toEqual(['CASH_ONLY', 'INFORMATIONAL']);

    // Notices are display-only metadata.
    expect(preview.summary.totalRows).toBe(3);

    // Zero ledger writes: the transaction repository has no create path here,
    // and preview must never call one.
    expect(transactionRepository.findByPortfolioId).toHaveBeenCalled();
    expect('create' in transactionRepository).toBe(false);
  });

  it('rejects unknown source types before parsing', async () => {
    await expect(
      useCase.execute({
        portfolioId,
        userId,
        sourceType: 'B3_POSITION_XLSX' as never,
        fileName: 'posicao.xlsx',
        content: await movementBuffer(),
      }),
    ).rejects.toThrow();
  });
});
