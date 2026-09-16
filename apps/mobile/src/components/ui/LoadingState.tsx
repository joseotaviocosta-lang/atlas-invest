import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface LoadingStateProps {
  message?: string;
  style?: ViewStyle;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Carregando...', style }) => {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={themeTokens.colors.primary} />
      {message ? <Text style={styles.text}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: themeTokens.spacing.xl,
  },
  text: {
    color: themeTokens.colors.textMuted,
    fontSize: 14,
    marginTop: themeTokens.spacing.md,
    textAlign: 'center',
  },
});
