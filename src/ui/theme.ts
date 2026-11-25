import { useColorScheme } from 'react-native';
import type { ItemType } from '../core/types';

const dark = {
  bg: '#111214',
  card: '#1A1B1F',
  cardAlt: '#222328',
  border: '#2C2E33',
  text: '#EDEEF0',
  textDim: '#9A9CA3',
  textFaint: '#6B6E76',
  accent: '#7C8CF8',
  record: '#E5484D',
  ok: '#46A758',
  warn: '#F5A524',
  danger: '#E5484D',
};

const light: typeof dark = {
  bg: '#F7F7F8',
  card: '#FFFFFF',
  cardAlt: '#F0F0F3',
  border: '#E3E4E8',
  text: '#1B1C1F',
  textDim: '#5F626B',
  textFaint: '#8E919A',
  accent: '#4F5FD9',
  record: '#D93036',
  ok: '#2F8A42',
  warn: '#B7791F',
  danger: '#D93036',
};

export type Palette = typeof dark;

export function usePalette(): Palette {
  return useColorScheme() === 'light' ? light : dark;
}

export const TYPE_META: Record<ItemType, { icon: string; color: string; label: string }> = {
  task: { icon: 'checkbox-outline', color: '#7C8CF8', label: 'Task' },
  call: { icon: 'call-outline', color: '#46A758', label: 'Call' },
  delegate: { icon: 'people-outline', color: '#F5A524', label: 'Delegate' },
  idea: { icon: 'bulb-outline', color: '#E6C229', label: 'Idea' },
  learn: { icon: 'school-outline', color: '#3EB8C9', label: 'Learn' },
  remember: { icon: 'bookmark-outline', color: '#C774E8', label: 'Remember' },
};
