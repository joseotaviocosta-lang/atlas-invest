import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { themeTokens } from '@atlas/ui';

export interface PasswordFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label?: string;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label = 'Senha',
  error,
  helperText,
  containerStyle,
  style,
  ...props
}) => {
  const [isSecure, setIsSecure] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          Boolean(error) && styles.inputError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          secureTextEntry={isSecure}
          placeholderTextColor={themeTokens.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        <TouchableOpacity
          onPress={() => setIsSecure(!isSecure)}
          style={styles.toggleButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isSecure ? 'Mostrar senha' : 'Ocultar senha'}
        >
          <Text style={styles.toggleText}>{isSecure ? 'Mostrar' : 'Ocultar'}</Text>
        </TouchableOpacity>
      </View>
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: themeTokens.colors.surface,
    borderWidth: 1,
    borderColor: themeTokens.colors.border,
    borderRadius: themeTokens.borderRadius.md,
    paddingHorizontal: themeTokens.spacing.md,
  },
  input: {
    flex: 1,
    color: themeTokens.colors.text,
    fontSize: 15,
    height: '100%',
  },
  toggleButton: {
    paddingLeft: themeTokens.spacing.sm,
  },
  toggleText: {
    color: themeTokens.colors.primary,
    fontSize: 13,
    fontWeight: '500',
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
