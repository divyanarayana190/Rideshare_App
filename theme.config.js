/** @type {const} */
const themeColors = {
  // Brand — premium blue gradient family
  primary:    { light: '#1E88FF', dark: '#1E88FF' },
  primaryDark:{ light: '#1565D8', dark: '#1565D8' },
  primaryTint:{ light: '#E8F4FF', dark: '#0D2847' },

  // Accent cyan — gradient end, highlights
  accent:     { light: '#42C7FF', dark: '#42C7FF' },

  // Semantic
  success:    { light: '#22C55E', dark: '#22C55E' },
  successTint:{ light: '#F0FDF4', dark: '#052E16' },
  warning:    { light: '#F59E0B', dark: '#FBBF24' },
  warningTint:{ light: '#FFFBEB', dark: '#2D1B00' },
  error:      { light: '#EF4444', dark: '#EF4444' },
  errorTint:  { light: '#FEF2F2', dark: '#2D0A0A' },

  // Surface — premium dark navy canvas
  background: { light: '#F0F4FA', dark: '#08152F' },
  surface:    { light: '#FFFFFF', dark: '#0F2244' },
  surfaceRaised:{ light: '#F8FAFC', dark: '#152A4A' },

  // Typography
  foreground: { light: '#0F172A', dark: '#FFFFFF' },
  muted:      { light: '#64748B', dark: '#AAB4D0' },
  subtle:     { light: '#94A3B8', dark: '#6B7A99' },

  // Structure
  border:     { light: '#E2E8F0', dark: '#1E3A5F' },
  shadow:     { light: '#000000', dark: '#000000' },

  // Aliases
  tint:       { light: '#1E88FF', dark: '#1E88FF' },
};

module.exports = { themeColors };
