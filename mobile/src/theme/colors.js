// Color theme matching the website's design system
// Based on HSL values from client/src/index.css

export const colors = {
  // Primary colors - dark/neutral theme
  primary: '#171717', // hsl(0 0% 9%)
  primaryForeground: '#fafafa', // hsl(0 0% 98%)

  // Secondary colors
  secondary: '#f5f5f5', // hsl(0 0% 96.1%)
  secondaryForeground: '#171717', // hsl(0 0% 9%)

  // Accent colors
  accent: '#f5f5f5', // hsl(0 0% 96.1%)
  accentForeground: '#171717', // hsl(0 0% 9%)

  // Background and foreground
  background: '#ffffff', // hsl(0 0% 100%)
  foreground: '#0a0a0a', // hsl(0 0% 3.9%)

  // Card colors
  card: '#ffffff', // hsl(0 0% 100%)
  cardForeground: '#0a0a0a', // hsl(0 0% 3.9%)

  // Muted colors
  muted: '#f5f5f5', // hsl(0 0% 96.1%)
  mutedForeground: '#737373', // hsl(0 0% 45.1%)

  // Border and input
  border: '#e5e5e5', // hsl(0 0% 89.8%)
  input: '#e5e5e5', // hsl(0 0% 89.8%)
  ring: '#0a0a0a', // hsl(0 0% 3.9%)

  // Destructive (for errors/warnings)
  destructive: '#ef4444', // hsl(0 84.2% 60.2%)
  destructiveForeground: '#fafafa', // hsl(0 0% 98%)

  // Additional colors for UI
  success: '#16a34a', // green
  warning: '#d97706', // amber
  info: '#2563eb', // blue (kept for specific accents)

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

// Shadow styles
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
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

export default { colors, shadows, radius, spacing };
