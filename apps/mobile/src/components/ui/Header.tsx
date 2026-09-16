import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: {
    title: string;
    onPress: () => void;
  };
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onBack, rightAction }) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Text style={styles.backText}>{'< Voltar'}</Text>
          </TouchableOpacity>
        ) : null}
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {rightAction ? (
        <TouchableOpacity
          onPress={rightAction.onPress}
          style={styles.rightButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
        >
          <Text style={styles.rightText}>{rightAction.title}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: themeTokens.spacing.md,
    paddingVertical: themeTokens.spacing.sm,
    backgroundColor: themeTokens.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeTokens.colors.border,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: themeTokens.spacing.sm,
  },
  backText: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    color: themeTokens.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
  },
  rightButton: {
    paddingHorizontal: themeTokens.spacing.sm,
    paddingVertical: themeTokens.spacing.xs,
  },
  rightText: {
    color: themeTokens.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
