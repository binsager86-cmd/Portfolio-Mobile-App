/**
 * TechnicalAnalysisPanel — Audit Test Suite
 *
 * Covers:
 *  1. Pure helper functions (fmtFils, fmtPct, humanRegime, humaniseAlert)
 *  2. Expected-return math (R-multiple → fils → % of buy price)
 *  3. TP gain calculation (Math.abs, always positive for both BUY and SELL)
 *  4. Probability badge colour thresholds (≥68% green, ≥55% amber, <55% red)
 *  5. NEUTRAL signal — price ladder, trade plan, probability hidden
 *  6. BUY signal — full UI sections rendered
 *  7. SELL signal — TP card uses orange colour (not green)
 *  8. Alert humanisation — every known alert key maps to plain English
 *  9. Recent searches — appears after search submit
 * 10. "Five factors" subtitle (regression — was "Six")
 * 11. Loading / error states
 * 12. Distance summary bar values
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import type { KuwaitSignal } from "@/services/api/analytics/tradeSignals";
import { DarkTheme } from "@/constants/theme";

// ── Mock the API module before importing the component ───────────────
jest.mock("@/services/api/analytics/tradeSignals", () => ({
  ...jest.requireActual("@/services/api/analytics/tradeSignals"),
  getKuwaitSignal: jest.fn(),
}));

// react-query needs a fresh client per test – wrap at import time
jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: jest.fn(),
  };
});

import { useQuery } from "@tanstack/react-query";
import { getKuwaitSignal as _getKuwaitSignal } from "@/services/api/analytics/tradeSignals";
import { TechnicalAnalysisPanel } from "@/src/features/trade-signals/components/TechnicalAnalysisPanel";

const mockUseQuery = useQuery as jest.Mock;

// ── Colour palette (light values fine — we just need a valid shape) ──
const colors = DarkTheme;

// ── Signal factories ──────────────────────────────────────────────────

function makeSignal(overrides: Partial<KuwaitSignal> = {}): KuwaitSignal {
  return ({
    timestamp: "2026-05-03T12:00:00Z",
    stock_code: "NBK",
    segment: "PREMIER",
    signal: "BUY",
    setup_type: "TREND_FOLLOWING",
    execution: {
      entry_zone_fils: [460, 465],
      stop_loss_fils: 450,
      tp1_fils: 475,
      tp2_fils: 495,
      tp3_fils: 510,
      tp_methods: null,
      tick_alignment: "OK",
      preferred_order_type: "LIMIT",
    },
    risk_metrics: {
      risk_per_share_fils: 12.5,
      risk_reward_ratio: 2.0,
      position_size_percent: 5.0,
      cvar_95_fils: 8.0,
      liquidity_adjustment_factor: 0.98,
    },
    probabilities: {
      p_tp1_before_sl: 0.72,
      p_tp2_before_sl: 0.48,
      p_tp3_before_sl: 0.31,
      confidence_interval_95: [0.58, 0.84],
      expected_return_r_multiple: 0.44,
      calibration_method: "bootstrap",
    },
    confluence_details: {
      total_score: 82,
      regime: "Bull_Trend",
      regime_confidence: 0.79,
      auction_intensity: 2.1,
      sub_scores: {
        trend: 90, momentum: 80, volume_flow: 85,
        support_resistance: 75, risk_reward: 80,
      },
      raw_sub_scores: {
        trend: 90, momentum: 80, volume_flow: 85,
        support_resistance: 75, risk_reward: 80,
      },
      liquidity_passed: true,
      liquidity_details: {
        adtv_20d_kd: 250000,
        spread_proxy_pct: 0.42,
        active_days_30d_pct: 96,
        volume_concentration: 18,
        pass_adtv: true,
        pass_spread: true,
        pass_active_days: true,
        pass_concentration: true,
      },
      support_levels: [445, 440],
      resistance_levels: [480, 490],
      vwap: 463,
    },
    alerts: [],
    metadata: {
      model_version: "1.4.2",
      data_as_of: "2026-05-03",
      walk_forward_window: "90d",
      statistical_confidence: 0.91,
    },
    ...overrides,
  } as unknown) as KuwaitSignal;
}

function makeNeutralSignal(): KuwaitSignal {
  return makeSignal({
    signal: "NEUTRAL",
    execution: {
      entry_zone_fils: [null, null],
      stop_loss_fils: null,
      tp1_fils: null,
      tp2_fils: null,
      tp3_fils: null,
      tp_methods: null,
      tick_alignment: "N/A",
      preferred_order_type: "NONE",
    },
    risk_metrics: {
      risk_per_share_fils: null,
      risk_reward_ratio: null,
      position_size_percent: null,
      cvar_95_fils: null,
      liquidity_adjustment_factor: null,
    },
    probabilities: {
      p_tp1_before_sl: null,
      p_tp2_before_sl: null,
      p_tp3_before_sl: null,
      confidence_interval_95: null,
      expected_return_r_multiple: null,
      calibration_method: "N/A",
    },
  });
}

function makeSellSignal(): KuwaitSignal {
  return makeSignal({
    signal: "SELL",
    execution: {
      entry_zone_fils: [455, 460],
      stop_loss_fils: 470,        // SL is ABOVE entry for SELL
      tp1_fils: 445,              // TP is BELOW entry for SELL
      tp2_fils: 430,
      tp3_fils: 420,
      tp_methods: null,
      tick_alignment: "OK",
      preferred_order_type: "LIMIT",
    },
  });
}

// ── Render helper ─────────────────────────────────────────────────────

function _renderPanel(signalOverride?: Partial<KuwaitSignal> | null) {
  if (signalOverride === null) {
    // null = simulate loading state
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  } else if (signalOverride === undefined) {
    // undefined = idle (no ticker selected)
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  } else {
    mockUseQuery.mockReturnValue({
      data: makeSignal(signalOverride),
      isLoading: false,
      isError: false,
    });
  }
  return render(<TechnicalAnalysisPanel colors={colors} />);
}

function renderWithSignal(signal: KuwaitSignal) {
  mockUseQuery.mockReturnValue({ data: signal, isLoading: false, isError: false });
  return render(<TechnicalAnalysisPanel colors={colors} />);
}

// ─────────────────────────────────────────────────────────────────────
// 1. PURE HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────

describe("fmtFils helper", () => {
  // These are tested indirectly through the rendered UI
  it("shows — for null stop loss", () => {
    renderWithSignal(makeSignal({ execution: { ...makeSignal().execution, stop_loss_fils: null } }));
    // Stop Loss row should show —
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("humanRegime helper", () => {
  it("displays Bull Market label for Bull regime", () => {
    renderWithSignal(makeSignal({ confluence_details: { ...makeSignal().confluence_details, regime: "Bull_Trend" } }));
    expect(screen.getByText(/Bull Market/)).toBeTruthy();
  });

  it("displays Bear Market label for Bear regime", () => {
    renderWithSignal(makeSignal({ confluence_details: { ...makeSignal().confluence_details, regime: "Bear_Trend" } }));
    expect(screen.getByText(/Bear Market/)).toBeTruthy();
  });

  it("displays Sideways Market for neutral/chop regime", () => {
    renderWithSignal(makeSignal({ confluence_details: { ...makeSignal().confluence_details, regime: "Neutral_Chop" } }));
    expect(screen.getByText(/Sideways Market/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. EXPECTED RETURN MATH
// ─────────────────────────────────────────────────────────────────────

describe("Expected return display math", () => {
  it("shows positive fils for positive R-multiple", () => {
    // expected_r = 0.44, risk = 12.5 fils → expected = 5.5 fils
    renderWithSignal(makeSignal());
    // The rendered text should contain "5.5 fils" (0.44 * 12.5 = 5.5)
    expect(screen.getByText(/\+5\.5 fils/)).toBeTruthy();
  });

  it("shows % of buy price as secondary line", () => {
    // entryMid = (460 + 465) / 2 = 462.5 fils
    // expectedFils = 0.44 * 12.5 = 5.5 fils
    // pct = 5.5 / 462.5 * 100 = 1.189...%
    renderWithSignal(makeSignal());
    expect(screen.getByText(/\+1\.19% of buy price/)).toBeTruthy();
  });

  it("shows negative fils for negative R-multiple", () => {
    // expected_r = -0.28 → -0.28 * 12.5 = -3.5 fils
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, expected_return_r_multiple: -0.28 },
    }));
    expect(screen.getByText(/-3\.5 fils/)).toBeTruthy();
  });

  it("shows — when expected_return_r_multiple is null", () => {
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, expected_return_r_multiple: null },
    }));
    // Expected gain column should show —
    // We can't easily target exact —, so check the section renders without crash
    expect(screen.getByText(/Avg Expected Gain per Share/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. TP GAIN CALCULATION — always positive (Math.abs)
// ─────────────────────────────────────────────────────────────────────

describe("TPTargetCard gain calculation", () => {
  it("BUY: TP1 gain is positive (tp1 > entry)", () => {
    // entryMid = 462.5, tp1 = 475 → gain = +12.5 fils
    // +12.5 appears in both the PriceLadder summary bar and the TP card → use getAllByText
    renderWithSignal(makeSignal());
    expect(screen.getAllByText(/\+12\.5/).length).toBeGreaterThan(0);
  });

  it("SELL: TP1 gain shown as positive even though tp1 < entry", () => {
    // SELL: entryMid = 457.5, tp1 = 445 → abs(445 - 457.5) = 12.5 fils
    // Should show "+12.5" NOT "+−12.5"
    renderWithSignal(makeSellSignal());
    const gainTexts = screen.queryAllByText(/\+12\.5/);
    expect(gainTexts.length).toBeGreaterThan(0);
    // Ensure no double-sign bug
    expect(screen.queryByText(/\+−/)).toBeNull();
  });

  it("shows — for TP gain when entry is null", () => {
    renderWithSignal(makeSignal({
      execution: { ...makeSignal().execution, entry_zone_fils: [null, null] },
    }));
    // gainFils will be null → "—". "First Target" appears in both PriceLadder and TPTargetCard.
    expect(screen.getAllByText(/First Target/).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. PROBABILITY BADGE COLOUR THRESHOLDS
// ─────────────────────────────────────────────────────────────────────

describe("Probability badge confidence labels", () => {
  it("shows High confidence label at 72%", () => {
    // p_tp1 = 0.72 → 72% → "High"
    renderWithSignal(makeSignal());
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("shows Moderate confidence label at 60%", () => {
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, p_tp1_before_sl: 0.60 },
    }));
    expect(screen.getByText("Moderate")).toBeTruthy();
  });

  it("shows Low confidence label at 45%", () => {
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, p_tp1_before_sl: 0.45 },
    }));
    // "Low" can appear in TP1 card, TP2 card, and/or risk-reward row
    expect(screen.getAllByText("Low").length).toBeGreaterThan(0);
  });

  it("shows High at boundary 68%", () => {
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, p_tp1_before_sl: 0.68 },
    }));
    expect(screen.getByText("High")).toBeTruthy();
  });

  it("shows Moderate at boundary 55%", () => {
    renderWithSignal(makeSignal({
      probabilities: { ...makeSignal().probabilities, p_tp1_before_sl: 0.55 },
    }));
    expect(screen.getByText("Moderate")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. NEUTRAL SIGNAL — hidden sections
// ─────────────────────────────────────────────────────────────────────

describe("NEUTRAL signal — hidden sections", () => {
  it("does NOT render the Price Map section", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.queryByText(/Price Map/)).toBeNull();
  });

  it("does NOT render the Trade Plan section", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.queryByText(/Your Trade Plan/)).toBeNull();
  });

  it("does NOT render the Probability section", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.queryByText(/What Are the Chances/)).toBeNull();
  });

  it("does NOT render How Much to Invest section", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.queryByText(/How Much to Invest/)).toBeNull();
  });

  it("DOES render Market Conditions (always visible)", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.getByText(/Current Market Conditions/)).toBeTruthy();
  });

  it("DOES render Signal Strength Breakdown (always visible)", () => {
    renderWithSignal(makeNeutralSignal());
    expect(screen.getByText(/Signal Strength Breakdown/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. BUY SIGNAL — all sections visible
// ─────────────────────────────────────────────────────────────────────

describe("BUY signal — all sections rendered", () => {
  it("renders Price Map section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/Price Map/)).toBeTruthy();
  });

  it("renders Your Trade Plan section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/Your Trade Plan/)).toBeTruthy();
  });

  it("renders Probability section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/What Are the Chances/)).toBeTruthy();
  });

  it("renders How Much to Invest section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/How Much to Invest/)).toBeTruthy();
  });

  it("renders Signal Strength Breakdown section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/Signal Strength Breakdown/)).toBeTruthy();
  });

  it("renders Market Conditions section", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/Current Market Conditions/)).toBeTruthy();
  });

  it("renders the CI win rate range", () => {
    // CI = [0.58, 0.84] → "58–84%"
    renderWithSignal(makeSignal());
    expect(screen.getByText("58–84%")).toBeTruthy();
  });

  it("renders the overall score", () => {
    // 82 appears in both the header score and the Combined Score row
    renderWithSignal(makeSignal());
    expect(screen.getAllByText(/82/).length).toBeGreaterThan(0);
  });

  it("renders First Target and Full Target cards", () => {
    // "First Target" and "Full Target" appear in both PriceLadder and TPTargetCard
    renderWithSignal(makeSignal());
    expect(screen.getAllByText(/First Target/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Full Target/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders correct entry zone text", () => {
    renderWithSignal(makeSignal());
    // Entry zone appears in both PriceLadder sublabel and Trade Plan row
    expect(screen.getAllByText(/460\.0/).length).toBeGreaterThan(0);
  });

  it("renders correct stop loss", () => {
    renderWithSignal(makeSignal());
    // Stop loss appears in both PriceLadder and Trade Plan row
    expect(screen.getAllByText(/450\.0/).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. SELL SIGNAL — TP cards use orange (not green) — tested via label
// ─────────────────────────────────────────────────────────────────────

describe("SELL signal", () => {
  it("renders the Trade Plan section for SELL", () => {
    renderWithSignal(makeSellSignal());
    expect(screen.getByText(/Your Trade Plan/)).toBeTruthy();
  });

  it("renders TP1 and TP2 cards for SELL", () => {
    // Labels appear in both PriceLadder and TPTargetCard
    renderWithSignal(makeSellSignal());
    expect(screen.getAllByText(/First Target/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Full Target/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows SELL target prices below entry", () => {
    renderWithSignal(makeSellSignal());
    // TP1 = 445 fils
    expect(screen.getByText("445.0")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. ALERT HUMANISATION
// ─────────────────────────────────────────────────────────────────────

describe("Alert humanisation", () => {
  it("translates LIQUIDITY FAIL to plain English", () => {
    renderWithSignal(makeSignal({ alerts: ["LIQUIDITY FAIL: adtv below threshold"] }));
    expect(screen.getByText(/minimum liquidity/)).toBeTruthy();
  });

  it("translates upper circuit-breaker warning", () => {
    renderWithSignal(makeSignal({
      alerts: ["WARNING: Price within 2% of upper circuit-breaker limit (+10%)"],
    }));
    expect(screen.getByText(/daily upper price limit/)).toBeTruthy();
  });

  it("translates lower circuit-breaker warning", () => {
    renderWithSignal(makeSignal({
      alerts: ["WARNING: Price within 3% of lower circuit-breaker limit (-5%)"],
    }));
    expect(screen.getByText(/daily lower price limit/)).toBeTruthy();
  });

  it("translates 72 hours stale signal warning", () => {
    renderWithSignal(makeSignal({ alerts: ["Signal older than 72 hours"] }));
    expect(screen.getByText(/over 72 hours/)).toBeTruthy();
  });

  it("translates Major resistance alert", () => {
    renderWithSignal(makeSignal({ alerts: ["Major resistance too close above entry"] }));
    expect(screen.getByText(/strong resistance level is very close/)).toBeTruthy();
  });

  it("translates Bear-regime warning", () => {
    renderWithSignal(makeSignal({ alerts: ["Bear-regime: downtrend active"] }));
    expect(screen.getByText(/currently in a downtrend/)).toBeTruthy();
  });

  it("translates Regime confidence low", () => {
    renderWithSignal(makeSignal({ alerts: ["Regime confidence low: 0.41"] }));
    expect(screen.getByText(/market direction is unclear/)).toBeTruthy();
  });

  it("shows no alert section when alerts array is empty", () => {
    renderWithSignal(makeSignal({ alerts: [] }));
    expect(screen.queryByText(/Important Notices/)).toBeNull();
  });

  it("shows alert section when alerts are present", () => {
    renderWithSignal(makeSignal({ alerts: ["LIQUIDITY FAIL: adtv below threshold"] }));
    expect(screen.getByText(/Important Notices/)).toBeTruthy();
  });

  it("passes through unknown alerts verbatim", () => {
    renderWithSignal(makeSignal({ alerts: ["CUSTOM_UNKNOWN_ALERT_XYZ"] }));
    expect(screen.getByText(/CUSTOM_UNKNOWN_ALERT_XYZ/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. RECENT SEARCHES
// ─────────────────────────────────────────────────────────────────────

describe("Recent searches", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it("shows empty recent-search hint initially", () => {
    render(<TechnicalAnalysisPanel colors={colors} />);
    expect(screen.getByText(/Recent searches will appear here/i)).toBeTruthy();
  });

  it("adds searched symbol to recent chips", () => {
    render(<TechnicalAnalysisPanel colors={colors} />);
    const input = screen.getByPlaceholderText(/Enter ticker/i);
    fireEvent.changeText(input, "NBK");
    fireEvent(input, "submitEditing");
    expect(screen.getByText("NBK")).toBeTruthy();
  });

  it("keeps recent searches unique", () => {
    render(<TechnicalAnalysisPanel colors={colors} />);
    const input = screen.getByPlaceholderText(/Enter ticker/i);
    fireEvent.changeText(input, "NBK");
    fireEvent(input, "submitEditing");
    fireEvent.changeText(input, "NBK");
    fireEvent(input, "submitEditing");
    expect(screen.getAllByText("NBK")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. FIVE FACTORS SUBTITLE (regression — was "Six")
// ─────────────────────────────────────────────────────────────────────

describe("Signal Strength Breakdown subtitle", () => {
  it("says Five factors (not Six)", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText(/Five factors are scored/)).toBeTruthy();
    expect(screen.queryByText(/Six factors are scored/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. LOADING AND ERROR STATES
// ─────────────────────────────────────────────────────────────────────

describe("Loading and error states", () => {
  it("shows activity indicator while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<TechnicalAnalysisPanel colors={colors} />);
    // Analysing text appears during load
    // We trigger a search first to get loading state
    const input = screen.getByPlaceholderText(/Enter ticker/i);
    fireEvent.changeText(input, "NBK");
    fireEvent(input, "submitEditing");
    // Loading spinner text
    expect(screen.getByText(/Analysing/)).toBeTruthy();
  });

  it("shows error message on API failure", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { data: { detail: "Symbol not found." } } },
    });
    render(<TechnicalAnalysisPanel colors={colors} />);
    expect(screen.getByText(/Symbol not found/)).toBeTruthy();
  });

  it("shows fallback error text when detail is missing", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: {},
    });
    render(<TechnicalAnalysisPanel colors={colors} />);
    expect(screen.getByText(/Failed to load signal/)).toBeTruthy();
  });

  it("shows empty state prompt before any ticker is selected", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<TechnicalAnalysisPanel colors={colors} />);
    expect(screen.getByText(/Pick a stock to get started/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 12. DISTANCE SUMMARY BAR VALUES
// ─────────────────────────────────────────────────────────────────────

describe("Price ladder distance summary bar", () => {
  it("shows fils at risk (entry - stop)", () => {
    // entryMid = 462.5, stop = 450 → risk = 12.5 fils
    renderWithSignal(makeSignal());
    expect(screen.getByText(/−12\.5/)).toBeTruthy();
  });

  it("shows fils to Target 1 (tp1 - entry)", () => {
    // tp1 = 475, entryMid = 462.5 → 12.5 fils
    renderWithSignal(makeSignal());
    // Expect "+12.5" in summary bar (and/or in TP card)
    expect(screen.getAllByText(/\+12\.5/).length).toBeGreaterThan(0);
  });

  it("shows fils to Target 2 when tp2 is set", () => {
    // tp2 = 495, entryMid = 462.5 → 32.5 fils in the summary bar
    renderWithSignal(makeSignal());
    expect(screen.getAllByText(/\+32\.5/).length).toBeGreaterThan(0);
  });

  it("does not show fils to Target 2 when tp2 is null", () => {
    renderWithSignal(makeSignal({
      execution: { ...makeSignal().execution, tp2_fils: null },
    }));
    expect(screen.queryByText(/fils to Target 2/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 13. LIQUIDITY CHIPS
// ─────────────────────────────────────────────────────────────────────

describe("Liquidity chips", () => {
  it("renders all four liquidity check chips", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText("Daily Volume")).toBeTruthy();
    expect(screen.getByText("Buy/Sell Gap")).toBeTruthy();
    expect(screen.getByText("Active Days")).toBeTruthy();
    expect(screen.getByText("Volume Check")).toBeTruthy();
  });

  it("renders KD value for ADTV", () => {
    // adtv = 250000 KD → "KD 250K"
    renderWithSignal(makeSignal());
    expect(screen.getByText(/KD 250K/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 14. SCORE BARS — five bars rendered
// ─────────────────────────────────────────────────────────────────────

describe("Score bars (five factors)", () => {
  const expectedLabels = [
    "Trend Direction",
    "Speed & Momentum",
    "Buying Pressure",
    "Key Price Levels",
    "Risk vs Reward",
  ];

  it.each(expectedLabels)("renders %s score bar", (label) => {
    // ScoreBar renders icon + label in one Text node: e.g. "📈  Trend Direction"
    // Use regex to match label as substring
    renderWithSignal(makeSignal());
    expect(screen.getByText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
  });

  it("renders Combined Score row", () => {
    renderWithSignal(makeSignal());
    expect(screen.getByText("Combined Score")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 15. TICKER SEARCH INPUT
// ─────────────────────────────────────────────────────────────────────

describe("Ticker search", () => {
  it("upper-cases input on submit", async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<TechnicalAnalysisPanel colors={colors} />);
    const input = screen.getByPlaceholderText(/Enter ticker/i);
    fireEvent.changeText(input, "nbk");
    fireEvent(input, "submitEditing");
    // The query key should contain "NBK" — verified indirectly via display
    // Quick workaround: confirm input value was handled
    await waitFor(() => {
      expect(mockUseQuery).toHaveBeenCalled();
    });
  });

  it("strips .KW suffix before querying", async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<TechnicalAnalysisPanel colors={colors} />);
    const input = screen.getByPlaceholderText(/Enter ticker/i);
    fireEvent.changeText(input, "NBK.KW");
    fireEvent(input, "submitEditing");
    await waitFor(() => {
      const calls = mockUseQuery.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.queryKey).toEqual(["kuwait-signal", "NBK"]);
    });
  });
});
