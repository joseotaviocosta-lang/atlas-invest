import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { themeTokens } from '@atlas/ui';

interface TabIconProps {
  label: string;
  focused: boolean;
}

function TabLabel({ label, focused }: TabIconProps) {
  return (
    <Text
      style={{
        color: focused ? themeTokens.colors.primary : themeTokens.colors.textMuted,
        fontSize: 11,
        fontWeight: focused ? '700' : '500',
        marginTop: 2,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: themeTokens.colors.surface,
          borderTopColor: themeTokens.colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: themeTokens.colors.primary,
        tabBarInactiveTintColor: themeTokens.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Hoje',
          tabBarLabel: ({ focused }) => <TabLabel label="Hoje" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Carteira',
          tabBarLabel: ({ focused }) => <TabLabel label="Carteira" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Mercado',
          tabBarLabel: ({ focused }) => <TabLabel label="Mercado" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tax"
        options={{
          title: 'Fiscal',
          tabBarLabel: ({ focused }) => <TabLabel label="Fiscal" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'IA',
          tabBarLabel: ({ focused }) => <TabLabel label="IA" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
