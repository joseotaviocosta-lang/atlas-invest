import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { themeTokens, colors } from '@atlas/ui';

export interface MobileHistoricalBannerProps {
  /** e.g. `Visualizando carteira em 15/03/2026`. */
  label: string;
  onBackToToday: () => void;
}

/**
 * Persistent historical-mode banner (Fase 2F, mobile).
 *
 * Always visible while `asOf` is active so the user never mistakes a
 * reconstructed snapshot for current data. Informational tone (no alarm).
 */
export function MobileHistoricalBanner({ label, onBackToToday }: MobileHistoricalBannerProps) {
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLabel={`Modo histórico ativo. ${label}`}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Histórico</Text>
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBackToToday}
        accessibilityRole="button"
        accessibilityLabel="Voltar para a carteira de hoje"
      >
        <Text style={styles.backButtonText}>Voltar para hoje</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: themeTokens.spacing.md,
    paddingVertical: themeTokens.spacing.sm,
    marginBottom: themeTokens.spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: themeTokens.colors.primary,
    borderRadius: themeTokens.borderRadius.md,
  },
  badge: {
    backgroundColor: themeTokens.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: themeTokens.borderRadius.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: themeTokens.colors.text,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
});
