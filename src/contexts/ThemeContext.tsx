import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = {
  id: string;
  name: string;
  primary: string;
  primaryGlow: string;
  indicator: string;
  indicatorGlow: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
};

export const themes: Theme[] = [
  {
    id: 'tbm-default',
    name: 'TBM Default',
    primary: '#FFC72C', // McDonald's yellow
    primaryGlow: 'rgba(255, 199, 44, 0.2)',
    indicator: '#39FF14', // neon green
    indicatorGlow: 'rgba(57, 255, 20, 0.3)',
    bg: '#001529', // navy blue
    surface: '#002244',
    border: '#003366',
    text: '#FFFFFF'
  },
  {
    id: 'techno-blue',
    name: 'Techno Blue',
    primary: '#3b82f6',
    primaryGlow: 'rgba(59, 130, 246, 0.2)',
    indicator: '#39FF14',
    indicatorGlow: 'rgba(57, 255, 20, 0.3)',
    bg: '#020617',
    surface: '#0f172a',
    border: '#1e293b',
    text: '#f1f5f9'
  },
  {
    id: 'acid-green',
    name: 'Acid Green',
    primary: '#22c55e',
    primaryGlow: 'rgba(34, 197, 94, 0.2)',
    indicator: '#39FF14',
    indicatorGlow: 'rgba(57, 255, 20, 0.3)',
    bg: '#050505',
    surface: '#0a0a0a',
    border: '#1a1a1a',
    text: '#f0fdf4'
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    primary: '#a855f7',
    primaryGlow: 'rgba(168, 85, 247, 0.2)',
    indicator: '#39FF14',
    indicatorGlow: 'rgba(57, 255, 20, 0.3)',
    bg: '#0c0414',
    surface: '#1a0b2e',
    border: '#2d1b4d',
    text: '#faf5ff'
  },
  {
    id: 'gold-standard',
    name: 'Gold Standard',
    primary: '#eab308',
    primaryGlow: 'rgba(234, 179, 8, 0.2)',
    indicator: '#39FF14',
    indicatorGlow: 'rgba(57, 255, 20, 0.3)',
    bg: '#0c0a09',
    surface: '#1c1917',
    border: '#292524',
    text: '#fafaf9'
  }
];

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (id: string) => void;
  customTheme: Theme;
  updateCustomTheme: (updates: Partial<Theme>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'tbm_theme_id';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentThemeId, setCurrentThemeId] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && (themes.some(t => t.id === saved) || saved === 'custom')) return saved;
    } catch { /* storage unavailable */ }
    return 'tbm-default';
  });
  const [customTheme, setCustomTheme] = useState<Theme>({
    ...themes[0],
    id: 'custom',
    name: 'Custom Theme'
  });

  const currentTheme = currentThemeId === 'custom' ? customTheme : themes.find(t => t.id === currentThemeId) || themes[0];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', currentTheme.primary);
    root.style.setProperty('--brand-primary-glow', currentTheme.primaryGlow);
    root.style.setProperty('--indicator', currentTheme.indicator);
    root.style.setProperty('--indicator-glow', currentTheme.indicatorGlow);
    root.style.setProperty('--bg-main', currentTheme.bg);
    root.style.setProperty('--bg-surface', currentTheme.surface);
    root.style.setProperty('--border-main', currentTheme.border);
    root.style.setProperty('--text-main', currentTheme.text);
  }, [currentTheme]);

  const setTheme = (id: string) => {
    setCurrentThemeId(id);
    try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* storage unavailable */ }
  };
  
  const updateCustomTheme = (updates: Partial<Theme>) => {
    setCustomTheme(prev => ({ ...prev, ...updates }));
    setCurrentThemeId('custom');
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, customTheme, updateCustomTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
