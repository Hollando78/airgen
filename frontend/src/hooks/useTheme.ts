import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface UseThemeReturn {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

/**
 * Hook for managing theme (light/dark/system) with localStorage persistence
 *
 * @returns {UseThemeReturn} theme - current theme setting
 * @returns {UseThemeReturn} setTheme - function to change theme
 * @returns {UseThemeReturn} resolvedTheme - actual theme being displayed (light or dark)
 *
 * @example
 * const { theme, setTheme, resolvedTheme } = useTheme();
 *
 * // Toggle between light and dark
 * <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
 *   Toggle Theme
 * </button>
 */
export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Try to load from localStorage
    const stored = localStorage.getItem('airgen-theme') as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      return stored;
    }

    // Default to system preference
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme as ResolvedTheme;
  });

  // Listen to system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const newResolvedTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newResolvedTheme);

        // Update DOM
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(newResolvedTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Apply theme to DOM and localStorage
  useEffect(() => {
    const root = document.documentElement;

    let effectiveTheme: ResolvedTheme;

    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } else {
      effectiveTheme = theme as ResolvedTheme;
    }

    // Update DOM
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);

    // Update resolved theme state
    setResolvedTheme(effectiveTheme);

    // Persist to localStorage
    localStorage.setItem('airgen-theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return { theme, setTheme, resolvedTheme };
}
