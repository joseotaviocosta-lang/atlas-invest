import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface OfflineBannerProps {
  visible?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible = true }) => {
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Sem conexao com o servidor. Verifique sua internet.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: themeTokens.colors.warning,
    paddingVertical: themeTokens.spacing.xs + 2,
    paddingHorizontal: themeTokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
