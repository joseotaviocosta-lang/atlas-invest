import React from 'react';
import { View, StyleSheet, ViewStyle, ScrollView, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { themeTokens } from '@atlas/ui';

export interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  contentContainerStyle?: ViewStyle;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  scrollable = false,
  contentContainerStyle,
}) => {
  const insets = useSafeAreaInsets();

  const containerStyle = [
    styles.container,
    {
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    style,
  ];

  if (scrollable) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={themeTokens.colors.background} />
        <ScrollView
          style={[styles.container, style]}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom + 16,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 16,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <StatusBar barStyle="light-content" backgroundColor={themeTokens.colors.background} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeTokens.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
