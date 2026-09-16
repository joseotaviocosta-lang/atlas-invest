import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: themeTokens.colors.surface,
    borderColor: themeTokens.colors.border,
    borderWidth: 1,
    borderRadius: themeTokens.borderRadius.lg,
    padding: themeTokens.spacing.md,
    marginBottom: themeTokens.spacing.md,
  },
});
