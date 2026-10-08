/**
 * YOO Design System — Premium 2026 mobility palette.
 *
 * COLOR RULES:
 *   D.green   → money, savings, earnings, match success       ONLY
 *   D.blue    → buttons, active states, navigation             ONLY
 *   D.orange  → urgency, warnings, "filling fast"             ONLY
 *   D.red     → errors, cancellation                          ONLY
 */

// ─── Brand ────────────────────────────────────────────────────────────────────

export const BLUE        = "#1E88FF";
export const BLUE_DARK   = "#1565D8";
export const BLUE_LIGHT  = "#42C7FF";
export const BLUE_TINT   = "#0D2847";

export const CYAN        = "#42C7FF";
export const NAVY        = "#08152F";
export const NAVY_SURFACE = "#0F2244";
export const NAVY_RAISED  = "#152A4A";
export const NAVY_BORDER  = "#1E3A5F";

// ─── Semantic ─────────────────────────────────────────────────────────────────

export const GREEN       = "#22C55E";
export const GREEN_TINT  = "#052E16";

export const ORANGE      = "#F59E0B";
export const ORANGE_TINT = "#2D1B00";

export const RED         = "#EF4444";
export const RED_TINT    = "#2D0A0A";

export const PURPLE      = "#7C3AED";
export const PURPLE_TINT = "#1E1040";

// ─── Typography ───────────────────────────────────────────────────────────────

export const TEXT_PRIMARY   = "#FFFFFF";
export const TEXT_SECONDARY = "#AAB4D0";
export const TEXT_DISABLED  = "#6B7A99";

// Light mode text (when on light surfaces)
export const TEXT_PRIMARY_LIGHT   = "#0F172A";
export const TEXT_SECONDARY_LIGHT = "#64748B";

// ─── Surface ──────────────────────────────────────────────────────────────────

export const BG_CANVAS  = "#08152F";
export const BG_SURFACE = "#0F2244";
export const BG_BORDER  = "#1E3A5F";

// ─── Spacing & Radius ─────────────────────────────────────────────────────────

export const RADIUS_SM   = 12;
export const RADIUS_MD   = 16;
export const RADIUS_LG   = 20;
export const RADIUS_XL   = 24;

export const SPACING_XS  = 8;
export const SPACING_SM  = 12;
export const SPACING_MD  = 16;
export const SPACING_LG  = 24;
export const SPACING_XL  = 32;

// ─── Gradient ─────────────────────────────────────────────────────────────────

export const GRADIENT_START  = "#1E88FF";
export const GRADIENT_END    = "#42C7FF";
export const GRADIENT_ANGLE  = 90;

export const GRADIENT_CSS    = `linear-gradient(${GRADIENT_ANGLE}deg, ${GRADIENT_START} 0%, ${GRADIENT_END} 100%)`;
export const GRADIENT_COLORS = [GRADIENT_START, GRADIENT_END] as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const SHADOW_CARD = {
  shadowColor:   "#000000",
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius:  20,
  elevation:     3,
} as const;

export const SHADOW_HERO = {
  shadowColor:   BLUE,
  shadowOffset:  { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius:  24,
  elevation:     10,
} as const;

export const SHADOW_BUTTON = {
  shadowColor:   BLUE,
  shadowOffset:  { width: 0, height: 6 },
  shadowOpacity: 0.4,
  shadowRadius:  16,
  elevation:     8,
} as const;

export const SHADOW_MODAL = {
  shadowColor:   "#000000",
  shadowOffset:  { width: 0, height: 12 },
  shadowOpacity: 0.25,
  shadowRadius:  32,
  elevation:     16,
} as const;

// ─── Auth screen palette (always dark premium) ────────────────────────────────

export const AUTH = {
  bg:           NAVY,
  surface:      NAVY_SURFACE,
  surfaceInput: "rgba(15, 34, 68, 0.85)",
  border:       NAVY_BORDER,
  borderFocus:  BLUE,
  text:         TEXT_PRIMARY,
  textMuted:    TEXT_SECONDARY,
  textSubtle:   TEXT_DISABLED,
  gradient:     GRADIENT_COLORS,
} as const;

// ─── Namespace ────────────────────────────────────────────────────────────────

export const D = {
  blue:        BLUE,
  blueDark:    BLUE_DARK,
  blueLight:   BLUE_LIGHT,
  blueTint:    BLUE_TINT,
  cyan:        CYAN,
  navy:        NAVY,
  green:       GREEN,
  greenTint:   GREEN_TINT,
  orange:      ORANGE,
  orangeTint:  ORANGE_TINT,
  red:         RED,
  redTint:     RED_TINT,
  purple:      PURPLE,
  purpleTint:  PURPLE_TINT,
  textPrimary:   TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textDisabled:  TEXT_DISABLED,
  bg:          BG_CANVAS,
  surface:     BG_SURFACE,
  border:      BG_BORDER,
  gradient:    GRADIENT_CSS,
  gradientColors: GRADIENT_COLORS,
  radius: { sm: RADIUS_SM, md: RADIUS_MD, lg: RADIUS_LG, xl: RADIUS_XL },
  spacing: { xs: SPACING_XS, sm: SPACING_SM, md: SPACING_MD, lg: SPACING_LG, xl: SPACING_XL },
  auth: AUTH,
  shadow: {
    card:   SHADOW_CARD,
    hero:   SHADOW_HERO,
    button: SHADOW_BUTTON,
    modal:  SHADOW_MODAL,
  },
} as const;

export default D;
