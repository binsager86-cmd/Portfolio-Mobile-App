export interface ActionInterpretationInput {
  rating?: string | null;
  continue_rising?: boolean | null;
  continue_rising_exhaustion_count?: number | null;
  risky_near_resistance?: boolean | null;
  risk_reward_ratio?: number | null;
  stage?: string | null;
}

export interface ActionInterpretation {
  action: string;
  detail: string;
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function isEarlyMarkupStage(stage: string): boolean {
  return stage === "EARLY_MARKUP" || stage === "TURNING_UP" || stage === "EARLY_BREAKOUT";
}

function isAccumulationStage(stage: string): boolean {
  return stage === "ACCUMULATION" || stage === "ACCUMULATING";
}

export function getActionInterpretation(row: ActionInterpretationInput): ActionInterpretation {
  const rating = normalize(row.rating);
  const stage = normalize(row.stage);
  const isRiding = Boolean(row.continue_rising);
  const exhaustionCount = Number.isFinite(row.continue_rising_exhaustion_count)
    ? Math.max(0, Number(row.continue_rising_exhaustion_count))
    : 0;
  const hasRiskFlag = typeof row.risky_near_resistance === "boolean";
  const rr = Number.isFinite(row.risk_reward_ratio) ? Number(row.risk_reward_ratio) : null;
  const isRisky = hasRiskFlag
    ? Boolean(row.risky_near_resistance)
    : rr != null
      ? rr < 2
      : false;

  const isAdvancingStage = stage === "MARKUP" || isEarlyMarkupStage(stage);
  if (isAdvancingStage) {
    if (exhaustionCount >= 2) {
      return {
        action:
          `If you own it: defend profits and trim. If you don't: stand aside (${Math.min(exhaustionCount, 3)}/3 exhaustion).`,
        detail:
          `Holding: defend profits - trim into strength; exit on a close below EMA20 without a quick reclaim. Not holding: stand aside - rally is showing exhaustion (${Math.min(exhaustionCount, 3)}/3 signals).`,
      };
    }

    if (isRiding) {
      const rrText = rr != null ? ` (R:R ${rr.toFixed(2)})` : "";
      const nonOwnerText = isRisky
        ? `Not holding: don't chase near resistance${rrText}; wait for a pullback to EMA20 that holds before entry.`
        : "Not holding: only enter on a pullback to EMA20 that holds; avoid chasing extension.";
      return {
        action: "If you own it: ride with trailing stop. If you don't: wait for pullback.",
        detail:
          `Holding: ride the trend. Trail stop ~1.5x ATR (atr_14). Add only on a pullback to EMA20 that holds. ${nonOwnerText}`,
      };
    }
  }

  if (rating === "BUY" || rating === "STRONG_BUY") {
    if (isRisky) {
      return {
        action: "Buy a small amount only - close to its ceiling. If you own it, hold",
        detail:
          "Price is close to resistance, so upside room is limited versus risk. New buyers should keep position size small and use a tight stop. Existing holders can hold, but avoid adding until resistance breaks cleanly.",
      };
    }
    if (isRiding) {
      return {
        action: "Good buy. If you own it, you can add",
        detail:
          "Trend structure is strong and confirmed. If you do not own it, this is a favorable entry. If you already own it, adding is reasonable with risk controls in place.",
      };
    }
    return {
      action: "Okay to buy now. Set a stop-loss",
      detail:
        "Setup is constructive enough for entry, but still needs disciplined risk management. Use a clear stop-loss under support and avoid oversizing.",
    };
  }

  if (rating === "WATCHLIST") {
    if (isRiding) {
      return {
        action: "Don't buy yet - wait for a dip. If you own it, hold",
        detail:
          "The structure is still positive, but this is not an ideal fresh entry level. Wait for a cleaner pullback or confirmation. Existing holders can continue to hold.",
      };
    }
    if (isEarlyMarkupStage(stage)) {
      return {
        action: "Too early to buy - wait for it to prove itself",
        detail:
          "Early turn signals are present but not strong enough yet. Let the move confirm before entering.",
      };
    }
    if (isAccumulationStage(stage)) {
      return {
        action: "Not yet - buy only if it breaks out",
        detail:
          "The stock is still basing. Keep it on watch and only act on a proper breakout with participation.",
      };
    }
    return {
      action: "Wait - not a buy yet",
      detail: "Current setup is not actionable for a new entry yet.",
    };
  }

  if (rating === "HOLD") {
    if (isRiding) {
      return {
        action: "If you own it, keep it but don't add. If you don't, wait",
        detail:
          "Trend is still intact, but momentum is cooling. Existing holders can hold with a trailing stop. New buyers should wait for a better entry.",
      };
    }
    return {
      action: "If you own it, keep holding. If you don't, no rush to buy",
      detail:
        "The setup supports maintaining existing exposure, not opening fresh positions aggressively.",
    };
  }

  if (rating === "NEUTRAL") {
    return {
      action: "No clear signal - skip it for now",
      detail:
        "Signals are mixed and edge is unclear. Wait for a cleaner setup.",
    };
  }

  if (rating === "REDUCE") {
    return {
      action: "If you own it, sell some. If you don't, stay away",
      detail:
        "Conditions are weakening. Existing holders should reduce exposure. New entries are not favored.",
    };
  }

  if (rating === "SELL") {
    return {
      action: "If you own it, sell. If you don't, don't buy",
      detail: "Downtrend risk is elevated. Exit long exposure and avoid new long entries.",
    };
  }

  if (rating === "STRONG_SELL") {
    return {
      action: "Get out if you own it. Avoid otherwise",
      detail: "The downtrend is strong and established. This is not a long setup.",
    };
  }

  if (rating === "AVOID") {
    return {
      action: "Skip - not reliable enough to trade",
      detail: "Liquidity or data quality is too weak for dependable execution.",
    };
  }

  return {
    action: "Wait - not a buy yet",
    detail: "Current setup is not actionable for a new entry yet.",
  };
}
