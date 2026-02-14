import { useTranslation } from 'react-i18next';

// Standard typography (for non-Georgian languages) - 2025 mobile best practices
export const staticTypography = {
  // Main screen title (24-28px range)
  display: {
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  // Small heading (20-22px range)
  h1: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  // Subheading
  h2: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  // Address results, tertiary heading (16-18px range)
  h3: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 23,
  },
  // Body / main content (16-18px range)
  body: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 24,
  },
  // Body medium weight
  bodyMedium: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 24,
  },
  // Subtext (area/city) (12-14px range)
  bodySmall: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 21,
  },
  // Labels / secondary text (12-14px range)
  label: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Labels / secondary text (12-14px range)
  caption: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  // Minimum text size
  captionSmall: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  // Buttons / primary actions (16-18px range)
  button: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  // Small buttons
  buttonSmall: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
};

// Georgian typography (smaller sizes because Georgian characters are visually larger)
export const georgianTypography = {
  // Main screen title (reduced by ~2px)
  display: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  // Small heading
  h1: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  // Subheading
  h2: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  // Address results, tertiary heading
  h3: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  // Body / main content
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  // Body medium weight
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  // Subtext (area/city)
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  // Labels / secondary text
  label: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Labels / secondary text
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
  // Minimum text size
  captionSmall: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
  },
  // Buttons / primary actions
  button: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  // Small buttons
  buttonSmall: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
};

// Hook to get the appropriate typography based on current language
export const useTypography = () => {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language;

  // Use smaller typography for Georgian (characters are visually larger), standard for other languages
  return currentLanguage === 'ka' ? georgianTypography : staticTypography;
};

// Default export for backward compatibility (static typography)
export const typography = staticTypography;

export default typography;
