import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { themeTokens } from '@atlas/ui';
import { TextField } from '../ui/TextField';

export interface MobileDateSelectorProps {
  /** Current civil date `YYYY-MM-DD`, or `null` in current mode. */
  value: string | null;
  /** Validation message, rendered associated to the input. */
  error?: string | null;
  /** Emits the raw `YYYY-MM-DD` value, or `null` when cleared. */
  onChange: (value: string | null) => void;
}

function maskDayMonthYear(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function toIso(masked: string): string | null {
  const parts = masked.split('/');
  if (parts.length !== 3) return null;
  const [day = '', month = '', year = ''] = parts;
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null;
  return `${year}-${month}-${day}`;
}

function toDisplay(iso: string | null): string {
  if (!iso) return '';
  const [year = '', month = '', day = ''] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

/**
 * Historical date entry (Fase 2F, mobile).
 *
 * Collects a civil date as `DD/MM/YYYY` text and converts it to ISO
 * `YYYY-MM-DD` with pure string handling — no `Date` parsing, so no
 * timezone can shift the economic day. The parent resolves the temporal
 * context (today normalization, future/invalid rejection) and owns routing.
 */
export function MobileDateSelector({ value, error, onChange }: MobileDateSelectorProps) {
  const [text, setText] = useState(() => toDisplay(value));

  React.useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const handleApply = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    onChange(toIso(trimmed));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Data da carteira</Text>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <TextField
            placeholder="DD/MM/AAAA"
            value={text}
            onChangeText={(next) => setText(maskDayMonthYear(next.replace(/\D/g, '')))}
            keyboardType="number-pad"
            maxLength={10}
            error={error ?? undefined}
            helperText="Deixe vazio e aplique para ver a carteira atual."
            accessibilityLabel="Data da carteira no formato dia mês ano"
            containerStyle={styles.fieldContainer}
          />
        </View>
        <TouchableOpacity
          style={styles.applyButton}
          onPress={handleApply}
          accessibilityRole="button"
          accessibilityLabel="Aplicar data histórica"
        >
          <Text style={styles.applyButtonText}>Aplicar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: themeTokens.spacing.sm,
  },
  label: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: themeTokens.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
  },
  fieldContainer: {
    marginBottom: 0,
  },
  applyButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: themeTokens.colors.primary,
    borderRadius: themeTokens.borderRadius.md,
    marginTop: 26,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
