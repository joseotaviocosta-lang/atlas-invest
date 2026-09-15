import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.title}>Atlas</Text>
        <Text style={styles.subtitle}>Foundation Ready</Text>
        <Text style={styles.info}>API Target: {apiUrl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#151A23',
    borderColor: '#232936',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#F3F4F6',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 16,
  },
  info: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
