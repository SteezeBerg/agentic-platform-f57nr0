import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme as useAmplifyTheme } from '@aws-amplify/ui-react';
import { debounce } from 'lodash';
import { lightTheme } from '../assets/themes/light';
import { darkTheme } from '../assets/themes/dark';
import { StorageService } from '../utils/storage';
import { ThemeTokens } from '../config/theme';
import { LOCAL_STORAGE_KEYS } from '../config/constants';

// Theme transition duration in milliseconds
const TRANSITION_DURATION = 300;

// Media query for system theme preference
const DARK_MODE_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * Interface for useTheme hook return values
 * @version 1.0.0
 */
interface ThemeHookReturn {
  theme: ThemeTokens;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isSystemTheme: boolean;
  setSystemTheme: () => void;
}

/**
 * Custom hook for managing theme state with system preference detection,
 * persistence, and accessibility support
 * @version 1.0.0
 * @returns {ThemeHookReturn} Theme state and control functions
 */
export const useTheme = (): ThemeHookReturn => {
  // Initialize storage service
  const storageService = useMemo(() => new StorageService(), []);
  const amplifyTheme = useAmplifyTheme();

  // Initialize state
  const [theme, setTheme] = useState<ThemeTokens>(getInitialTheme());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => theme === darkTheme);
  const [isSystemTheme, setIsSystemTheme] = useState<boolean>(() => !storageService.getItem(LOCAL_STORAGE_KEYS.THEME_PREFERENCE).data);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  /**
   * Helper function to get initial theme based on storage and system preference
   */
  function getInitialTheme(): ThemeTokens {
    const storedTheme = storageService.getItem<'light' | 'dark'>(LOCAL_STORAGE_KEYS.THEME_PREFERENCE).data;
    
    if (storedTheme) {
      return storedTheme === 'dark' ? darkTheme : lightTheme;
    }

    const prefersDark = window.matchMedia(DARK_MODE_MEDIA_QUERY).matches;
    return prefersDark ? darkTheme : lightTheme;
  }

  /**
   * Handle system theme preference changes
   */
  const handleSystemThemeChange = useCallback((e: MediaQueryListEvent) => {
    if (isSystemTheme) {
      const newTheme = e.matches ? darkTheme : lightTheme;
      setTheme(newTheme);
      setIsDarkMode(e.matches);
    }
  }, [isSystemTheme]);

  /**
   * Debounced theme persistence to prevent excessive storage writes
   */
  const persistTheme = useCallback(
    debounce((newTheme: ThemeTokens) => {
      storageService.setItem(
        LOCAL_STORAGE_KEYS.THEME_PREFERENCE,
        newTheme === darkTheme ? 'dark' : 'light'
      );
    }, 500),
    [storageService]
  );

  /**
   * Toggle between light and dark themes
   */
  const toggleTheme = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    const newTheme = isDarkMode ? lightTheme : darkTheme;

    // Apply transition class
    document.documentElement.classList.add('theme-transition');

    // Update theme state
    setTheme(newTheme);
    setIsDarkMode(!isDarkMode);
    setIsSystemTheme(false);

    // Persist theme preference
    persistTheme(newTheme);

    // Remove transition class after animation
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
      setIsTransitioning(false);
    }, TRANSITION_DURATION);
  }, [isDarkMode, isTransitioning, persistTheme]);

  /**
   * Switch to system theme preference
   */
  const setSystemTheme = useCallback(() => {
    if (isTransitioning) return;

    setIsTransitioning(true);
    setIsSystemTheme(true);

    // Clear stored preference
    storageService.removeItem(LOCAL_STORAGE_KEYS.THEME_PREFERENCE);

    // Apply system preference
    const prefersDark = window.matchMedia(DARK_MODE_MEDIA_QUERY).matches;
    const newTheme = prefersDark ? darkTheme : lightTheme;

    // Apply transition
    document.documentElement.classList.add('theme-transition');
    setTheme(newTheme);
    setIsDarkMode(prefersDark);

    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
      setIsTransitioning(false);
    }, TRANSITION_DURATION);
  }, [isTransitioning, storageService]);

  // Set up system theme preference listener
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MODE_MEDIA_QUERY);
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [handleSystemThemeChange]);

  // Apply theme to Amplify UI components
  useEffect(() => {
    if (amplifyTheme) {
      amplifyTheme.tokens = theme.tokens;
    }
  }, [theme, amplifyTheme]);

  // Add CSS variables for transition
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .theme-transition {
        transition: all ${TRANSITION_DURATION}ms ease-in-out !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .theme-transition {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return {
    theme,
    isDarkMode,
    toggleTheme,
    isSystemTheme,
    setSystemTheme
  };
};

export default useTheme;