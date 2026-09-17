import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION } from '../../packages/config/src/index';
import { DOMAIN_VERSION } from '../../packages/domain/src/index';
import { DATABASE_VERSION } from '../../packages/database/src/index';
import { PORTFOLIO_ENGINE_VERSION } from '../../packages/portfolio-engine/src/index';
import { PERFORMANCE_ENGINE_VERSION } from '../../packages/performance-engine/src/index';
import { TAX_ENGINE_VERSION } from '../../packages/tax-engine/src/index';
import { MARKET_DATA_VERSION } from '../../packages/market-data/src/index';
import { NEWS_DATA_VERSION } from '../../packages/news-data/src/index';
import { AI_ENGINE_VERSION } from '../../packages/ai-engine/src/index';
import { VALIDATION_VERSION } from '../../packages/validation/src/index';
import { UI_VERSION, themeTokens } from '../../packages/ui/src/index';
import { LOGGER_VERSION } from '../../packages/logger/src/index';
import { TESTING_VERSION } from '../../packages/testing/src/index';

describe('Foundation: Packages Import & Version Contracts', () => {
  it('should import and verify versions across all 13 shared packages', () => {
    expect(CONFIG_VERSION).toBe('0.1.0');
    expect(DOMAIN_VERSION).toBe('0.1.0');
    expect(DATABASE_VERSION).toBe('0.1.0');
    expect(PORTFOLIO_ENGINE_VERSION).toBe('1.0.0-rc.1');
    expect(PERFORMANCE_ENGINE_VERSION).toBe('0.1.0');
    expect(TAX_ENGINE_VERSION).toBe('0.1.0');
    expect(MARKET_DATA_VERSION).toBe('0.1.0');
    expect(NEWS_DATA_VERSION).toBe('0.1.0');
    expect(AI_ENGINE_VERSION).toBe('0.1.0');
    expect(VALIDATION_VERSION).toBe('0.1.0');
    expect(UI_VERSION).toBe('0.2.0');
    expect(LOGGER_VERSION).toBe('0.1.0');
    expect(TESTING_VERSION).toBe('0.1.0');
  });

  it('should verify theme tokens exported from @atlas/ui', () => {
    expect(themeTokens.colors.primary).toBe('#0A84FF');
    expect(themeTokens.colors.background).toBe('#0B0E14');
  });
});
