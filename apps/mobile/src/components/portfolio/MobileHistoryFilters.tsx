import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { themeTokens, colors } from '@atlas/ui';

export interface MobileHistoryFilterState {
  period: 'all' | '30d' | '90d' | 'year';
  type: '' | 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
  accountId: string;
}

export interface MobileHistoryFiltersProps {
  filters: MobileHistoryFilterState;
  onChange: (filters: MobileHistoryFilterState) => void;
  accounts: readonly { id: string; name: string }[];
}

const TYPE_OPTIONS: Array<{
  id: MobileHistoryFilterState['type'];
  label: string;
}> = [
  { id: '', label: 'Todos' },
  { id: 'realized', label: 'Vendas' },
  { id: 'income', label: 'Rendimentos' },
  { id: 'cash-flow', label: 'Movimentações' },
  { id: 'corporate-action', label: 'Corporativos' },
  { id: 'transfer', label: 'Transferências' },
];

const PERIOD_OPTIONS: Array<{
  id: MobileHistoryFilterState['period'];
  label: string;
}> = [
  { id: 'all', label: 'Todo período' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'year', label: 'Ano atual' },
];

export function MobileHistoryFilters({ filters, onChange, accounts }: MobileHistoryFiltersProps) {
  const hasActiveFilters =
    filters.period !== 'all' || Boolean(filters.type) || Boolean(filters.accountId);

  const handleReset = () => {
    onChange({
      period: 'all',
      type: '',
      accountId: '',
    });
  };

  return (
    <View style={styles.container}>
      {/* Top row with label and optional clear button */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionHeading}>FILTRAR HISTÓRICO</Text>
        {hasActiveFilters && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleReset}
            accessibilityRole="button"
            accessibilityLabel="Limpar filtros aplicados"
          >
            <Text style={styles.clearButtonText}>Limpar filtros</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Type Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScrollContent}
        style={styles.chipsScrollView}
      >
        {TYPE_OPTIONS.map((opt) => {
          const isSelected = filters.type === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, isSelected && styles.activeChip]}
              onPress={() => onChange({ ...filters, type: opt.id })}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${opt.label}`}
            >
              <Text style={[styles.chipText, isSelected && styles.activeChipText]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Period Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScrollContent}
        style={styles.chipsScrollView}
      >
        {PERIOD_OPTIONS.map((opt) => {
          const isSelected = filters.period === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, isSelected && styles.activeChip]}
              onPress={() => onChange({ ...filters, period: opt.id })}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar período: ${opt.label}`}
            >
              <Text style={[styles.chipText, isSelected && styles.activeChipText]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Account Filter (if multiple accounts) */}
      {accounts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
          style={styles.chipsScrollView}
        >
          <TouchableOpacity
            style={[styles.chip, !filters.accountId && styles.activeChip]}
            onPress={() => onChange({ ...filters, accountId: '' })}
            accessibilityRole="button"
            accessibilityLabel="Filtrar por todas as contas"
          >
            <Text style={[styles.chipText, !filters.accountId && styles.activeChipText]}>
              Todas as contas
            </Text>
          </TouchableOpacity>
          {accounts.map((acc) => {
            const isSelected = filters.accountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[styles.chip, isSelected && styles.activeChip]}
                onPress={() => onChange({ ...filters, accountId: acc.id })}
                accessibilityRole="button"
                accessibilityLabel={`Filtrar por conta ${acc.name}`}
              >
                <Text style={[styles.chipText, isSelected && styles.activeChipText]}>
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: themeTokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: themeTokens.spacing.md,
    marginBottom: 6,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  clearButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: themeTokens.spacing.xs,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  chipsScrollView: {
    marginBottom: 6,
  },
  chipsScrollContent: {
    paddingHorizontal: themeTokens.spacing.md,
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeChip: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  activeChipText: {
    color: '#000000',
    fontWeight: '700',
  },
});
