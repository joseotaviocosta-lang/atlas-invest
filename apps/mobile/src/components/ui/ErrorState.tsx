import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { themeTokens } from '@atlas/ui';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, style }) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>Ops, ocorreu um erro</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          title="Tentar novamente"
          onPress={onRetry}
          variant="secondary"
          style={styles.button}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: themeTokens.spacing.xl,
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.danger,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.lg,
    marginVertical: themeTokens.spacing.md,
  },
  title: {
    color: themeTokens.colors.danger,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: themeTokens.spacing.xs,
    textAlign: 'center',
  },
  message: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: themeTokens.spacing.md,
    minWidth: 160,
  },
});
