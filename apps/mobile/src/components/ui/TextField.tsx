import React, { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, ViewStyle } from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  error,
  helperText,
  containerStyle,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          Boolean(error) && styles.inputError,
          style,
        ]}
        placeholderTextColor={themeTokens.colors.textMuted}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: themeTokens.spacing.md,
    width: '100%',
  },
  label: {
    color: themeTokens.colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: themeTokens.spacing.xs,
  },
  input: {
    height: 48,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.borderRadius.md,
    paddingHorizontal: themeTokens.spacing.md,
    color: themeTokens.colors.text,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: themeTokens.colors.primary,
  },
  inputError: {
    borderColor: themeTokens.colors.danger,
  },
  errorText: {
    color: themeTokens.colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    color: themeTokens.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
});
