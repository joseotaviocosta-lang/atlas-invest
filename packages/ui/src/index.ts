export const UI_VERSION = '0.2.0';

export * from './tokens/colors';
export * from './tokens/typography';
export * from './tokens/spacing';
export * from './tokens/radius';
export * from './tokens/shadows';
export * from './tokens/breakpoints';
export * from './navigation';
export * from './formatters';
export * from './contracts';
export * from './view-models/portfolio-overview.view-model';
export * from './view-models/asset-position-detail.view-model';
export * from './view-models/portfolio-activity.view-model';
export * from './view-models/portfolio-income.view-model';
export * from './view-models/portfolio-cash-flow.view-model';
export * from './view-models/portfolio-accounts.view-model';
export * from './view-models/portfolio-temporal-context.view-model';
export * from './view-models/portfolio-performance.view-model';
export * from './view-models/portfolio-performance-series.view-model';
export * from './view-models/portfolio-risk.view-model';
export * from './view-models/portfolio-risk-adjusted.view-model';
export * from './view-models/portfolio-benchmark-relative-risk.view-model';
export * from './view-models/portfolio-active-performance.view-model';
export * from './view-models/portfolio-rolling-analytics.view-model';
export * from './view-models/portfolio-tail-risk.view-model';
export * from './view-models/portfolio-scenario.view-model';
export * from './view-models/portfolio-intelligence.view-model';
export * from './view-models/portfolio-ai-explanation.view-model';
export * from './view-models/portfolio-ai-conversation.view-model';
export * from './view-models/fiscal-monthly.view-model';
export * from './view-models/fiscal-liability.view-model';
export * from './view-models/equity-fiscal.view-model';
export * from './view-models/fiscal-input-readiness.view-model';
export * from './view-models/fiscal-obligations.view-model';
export * from './view-models/payment-eligibility.view-model';
export * from './view-models/equity-6015-composition.view-model';
export * from './view-models/darf-handoff.view-model';
export * from './view-models/annual-positions.view-model';
export * from './view-models/annual-capital-market.view-model';
export * from './view-models/annual-investment-income.view-model';
export * from './view-models/annual-tax-readiness.view-model';
export * from './view-models/annual-tax-reporting.view-model';
export * from './view-models/annual-high-income.view-model';
export * from './view-models/high-income-review-package.view-model';
export * from './view-models/tax-compliance-timeline.view-model';
export * from './view-models/tax-payment-support.view-model';
export * from './view-models/tax-compliance-reminders.view-model';
export * from './view-models/tax-compliance-action-center.view-model';
export * from './view-models/tax-compliance-period-close.view-model';
export * from './view-models/b3-connection.view-model';
export * from './view-models/import-run-history.view-model';
export * from './view-models/review-inbox.view-model';
export * from './view-models/integration-settings.view-model';

import { colors } from './tokens/colors';
import { spacing } from './tokens/spacing';
import { borderRadius } from './tokens/radius';

/**
 * Backward-compatible themeTokens mapping for existing components.
 */
export const themeTokens = {
  colors: {
    primary: colors.accent,
    background: colors.background,
    surface: colors.surface,
    surfaceElevated: colors.surfaceElevated,
    border: colors.border,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    success: colors.positive,
    danger: colors.negative,
    warning: colors.warning,
    info: colors.info,
  },
  spacing: {
    xs: spacing.xs,
    sm: spacing.sm,
    md: spacing.base,
    lg: spacing.xl,
    xl: spacing.xxl,
  },
  borderRadius: {
    sm: borderRadius.sm,
    md: borderRadius.md,
    lg: borderRadius.lg,
    full: borderRadius.full,
  },
} as const;
