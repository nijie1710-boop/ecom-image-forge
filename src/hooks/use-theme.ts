import { useState, useEffect } from 'react';

export const THEMES = [
  { id: 'light', label: '明亮', emoji: '☀️' },
  { id: 'dark', label: '暗夜', emoji: '🌙' },
  { id: 'ocean', label: '海洋', emoji: '🌊' },
  { id: 'sunset', label: '日落', emoji: '🌅' },
  { id: 'forest', label: '森林', emoji: '🌿' },
  { id: 'lavender', label: '薰衣草', emoji: '💜' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as ThemeId;
      if (saved && THEMES.some(t => t.id === saved)) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    THEMES.forEach(t => root.classList.remove(t.id));
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return { theme, setTheme };
}
