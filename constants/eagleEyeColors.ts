/**
 * Eagle Eye color maps — stage and rating colors resolved via theme palette.
 * Includes a few explicit contrast hex overrides for scanner readability.
 *
 * Usage:
 *   const { colors } = useThemeStore();
 *   const ratingColor = getRatingColors("BUY", colors);
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
    case "CONTINUE_RISING":
      return {
        bg: c.mode === "dark" ? "#0F766E" : "#0D9488",
        text: "#ffffff",
        border: c.mode === "dark" ? "#14B8A6" : "#0F766E",
      };
    case "BUY":
      return { bg: c.success, text: "#ffffff", border: c.success };
    case "WATCHLIST":
      return {
        bg: c.mode === "dark" ? "#2563EB" : "#1D4ED8",
        text: "#ffffff",
        border: c.accentPrimary,
      };
    case "HOLD":
      return { bg: "#B8860B", text: "#ffffff", border: "#B8860B" };
    case "NEUTRAL":
      return {
        bg: c.mode === "dark" ? "#475569" : "#64748B",
        text: "#ffffff",
        border: c.borderColor,
      };
    case "REDUCE":
      return { bg: c.warning, text: "#ffffff", border: c.warning };
    case "SELL":
      return {
        bg: c.mode === "dark" ? "#FF6B76" : "#F87171",
        text: "#ffffff",
        border: c.danger,
      };
    case "AVOID":
      return { bg: c.danger, text: "#ffffff", border: c.danger };

    // Legacy aliases
    case "STRONG_BUY":
      return { bg: c.success, text: "#ffffff", border: c.success };
    case "STRONG_SELL":
      return { bg: c.danger, text: "#ffffff", border: c.danger };

    case "INSUFFICIENT_DATA":
    default:
      return { bg: c.bgCard, text: c.textMuted, border: c.borderColor };
  }
}

// ── Trend-hold engine colors ────────────────────────────────────────────────
// Independent decision source (trend_hold_engine.py) -- deliberately its own
// palette, not reusing getRatingColors, so it never visually reads as "the
// rating" even by coincidence of shared styling.

export function getTrendHoldColors(decision: string | null | undefined, c: ThemePalette): RatingColorSet {
  switch (decision) {
    case "BUY":
      return { bg: c.success, text: "#ffffff", border: c.success };
    case "SCALE_OUT":
      return {
        bg: c.mode === "dark" ? "#7C3AED" : "#8B5CF6",
        text: "#ffffff",
        border: c.mode === "dark" ? "#7C3AED" : "#8B5CF6",
      };
    case "HOLD":
      return { bg: "#B8860B", text: "#ffffff", border: "#B8860B" };
    case "SELL_SIGNAL":
      return {
        bg: c.mode === "dark" ? "#FF6B76" : "#F87171",
        text: "#ffffff",
        border: c.danger,
      };
    case "WAIT":
    default:
      return { bg: c.bgCard, text: c.textMuted, border: c.borderColor };
  }
}

/** Single text color for the compact trend-hold cell in the scanner table. */
export function getTrendHoldTextColor(decision: string | null | undefined, c: ThemePalette): string {
  switch (decision) {
    case "BUY":
      return c.success;
    case "SCALE_OUT":
      return c.mode === "dark" ? "#A78BFA" : "#7C3AED";
    case "HOLD":
      return "#B8860B";
    case "SELL_SIGNAL":
      return c.danger;
    case "WAIT":
    default:
      return c.textMuted;
  }
}

/** Single text color for confidence numbers and small accents. */
export function getRatingTextColor(rating: string, c: ThemePalette): string {
  switch (rating) {
    case "CONTINUE_RISING":
      return c.accentSecondary;
    case "BUY":
    case "WATCHLIST":
      return c.success;
    case "REDUCE":
      return c.warning;
    case "SELL":
    case "AVOID":
      return c.danger;
    case "STRONG_BUY":
      return c.success;
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
    case "NEUTRAL_AMBIGUOUS":
      return { bg: c.bgCard, text: c.textMuted, dot: c.textMuted };

    case "ACCUMULATION":
      return { bg: c.bgCard, text: c.accentSecondary, dot: c.accentSecondary };

    case "EARLY_MARKUP":
      return { bg: c.bgCard, text: c.success, dot: c.success };

    case "MARKUP":
      return { bg: c.successBg, text: c.successText, dot: c.success };

    case "DISTRIBUTION":
      return { bg: c.warningBg, text: c.warning, dot: c.warning };

    case "MARKDOWN":
      return { bg: c.dangerBg, text: c.dangerText, dot: c.danger };

    case "INSUFFICIENT_HISTORY":
    case "INACTIVE_OR_DELISTED":
    case "INDICATOR_UNAVAILABLE":
      return { bg: c.bgCard, text: c.textMuted, dot: c.borderColor };

    // Legacy aliases
    case "DORMANT":
      return { bg: c.bgCard, text: c.textMuted, dot: c.textMuted };
    case "STEALTH_ACCUMULATION":
      return { bg: c.bgCard, text: c.accentSecondary, dot: c.accentSecondary };
    case "EARLY_BREAKOUT":
      return { bg: c.bgCard, text: c.success, dot: c.success };
    case "MARKUP_TRENDING":
      return { bg: c.successBg, text: c.successText, dot: c.success };
    case "ACCELERATION_CLIMAX":
    case "DISTRIBUTION_TOPPING":
      return { bg: c.warningBg, text: c.warning, dot: c.warning };
    case "MARKDOWN_DECLINE":
    case "CAPITULATION_EXHAUSTION":
      return { bg: c.dangerBg, text: c.dangerText, dot: c.danger };

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
