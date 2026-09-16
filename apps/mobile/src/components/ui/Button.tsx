import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { themeTokens } from '@atlas/ui';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  testID,
}) => {
  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryButton;
      case 'danger':
        return styles.dangerButton;
      case 'ghost':
        return styles.ghostButton;
      case 'primary':
      default:
        return styles.primaryButton;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryText;
      case 'danger':
        return styles.dangerText;
      case 'ghost':
        return styles.ghostText;
      case 'primary':
      default:
        return styles.primaryText;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.baseButton,
        getVariantStyle(),
        (disabled || loading) && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'ghost' || variant === 'secondary' ? themeTokens.colors.primary : '#FFFFFF'
          }
          size="small"
        />
      ) : (
        <Text style={[styles.baseText, getTextStyle(), textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    height: 48,
    borderRadius: themeTokens.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: themeTokens.spacing.md,
    flexDirection: 'row',
  },
  primaryButton: {
    backgroundColor: themeTokens.colors.primary,
  },
  secondaryButton: {
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
  },
  dangerButton: {
    backgroundColor: themeTokens.colors.danger,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  disabledButton: {
    opacity: 0.5,
  },
  baseText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: themeTokens.colors.text,
  },
  dangerText: {
    color: '#FFFFFF',
  },
  ghostText: {
    color: themeTokens.colors.primary,
  },
});
