import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('admin_theme') as Theme) || 'dark',
  toggle: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('admin_theme', next);
      document.documentElement.className = next;
      return { theme: next };
    }),
  setTheme: (t: Theme) => {
    localStorage.setItem('admin_theme', t);
    document.documentElement.className = t;
    set({ theme: t });
  },
}));
