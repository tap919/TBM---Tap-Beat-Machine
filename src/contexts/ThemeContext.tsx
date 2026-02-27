import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = {
  id: string;
  name: string;
  primary: string;
  primaryGlow: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
};

export const themes: Theme[] = [
  {
    id: 'mpc-classic',
    name: 'MPC Classic',
    primary: '#ef4444', // red-500
    primaryGlow: 'rgba(239, 68, 68, 0.2)',
    bg: '#0a0a0a',
    surface: '#171717',
    border: '#262626',
    text: '#e5e5e5'
  },
  {
    id: 'techno-blue',
    name: 'Techno Blue',
    primary: '#3b82f6', // blue-500
    primaryGlow: 'rgba(59, 130, 246, 0.2)',
    bg: '#020617',
    surface: '#0f172a',
    border: '#1e293b',
    text: '#f1f5f9'
  },
  {
    id: 'acid-green',
    name: 'Acid Green',
    primary: '#22c55e', // green-500
    primaryGlow: 'rgba(34, 197, 94, 0.2)',
    bg: '#050505',
    surface: '#0a0a0a',
    border: '#1a1a1a',
    text: '#f0fdf4'
  },
  {
    id: 'cyber-purple',
    name: 'Cyber Purple',
    primary: '#a855f7', // purple-500
    primaryGlow: 'rgba(168, 85, 247, 0.2)',
    bg: '#0c0414',
    surface: '#1a0b2e',
    border: '#2d1b4d',
    text: '#faf5ff'
  },
  {
    id: 'gold-standard',
    name: 'Gold Standard',
    primary: '#eab308', // yellow-500
    primaryGlow: 'rgba(234, 179, 8, 0.2)',
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentThemeId, setCurrentThemeId] = useState('mpc-classic');
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
    root.style.setProperty('--bg-main', currentTheme.bg);
    root.style.setProperty('--bg-surface', currentTheme.surface);
    root.style.setProperty('--border-main', currentTheme.border);
    root.style.setProperty('--text-main', currentTheme.text);
  }, [currentTheme]);

  const setTheme = (id: string) => setCurrentThemeId(id);
  
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
