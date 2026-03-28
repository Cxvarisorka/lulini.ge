// Color theme matching the website's design system
// Based on HSL values from client/src/index.css

export const colors = {
  // Primary colors - dark purple theme
  primary: '#5b21b6', // dark purple (violet-800)
  primaryForeground: '#ffffff', // white text on purple

  // Secondary colors
  secondary: '#1a1a1a', // dark gray
  secondaryForeground: '#ffffff', // white

  // Accent colors - medium purple
  accent: '#7c3aed', // medium purple (violet-600)
  accentForeground: '#ffffff', // white

  // Background and foreground
  background: '#ffffff', // white
  foreground: '#0a0a0a', // black

  // Card colors
  card: '#ffffff', // white
  cardForeground: '#0a0a0a', // black

  // Muted colors
  muted: '#f5f5f5', // light gray
  mutedForeground: '#737373', // medium gray

  // Border and input
  border: '#e5e5e5', // light gray border
  input: '#e5e5e5', // light gray input
  ring: '#5b21b6', // dark purple ring

  // Destructive (for errors/warnings)
  destructive: '#ef4444', // red
  destructiveForeground: '#fafafa', // white

  // Additional colors for UI
  success: '#16a34a', // green
  warning: '#d97706', // amber
  info: '#6d28d9', // dark purple for info

  // Text colors
  text: {
    primary: '#0a0a0a',
    secondary: '#737373',
    muted: '#a3a3a3',
    inverse: '#fafafa',
  },

  // Status colors
  status: {
    pending: '#d97706',
    confirmed: '#2563eb',
    active: '#16a34a',
    completed: '#16a34a',
    cancelled: '#ef4444',
  },
};

export const darkColors = {
  // Primary colors
  primary: '#7c3aed', // slightly lighter purple for dark bg
  primaryForeground: '#ffffff',

  // Secondary colors
  secondary: '#e5e5e5',
  secondaryForeground: '#0a0a0a',

  // Accent colors
  accent: '#8b5cf6',
  accentForeground: '#ffffff',

  // Background and foreground
  background: '#1a1a1a',
  foreground: '#fafafa',

  // Card colors
  card: '#242424',
  cardForeground: '#fafafa',

  // Muted colors
  muted: '#0a0a0a',
  mutedForeground: '#a3a3a3',

  // Border and input
  border: '#333333',
  input: '#333333',
  ring: '#7c3aed',

  // Destructive
  destructive: '#f87171',
  destructiveForeground: '#0a0a0a',

  // Additional colors
  success: '#4ade80',
  warning: '#fbbf24',
  info: '#a78bfa',

  // Text colors
  text: {
    primary: '#fafafa',
    secondary: '#a3a3a3',
    muted: '#737373',
    inverse: '#0a0a0a',
  },

  // Status colors
  status: {
    pending: '#fbbf24',
    confirmed: '#60a5fa',
    active: '#4ade80',
    completed: '#4ade80',
    cancelled: '#f87171',
  },
};

// Helper to get colors based on dark mode flag
export const getColors = (isDark) => isDark ? darkColors : colors;

// Shadow styles - lighter for minimalist design
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1.5,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
};

// Border radius values
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
};

// Spacing values
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

// Import typography
import typography, { useTypography, staticTypography, georgianTypography } from './typography';

export default { colors, shadows, radius, spacing, typography };
export { typography, useTypography, staticTypography, georgianTypography };
