import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  detectB3XlsxLayout,
  parseB3AnnualReportXlsx,
  B3XlsxParseError,
  inferB3Asset,
} from '@atlas/import-engine';

async function createWorkbookBuffer(builder: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  builder(wb);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('B3 Annual Consolidated Report Parser (Opening Position Baseline)', () => {
  it('detects B3 Annual Report layout and marks it supported', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      const ws = wb.addWorksheet('Posição - Ações');
      ws.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      ws.addRow(['PETR4 - PETROBRAS', 'XP INVESTIMENTOS CCTVM S/A', '12345', 'PETR4', 100]);
    });

    const detection = await detectB3XlsxLayout(buffer);
    expect(detection.isB3).toBe(true);
    expect(detection.layout).toBe('B3_ANNUAL_REPORT');
    expect(detection.isSupported).toBe(true);
    expect(detection.detectedName).toContain('Relatório Consolidado Anual');
  });

  it('parses normal custody from Ações, BDR and Fundos sheets', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      // Posição - Ações
      const wsAcoes = wb.addWorksheet('Posição - Ações');
      wsAcoes.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsAcoes.addRow(['ITSA4 - ITAUSA S.A.', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'ITSA4', '1.161,3']);
      wsAcoes.addRow(['SAPR4 - SANEPAR', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'SAPR4', '3300']);
      wsAcoes.addRow(['Total', '', '', '', '4461.3']);

      // Posição - BDR
      const wsBdr = wb.addWorksheet('Posição - BDR');
      wsBdr.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsBdr.addRow(['ROXO34 - NU HOLDINGS', 'NU INVEST CORRETORA DE VALORES S.A.', '2542008', 'ROXO34', '499']);

      // Posição - Fundos
      const wsFundos = wb.addWorksheet('Posição - Fundos');
      wsFundos.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsFundos.addRow(['MXRF11 - MAXI RENDA', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'MXRF11', '1261']);
    });

    const candidates = await parseB3AnnualReportXlsx(buffer, {
      fileName: 'relatorio-consolidado-anual-2024.xlsx',
    });

    expect(candidates).toHaveLength(4);

    const itsa4 = candidates.find((c) => c.ticker === 'ITSA4');
    expect(itsa4).toBeDefined();
    expect(itsa4!.operation).toBe('TRANSFER_IN');
    expect(itsa4!.rawOperation).toBe('POSICAO_INICIAL');
    expect(itsa4!.tradeDate).toBe('2024-12-31');
    expect(itsa4!.quantity).toBe('1161.3');
    expect(itsa4!.unitPrice).toBe('0');
    expect(itsa4!.fees).toBe('0');
    expect(itsa4!.normalizedInstitution).toBe('XP Investimentos');
    expect(itsa4!.accountLabel).toBe('395072');
    expect(itsa4!.notes).toContain('Posição em 31/12/2024');

    const roxo34 = candidates.find((c) => c.ticker === 'ROXO34');
    expect(roxo34).toBeDefined();
    expect(roxo34!.quantity).toBe('499');
    expect(roxo34!.normalizedInstitution).toBe('Nubank / NuInvest');
    expect(roxo34!.accountLabel).toBe('2542008');

    const mxrf11 = candidates.find((c) => c.ticker === 'MXRF11');
    expect(mxrf11).toBeDefined();
    expect(mxrf11!.quantity).toBe('1261');
  });

  it('aggregates loaned custody (Natureza === "Doador") into total economic custody without double counting', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      // Posição - Ações (HYPE3 has 116, STBP3 has 0)
      const wsAcoes = wb.addWorksheet('Posição - Ações');
      wsAcoes.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsAcoes.addRow(['HYPE3 - HYPERA S.A.', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'HYPE3', '116']);

      // Posição - Empréstimos (HYPE3 has 84, STBP3 has 700, and a Tomador row of 500)
      const wsEmp = wb.addWorksheet('Posição - Empréstimos');
      wsEmp.addRow(['Produto', 'Instituição', 'Natureza', 'Quantidade', 'Preço de Fechamento']);
      wsEmp.addRow(['HYPE3 - HYPERA S.A.', 'XP INVESTIMENTOS CCTVM S/A', 'Doador', '84', '29.50']);
      wsEmp.addRow(['STBP3 - SANTOS BRASIL', 'XP INVESTIMENTOS CCTVM S/A', 'Doador', '700', '12.80']);
      // Tomador row should be ignored (borrowed, not owned)
      wsEmp.addRow(['VALE3 - VALE S.A.', 'XP INVESTIMENTOS CCTVM S/A', 'Tomador', '500', '60.00']);
      wsEmp.addRow(['Total', '', '', '1284', '']);
    });

    const candidates = await parseB3AnnualReportXlsx(buffer, {
      fileName: 'relatorio-consolidado-anual-2024.xlsx',
    });

    expect(candidates).toHaveLength(2); // HYPE3 and STBP3 (VALE3 ignored because Tomador)

    // STBP3: 0 in Ações + 700 in Empréstimos = 700
    const stbp3 = candidates.find((c) => c.ticker === 'STBP3');
    expect(stbp3).toBeDefined();
    expect(stbp3!.quantity).toBe('700');
    expect(stbp3!.notes).toContain('(Empréstimo Doador: 700)');
    expect(stbp3!.notes).toContain('Custo de aquisição fiscal a informar');

    // HYPE3: 116 in Ações + 84 in Empréstimos = 200
    const hype3 = candidates.find((c) => c.ticker === 'HYPE3');
    expect(hype3).toBeDefined();
    expect(hype3!.quantity).toBe('200');
    expect(hype3!.notes).toContain('(Custódia: 116 + Empréstimo Doador: 84)');
    expect(hype3!.accountLabel).toBe('395072');
  });

  it('ignores summary footers and empty rows', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      const ws = wb.addWorksheet('Posição - Ações');
      ws.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      ws.addRow(['', '', '', '', '']);
      ws.addRow(['BBAS3 - BANCO DO BRASIL', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'BBAS3', '200']);
      ws.addRow(['Total', '', '', '', '200']);
      ws.addRow(['Resumo Geral', '', '', '', '']);
    });

    const candidates = await parseB3AnnualReportXlsx(buffer, {
      fileName: 'relatorio-consolidado-anual-2024.xlsx',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.ticker).toBe('BBAS3');
    expect(candidates[0]!.quantity).toBe('200');
  });

  it('determines effective date from options, filename, or default', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      const ws = wb.addWorksheet('Posição - Ações');
      ws.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      ws.addRow(['WEGE3', 'XP INVESTIMENTOS', '123', 'WEGE3', '50']);
    });

    const c1 = await parseB3AnnualReportXlsx(buffer, { referenceDate: '2023-12-31' });
    expect(c1[0]!.tradeDate).toBe('2023-12-31');

    const c2 = await parseB3AnnualReportXlsx(buffer, { fileName: 'relatorio-anual-2025.xlsx' });
    expect(c2[0]!.tradeDate).toBe('2025-12-31');

    const c3 = await parseB3AnnualReportXlsx(buffer);
    expect(c3[0]!.tradeDate).toBe('2024-12-31');
  });

  it('ensures candidate structures are frozen (Object.freeze)', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      const ws = wb.addWorksheet('Posição - Ações');
      ws.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      ws.addRow(['PRIO3', 'XP INVESTIMENTOS', '123', 'PRIO3', '100']);
    });

    const candidates = await parseB3AnnualReportXlsx(buffer);
    expect(Object.isFrozen(candidates[0])).toBe(true);
    expect(() => {
      // @ts-expect-error mutating frozen object
      candidates[0]!.quantity = '999';
    }).toThrow();
  });

  it('resolves all critical 2024 tickers via inferB3Asset', () => {
    const tickers = [
      'STBP3', 'SAPR4', 'ITSA4', 'JHSF3', 'HYPE3', 'BBAS3',
      'COGN3', 'EGIE3', 'FLRY3', 'IRBR3', 'ISAE4', 'MALL11',
      'MRFG3', 'PRIO3', 'RBRP11', 'ROXO34', 'SNEL13', 'SNFF11',
      'TUPY3', 'UNIP3', 'VIVT3', 'WIZC3', 'EZTC3', 'FESA4',
    ];

    for (const ticker of tickers) {
      const asset = inferB3Asset(ticker);
      expect(asset).toBeDefined();
      expect(asset!.ticker).toBe(ticker);
      expect(asset!.name.length).toBeGreaterThan(0);
    }
  });

  it('throws B3XlsxParseError when no custody positions are found', async () => {
    const buffer = await createWorkbookBuffer((wb) => {
      const ws = wb.addWorksheet('Posição - Ações');
      ws.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      ws.addRow(['Total', '', '', '', '0']);
    });

    await expect(parseB3AnnualReportXlsx(buffer)).rejects.toThrow(B3XlsxParseError);
  });
});
