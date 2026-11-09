import { Injectable, Inject } from '@nestjs/common';
import { MacroContextSummary, evaluateMacroFreshness } from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { MACRO_REPOSITORY } from '../../database/tokens';

function formatDateBr(d: LocalDate): string {
  const day = String(d.day).padStart(2, '0');
  const month = String(d.month).padStart(2, '0');
  return `${day}/${month}/${d.year}`;
}

function formatDecimalBr(val: string): string {
  return val.replace('.', ',');
}

function formatPtaxRate(val: string): string {
  const parts = val.split('.');
  const intPart = parts[0] || '0';
  const decPart = (parts[1] || '0000').padEnd(4, '0').slice(0, 4);
  return `R$ ${intPart},${decPart}`;
}

@Injectable()
export class GetMacroContextUseCase {
  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(): Promise<MacroContextSummary> {
    const [ipca, selicTarget, selicEffective, ptax] = await Promise.all([
      this.macroRepository.findLatest('IPCA'),
      this.macroRepository.findLatest('SELIC_TARGET'),
      this.macroRepository.findLatest('SELIC_EFFECTIVE'),
      this.macroRepository.findLatest('PTAX'),
    ]);

    return {
      ipcaMonthly: ipca
        ? {
            referenceMonth: ipca.referenceDate.toString().substring(0, 7),
            referenceMonthFormatted: `${String(ipca.referenceDate.month).padStart(2, '0')}/${ipca.referenceDate.year}`,
            value: `${ipca.value}%`,
            formattedValue: `${formatDecimalBr(ipca.value)}% no mês`,
            publishedAt: ipca.publishedAt ? ipca.publishedAt.toISOString() : undefined,
            source: 'IBGE',
            freshness: evaluateMacroFreshness('IPCA', ipca.referenceDate),
            status: 'AVAILABLE',
          }
        : undefined,

      selicTarget: selicTarget
        ? {
            rate: `${selicTarget.value}% a.a.`,
            formattedValue: `${formatDecimalBr(selicTarget.value)}% a.a.`,
            effectiveDate: selicTarget.referenceDate.toString(),
            effectiveDateFormatted: formatDateBr(selicTarget.referenceDate),
            source: 'Banco Central / Copom',
            freshness: evaluateMacroFreshness('SELIC_TARGET', selicTarget.referenceDate),
            status: 'AVAILABLE',
          }
        : undefined,

      selicEffective: selicEffective
        ? {
            rate: `${selicEffective.value}% a.a.`,
            formattedValue: `${formatDecimalBr(selicEffective.value)}% a.a.`,
            effectiveDate: selicEffective.referenceDate.toString(),
            effectiveDateFormatted: formatDateBr(selicEffective.referenceDate),
            source: 'Banco Central (SGS)',
            freshness: evaluateMacroFreshness('SELIC_EFFECTIVE', selicEffective.referenceDate),
            status: 'AVAILABLE',
          }
        : undefined,

      ptax: ptax
        ? {
            rate: formatPtaxRate(ptax.value),
            value: ptax.value,
            effectiveDate: ptax.referenceDate.toString(),
            effectiveDateFormatted: formatDateBr(ptax.referenceDate),
            source: 'Banco Central (PTAX)',
            convention: 'Venda (Fechamento PTAX)',
            freshness: evaluateMacroFreshness('PTAX', ptax.referenceDate),
            status: 'AVAILABLE',
          }
        : undefined,

      ibovespa: {
        value: '—',
        status: 'OFFICIAL_SOURCE_UNAVAILABLE',
        message: 'Integração ainda não disponível',
        source: 'B3 (Oficial)',
      },
    };
  }
}
