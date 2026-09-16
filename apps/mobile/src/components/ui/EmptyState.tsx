import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { themeTokens } from '@atlas/ui';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionTitle,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} variant="primary" style={styles.button} />
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
    borderColor: themeTokens.colors.border,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.lg,
    marginVertical: themeTokens.spacing.md,
  },
  title: {
    color: themeTokens.colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: themeTokens.spacing.xs,
    textAlign: 'center',
  },
  description: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: themeTokens.spacing.lg,
    minWidth: 180,
  },
});
