import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrap } from '../services/bootstrap';
import { usePalette } from '../ui/theme';

export default function RootLayout() {
  const p = usePalette();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    bootstrap().catch((e) => setError(String(e?.message ?? e)));
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: p.bg }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {error ? (
          <View style={{ padding: 16, backgroundColor: p.danger }}>
            <Text style={{ color: '#fff' }}>Start-up problem: {error}</Text>
          </View>
        ) : null}
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: p.bg },
            headerTintColor: p.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: p.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
          <Stack.Screen name="queue" options={{ title: 'Processing queue' }} />
          <Stack.Screen name="record" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
