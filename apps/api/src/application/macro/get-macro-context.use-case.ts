import { Injectable, Inject } from '@nestjs/common';
import { MacroContextSummary } from '@atlas/market-data';
import { IMacroRepository } from '@atlas/database';
import { MACRO_REPOSITORY } from '../../database/tokens';

@Injectable()
export class GetMacroContextUseCase {
  constructor(
    @Inject(MACRO_REPOSITORY)
    private readonly macroRepository: IMacroRepository,
  ) {}

  async execute(): Promise<MacroContextSummary> {
    const [ipca, selicTarget, selicEffective] = await Promise.all([
      this.macroRepository.findLatest('IPCA'),
      this.macroRepository.findLatest('SELIC_TARGET'),
      this.macroRepository.findLatest('SELIC_EFFECTIVE'),
    ]);

    return {
      ipcaMonthly: ipca
        ? {
            referenceMonth: ipca.referenceDate.toString().substring(0, 7),
            value: `${ipca.value}%`,
            publishedAt: ipca.publishedAt ? ipca.publishedAt.toISOString() : undefined,
            source: ipca.source,
          }
        : undefined,
      selicTarget: selicTarget
        ? {
            rate: `${selicTarget.value}% a.a.`,
            effectiveDate: selicTarget.referenceDate.toString(),
            source: selicTarget.source,
          }
        : undefined,
      selicEffective: selicEffective
        ? {
            rate: `${selicEffective.value}% a.a.`,
            effectiveDate: selicEffective.referenceDate.toString(),
            source: selicEffective.source,
          }
        : undefined,
    };
  }
}
