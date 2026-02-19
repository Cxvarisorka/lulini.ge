// Color theme matching the website's design system
// Based on HSL values from client/src/index.css

import typography, { useTypography, staticTypography, georgianTypography, responsiveTypography } from './typography';

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
  gold: '#FFD700', // gold for ratings

  // Driver-specific colors
  online: '#16a34a', // green - driver is online
  offline: '#737373', // gray - driver is offline
  busy: '#d97706', // amber - driver has active ride

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
    accepted: '#2563eb',
    driver_arrived: '#8b5cf6',
    in_progress: '#16a34a',
    active: '#16a34a',
    completed: '#16a34a',
    cancelled: '#ef4444',
  },
};

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

export default { colors, shadows, radius, spacing, typography };
export { typography, useTypography, staticTypography, georgianTypography, responsiveTypography };
