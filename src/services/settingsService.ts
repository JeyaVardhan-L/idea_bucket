import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../core/settings';
import { kvStore } from '../db/database';

const API_KEY = 'llm_api_key';

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export async function getSettings(): Promise<Settings> {
  if (!cache) cache = await loadSettings(kvStore);
  return cache;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  cache = await saveSettings(kvStore, patch);
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(cache ?? DEFAULT_SETTINGS);
  useEffect(() => {
    let alive = true;
    getSettings().then((v) => alive && setS(v));
    listeners.add(setS);
    return () => {
      alive = false;
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/** The API key lives only in the Android Keystore-backed secure store. */
export async function getApiKey(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(API_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function setApiKey(key: string): Promise<void> {
  const k = key.trim();
  if (k) await SecureStore.setItemAsync(API_KEY, k);
  else await SecureStore.deleteItemAsync(API_KEY);
}
