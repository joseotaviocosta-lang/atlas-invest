import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, colors } from '@atlas/ui';

export interface PortfolioCompletenessBannerProps {
  message?: string | null;
}

export function PortfolioCompletenessBanner({
  message = 'Algumas posições possuem custo de aquisição incompleto. Os valores de custo e preço médio dessas posições não podem ser exibidos com precisão.',
}: PortfolioCompletenessBannerProps) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.icon} aria-hidden={true}>
        ℹ
      </Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: themeTokens.borderRadius.md,
    padding: themeTokens.spacing.sm,
    marginBottom: themeTokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: '700',
  },
  text: {
    color: themeTokens.colors.text,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});
