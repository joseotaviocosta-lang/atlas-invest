import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { Portfolio } from '@atlas/domain';
import { PreviewPortfolioImportUseCase } from '../../apps/api/src/application/imports/preview-portfolio-import.use-case';

/**
 * Ticker successor import resolution (mocked repos, no DB).
 *
 * MBRF3 movement rows resolve to the canonical MRFG3 asset through the
 * explicit successor mapping (no new asset rows, no fuzzy matching), while
 * movement safety gates still apply unchanged: loan-roll legs stay
 * UNSUPPORTED and never become READY.
 */
describe('Import successor resolution (MBRF3 -> MRFG3)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountId = 'd0000000-0000-4000-8000-000000000001';
  const mrfg3AssetId = 'e0000000-0000-4000-8000-000000000099';

  const samplePortfolio = Portfolio.create({
    id: portfolioId,
    userId,
    name: 'Successor test portfolio',
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
    ws.addRow(['Debito', '08/10/2026', 'Transferência', 'MBRF3 - MARFRIG', inst, '200', '-', '-']);
    ws.addRow(['Credito', '08/10/2026', 'Transferência', 'MBRF3 - MARFRIG', inst, '200', '-', '-']);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  let useCase: PreviewPortfolioImportUseCase;
  let assetCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const portfolioRepository = { findById: vi.fn().mockResolvedValue(samplePortfolio) };
    const accountRepository = {
      findById: vi.fn(),
      findByPortfolioId: vi.fn().mockResolvedValue([{ id: accountId, name: 'XP', portfolioId }]),
    };
    // Catalog holds the PREDECESSOR row only — no MBRF3 row exists anywhere.
    assetCreate = vi.fn();
    const assetRepository = {
      list: vi.fn().mockResolvedValue([
        { id: mrfg3AssetId, ticker: 'MRFG3', exchange: 'BVMF', status: 'ACTIVE' },
      ]),
      create: assetCreate,
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

  it('resolves successor tickers to the canonical asset without creating rows', async () => {
    const preview = await useCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content: await movementBuffer(),
    });

    expect(preview.candidates).toHaveLength(2);
    for (const candidate of preview.candidates) {
      expect(candidate.ticker).toBe('MBRF3');
      expect(candidate.assetId).toBe(mrfg3AssetId);
      expect(candidate.assetResolution).toBe('RESOLVED');
    }
    // No catalog writes: successor resolution never provisions asset rows.
    expect(assetCreate).not.toHaveBeenCalled();
  });

  it('keeps movement gates enforced on successor-resolved rows', async () => {
    const preview = await useCase.execute({
      portfolioId,
      userId,
      sourceType: 'B3_MOVEMENT_XLSX',
      fileName: 'movimentacao-synthetic.xlsx',
      content: await movementBuffer(),
    });
    // Mirrored loan-roll pair: gated to UNSUPPORTED despite resolved assets.
    expect(preview.candidates.every((c) => c.status === 'UNSUPPORTED')).toBe(true);
    expect(preview.candidates.every((c) => c.status !== 'READY')).toBe(true);
    expect(
      preview.candidates.every((c) =>
        c.issues.some((i) => i.code === 'LOAN_CUSTODY_STATE'),
      ),
    ).toBe(true);
  });
});
