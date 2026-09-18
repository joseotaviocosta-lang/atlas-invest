import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens, colors } from '@atlas/ui';

export interface MobileAssetHeaderProps {
  ticker: string;
  name: string;
  assetClassLabel: string | null;
  portfolioName: string;
  isCostBasisIncomplete: boolean;
  completenessBadgeLabel: string | null;
  isOpen: boolean;
}

export function MobileAssetHeader({
  ticker,
  name,
  assetClassLabel,
  portfolioName,
  isCostBasisIncomplete,
  completenessBadgeLabel,
  isOpen,
}: MobileAssetHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Portfolio Context */}
      <View style={styles.contextRow}>
        <Text style={styles.portfolioContextText}>Carteira: {portfolioName}</Text>
        <View
          style={[styles.statusBadge, isOpen ? styles.statusBadgeOpen : styles.statusBadgeClosed]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              isOpen ? styles.statusTextOpen : styles.statusTextClosed,
            ]}
          >
            {isOpen ? 'POSIÇÃO ABERTA' : 'POSIÇÃO ENCERRADA'}
          </Text>
        </View>
      </View>

      {/* Main Asset Header */}
      <View style={styles.titleRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.ticker}>{ticker}</Text>
          {assetClassLabel && (
            <View style={styles.classBadge}>
              <Text style={styles.classBadgeText}>{assetClassLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {name !== ticker && <Text style={styles.assetName}>{name}</Text>}

      {/* Incomplete Cost Basis Alert Badge */}
      {isCostBasisIncomplete && completenessBadgeLabel && (
        <View style={styles.incompleteBadge}>
          <Text style={styles.incompleteBadgeText}>⚠️ {completenessBadgeLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: themeTokens.spacing.md,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  portfolioContextText: {
    fontSize: 12,
    color: themeTokens.colors.textMuted,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: themeTokens.borderRadius.sm,
  },
  statusBadgeOpen: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusBadgeClosed: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusTextOpen: {
    color: themeTokens.colors.success,
  },
  statusTextClosed: {
    color: themeTokens.colors.textMuted,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ticker: {
    fontSize: 24,
    fontWeight: '800',
    color: themeTokens.colors.text,
    letterSpacing: -0.5,
  },
  classBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: themeTokens.borderRadius.sm,
  },
  classBadgeText: {
    fontSize: 11,
    color: themeTokens.colors.textMuted,
    fontWeight: '600',
  },
  assetName: {
    fontSize: 14,
    color: themeTokens.colors.textMuted,
    marginTop: 2,
  },
  incompleteBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: themeTokens.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  incompleteBadgeText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
});
