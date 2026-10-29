import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  detectB3XlsxLayout,
  parseB3NegotiationXlsx,
  B3XlsxParseError,
} from '@atlas/import-engine';

async function createWorkbookBuffer(builder: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  builder(wb);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('B3 XLSX Import: Layout Detection & Negotiation Parser', () => {
  describe('detectB3XlsxLayout', () => {
    it('detects B3 Negociação officially and marks it supported', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '08/10/2026',
          'Compra',
          'Mercado à Vista',
          '-',
          'XP INVESTIMENTOS CCTVM S/A.',
          'PETR4',
          100,
          35.5,
          3550,
        ]);
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(true);
      expect(result.layout).toBe('B3_NEGOTIATION');
      expect(result.isSupported).toBe(true);
      expect(result.detectedName).toBe('Área do Investidor B3 — Negociação');
    });

    it('detects B3 Movimentação and marks it recognized but unsupported', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
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
        ws.addRow(['Credito', '28/10/2026', 'Transferência - Liquidação', 'BBAS3', 'XP', 200, 17.38, 3476]);
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(true);
      expect(result.layout).toBe('B3_MOVEMENT');
      expect(result.isSupported).toBe(false);
      expect(result.reason).toContain('Arquivo B3 reconhecido (Movimentação), mas este tipo ainda não é suportado');
    });

    it('detects B3 Eventos / Proventos a Receber and marks it recognized but unsupported', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Proventos a Receber');
        ws.addRow([
          'Produto',
          'Tipo',
          'Tipo de Evento',
          'Previsão de pagamento',
          'Instituição',
          'Conta',
          'Quantidade',
          'Preço unitário',
          'Valor líquido',
        ]);
        ws.addRow(['PETR4', 'PN', 'Dividendo', '23/11/2026', 'XP', '1234', 100, 0.5, 50]);
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(true);
      expect(result.layout).toBe('B3_EVENTS');
      expect(result.isSupported).toBe(false);
      expect(result.reason).toContain('Arquivo B3 reconhecido (Proventos a Receber), mas este tipo ainda não é suportado');
    });

    it('detects B3 Posição multi-sheet and marks it recognized but unsupported', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        wb.addWorksheet('Acoes');
        wb.addWorksheet('BDR');
        wb.addWorksheet('Empréstimos');
        wb.addWorksheet('Fundo de Investimento');
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(true);
      expect(result.layout).toBe('B3_POSITION');
      expect(result.isSupported).toBe(false);
      expect(result.reason).toContain('Arquivo B3 reconhecido (Posição em Custódia), mas este tipo ainda não é suportado');
    });

    it('detects B3 Relatório Consolidado Anual and marks it recognized but unsupported', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        wb.addWorksheet('Posição - Ações');
        wb.addWorksheet('Proventos Recebidos');
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(true);
      expect(result.layout).toBe('B3_ANNUAL_REPORT');
      expect(result.isSupported).toBe(false);
      expect(result.reason).toContain('Arquivo B3 reconhecido (Relatório Consolidado Anual), mas este tipo ainda não é suportado');
    });

    it('rejects non-B3 spreadsheet as UNKNOWN', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Planilha1');
        ws.addRow(['Nome', 'Cargo', 'Salário']);
        ws.addRow(['João', 'Engenheiro', 10000]);
      });

      const result = await detectB3XlsxLayout(buffer);
      expect(result.isB3).toBe(false);
      expect(result.layout).toBe('UNKNOWN');
      expect(result.isSupported).toBe(false);
      expect(result.reason).toContain('Arquivo Excel não reconhecido como formato oficial da B3');
    });

    it('handles malformed or corrupted buffer safely', async () => {
      const corrupt = Buffer.from('this is not an xlsx zip file');
      const result = await detectB3XlsxLayout(corrupt);
      expect(result.isB3).toBe(false);
      expect(result.layout).toBe('UNKNOWN');
      expect(result.reason).toContain('Não foi possível ler o arquivo Excel');
    });
  });

  describe('parseB3NegotiationXlsx', () => {
    it('parses valid B3 negotiation file with Compra and Venda operations and multiple institutions', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '08/10/2026',
          'Compra',
          'Mercado à Vista',
          '-',
          'XP INVESTIMENTOS CCTVM S/A.',
          'IRIM11',
          5,
          66.7,
          333.5,
        ]);
        ws.addRow([
          '08/10/2026',
          'Venda',
          'Mercado à Vista',
          '15/10/2026',
          'NU INVEST CORRETORA DE VALORES S.A.',
          'ITSA4',
          200,
          16.1,
          3220,
        ]);
      });

      const candidates = await parseB3NegotiationXlsx(buffer, { today: '2026-10-29' });
      expect(candidates).toHaveLength(2);

      // Compra row
      expect(candidates[0]!.rowNumber).toBe(2);
      expect(candidates[0]!.tradeDate).toBe('2026-10-08');
      expect(candidates[0]!.operation).toBe('BUY');
      expect(candidates[0]!.rawOperation).toBe('Compra');
      expect(candidates[0]!.ticker).toBe('IRIM11');
      expect(candidates[0]!.quantity).toBe('5');
      expect(candidates[0]!.unitPrice).toBe('66.7');
      expect(candidates[0]!.fees).toBe('0');
      expect(candidates[0]!.currency).toBe('BRL');
      expect(candidates[0]!.brokerLabel).toBe('XP INVESTIMENTOS CCTVM S/A.');
      expect(candidates[0]!.settlementDate).toBeUndefined();
      expect(candidates[0]!.status).toBe('READY');
      expect(candidates[0]!.issues).toHaveLength(0);

      // Venda row with settlementDate & NU INVEST
      expect(candidates[1]!.rowNumber).toBe(3);
      expect(candidates[1]!.tradeDate).toBe('2026-10-08');
      expect(candidates[1]!.operation).toBe('SELL');
      expect(candidates[1]!.rawOperation).toBe('Venda');
      expect(candidates[1]!.ticker).toBe('ITSA4');
      expect(candidates[1]!.quantity).toBe('200');
      expect(candidates[1]!.unitPrice).toBe('16.1');
      expect(candidates[1]!.fees).toBe('0');
      expect(candidates[1]!.currency).toBe('BRL');
      expect(candidates[1]!.brokerLabel).toBe('NU INVEST CORRETORA DE VALORES S.A.');
      expect(candidates[1]!.settlementDate).toBe('2026-10-15');
      expect(candidates[1]!.status).toBe('READY');
    });

    it('parses PT-BR formatted strings with comma decimal separator and thousand dots', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '08/10/2026',
          'Compra',
          'Mercado à Vista',
          '-',
          'BTG PACTUAL',
          'PETR4',
          '1.500',
          '35,50',
          '53.250,00',
        ]);
      });

      const candidates = await parseB3NegotiationXlsx(buffer, { today: '2026-10-29' });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.quantity).toBe('1500');
      expect(candidates[0]!.unitPrice).toBe('35.50');
      expect(candidates[0]!.status).toBe('READY');
    });

    it('ignores non-data rows: blanks, repeated headers and summary/totals', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '08/10/2026',
          'Compra',
          'Mercado à Vista',
          '-',
          'XP',
          'BBAS3',
          100,
          25.0,
          2500,
        ]);
        ws.addRow(['', '', '', '', '', '', '', '', '']); // blank row
        ws.addRow([
          'Total',
          '',
          '',
          '',
          '',
          '',
          100,
          '',
          2500,
        ]); // total row
      });

      const candidates = await parseB3NegotiationXlsx(buffer, { today: '2026-10-29' });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.ticker).toBe('BBAS3');
    });

    it('marks unknown movement types as UNSUPPORTED and does not infer from value sign', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '08/10/2026',
          'Transferência',
          'Mercado à Vista',
          '-',
          'XP',
          'BBAS3',
          100,
          25.0,
          2500,
        ]);
      });

      const candidates = await parseB3NegotiationXlsx(buffer, { today: '2026-10-29' });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.status).toBe('UNSUPPORTED');
      expect(candidates[0]!.issues.some((i) => i.code === 'UNSUPPORTED_OPERATION')).toBe(true);
    });

    it('flags invalid dates, future dates, invalid tickers, zero quantities and prices', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        ws.addRow([
          '31/02/2026', // invalid date
          'Compra',
          'Mercado à Vista',
          '-',
          'XP',
          'PETR4',
          10,
          20,
          200,
        ]);
        ws.addRow([
          '30/12/2026', // future date (today is 2026-10-29)
          'Compra',
          'Mercado à Vista',
          '-',
          'XP',
          'VALE3',
          10,
          20,
          200,
        ]);
        ws.addRow([
          '08/10/2026',
          'Compra',
          'Mercado à Vista',
          '-',
          'XP',
          'INVALID??TICKER',
          0, // zero quantity
          0, // zero price
          0,
        ]);
      });

      const candidates = await parseB3NegotiationXlsx(buffer, { today: '2026-10-29' });
      expect(candidates).toHaveLength(3);

      expect(candidates[0]!.status).toBe('INVALID');
      expect(candidates[0]!.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true);

      expect(candidates[1]!.status).toBe('INVALID');
      expect(candidates[1]!.issues.some((i) => i.code === 'FUTURE_DATE')).toBe(true);

      expect(candidates[2]!.status).toBe('INVALID');
      expect(candidates[2]!.issues.some((i) => i.code === 'INVALID_QUANTITY')).toBe(true);
      expect(candidates[2]!.issues.some((i) => i.code === 'INVALID_UNIT_PRICE')).toBe(true);
    });

    it('throws when row count exceeds maximum limit', async () => {
      const buffer = await createWorkbookBuffer((wb) => {
        const ws = wb.addWorksheet('Negociação');
        ws.addRow([
          'Data do Negócio',
          'Tipo de Movimentação',
          'Mercado',
          'Prazo/Vencimento',
          'Instituição',
          'Código de Negociação',
          'Quantidade',
          'Preço',
          'Valor',
        ]);
        for (let i = 0; i < 15; i++) {
          ws.addRow(['08/10/2026', 'Compra', 'Mercado à Vista', '-', 'XP', 'PETR4', 10, 20, 200]);
        }
      });

      await expect(
        parseB3NegotiationXlsx(buffer, { maxRows: 10, today: '2026-10-29' }),
      ).rejects.toThrow(B3XlsxParseError);
    });
  });
});
