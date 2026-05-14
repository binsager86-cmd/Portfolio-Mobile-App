/**
 * Eagle Eye color maps — stage and rating colors resolved via theme palette.
 * Includes a few explicit contrast hex overrides for scanner readability.
 *
 * Usage:
 *   const { colors } = useThemeStore();
 *   const ratingColor = getRatingColor("STRONG_BUY", colors);
 */

import type { ThemePalette } from "@/constants/theme";

// ── Rating colors ────────────────────────────────────────────────────────────

export interface RatingColorSet {
  bg: string;
  text: string;
  border: string;
}

export function getRatingColors(rating: string, c: ThemePalette): RatingColorSet {
  switch (rating) {
    case "STRONG_BUY":
      // Solid success with high-contrast white text
      return { bg: c.success, text: "#ffffff", border: c.success };
    case "BUY":
      // Slightly lighter/teal success tone
      return {
        bg: c.mode === "dark" ? "#14B8A6" : "#0EA5A6",
        text: "#ffffff",
        border: c.success,
      };
    case "HOLD":
      // Dark goldenrod for clear visibility in both themes
      return { bg: "#B8860B", text: "#ffffff", border: "#B8860B" };
    case "SELL":
      // Lightened error tone
      return {
        bg: c.mode === "dark" ? "#FF6B76" : "#F87171",
        text: "#ffffff",
        border: c.danger,
      };
    case "STRONG_SELL":
      // Full error tone
      return { bg: c.danger, text: "#ffffff", border: c.danger };
    case "INSUFFICIENT_DATA":
    default:
      return { bg: c.bgCard, text: c.textMuted, border: c.borderColor };
  }
}

/** Single text color for confidence numbers and small accents. */
export function getRatingTextColor(rating: string, c: ThemePalette): string {
  switch (rating) {
    case "STRONG_BUY":
    case "BUY":
      return c.success;
    case "SELL":
      return c.danger;
    case "STRONG_SELL":
      return c.danger;
    default:
      return c.textMuted;
  }
}

// ── Stage colors ─────────────────────────────────────────────────────────────
// Deliberately avoids red/green for stage encoding — stages are neutral facts,
// not good/bad assessments.

export interface StageColorSet {
  bg: string;
  text: string;
  dot: string;
}

export function getStageColors(stage: string, c: ThemePalette): StageColorSet {
  switch (stage) {
    case "DORMANT":
      return { bg: c.bgCard, text: c.textMuted, dot: c.textMuted };

    case "STEALTH_ACCUMULATION":
      // Info blue — institutional, quiet
      return { bg: c.bgCard, text: c.accentSecondary, dot: c.accentSecondary };

    case "EARLY_BREAKOUT":
      // Teal/cyan — emerging
      return { bg: c.bgCard, text: c.success, dot: c.success };

    case "MARKUP_TRENDING":
      // Success green
      return { bg: c.successBg, text: c.successText, dot: c.success };

    case "ACCELERATION_CLIMAX":
      // Amber/orange — caution, late stage
      return { bg: c.warningBg, text: c.warningText, dot: c.warning };

    case "DISTRIBUTION_TOPPING":
      // Warning orange
      return { bg: c.warningBg, text: c.warning, dot: c.warning };

    case "MARKDOWN_DECLINE":
      // Error red
      return { bg: c.dangerBg, text: c.dangerText, dot: c.danger };

    case "CAPITULATION_EXHAUSTION":
      // Purple — extreme, potential reversal
      return { bg: c.bgCard, text: c.accentPrimary, dot: c.accentPrimary };

    default:
      return { bg: c.bgCard, text: c.textMuted, dot: c.textMuted };
  }
}

// ── Regime colors ────────────────────────────────────────────────────────────

export function getRegimeColors(regime: string, c: ThemePalette): RatingColorSet {
  switch (regime) {
    case "RISK_ON":
      return { bg: c.successBg, text: c.successText, border: c.success };
    case "RISK_OFF":
      return { bg: c.dangerBg, text: c.dangerText, border: c.danger };
    case "NEUTRAL":
    default:
      return { bg: c.bgCard, text: c.textSecondary, border: c.borderColor };
  }
}

// ── Confidence → color interpolation ────────────────────────────────────────

/** Map a 0-100 confidence score to a theme color. */
export function getConfidenceColor(confidence: number, c: ThemePalette): string {
  if (confidence >= 75) return c.success;
  if (confidence >= 60) return c.warning;
  return c.textMuted;
}

/** Map a discriminative_power number to a color. */
export function getDiscriminativePowerColor(power: number, c: ThemePalette): string {
  if (power >= 20) return c.success;
  if (power >= 8) return c.accentSecondary;
  if (power >= 2) return c.warning;
  return c.textMuted;
}
