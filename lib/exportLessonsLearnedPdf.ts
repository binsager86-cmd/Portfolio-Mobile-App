/**
 * exportLessonsLearnedPdf — Generate a branded PDF of the Trend-Hold Book's
 * (or V1 Rating Book's) post-trade "autopsy" log: the same classification,
 * excursion metrics, entry-quality context, and evidence-backed enhancement
 * text shown on the Lessons Learned screen, laid out as a document that can
 * be saved and referenced later.
 *
 * Uses jsPDF (Helvetica built-in), same pattern as exportGrowthPdf.ts /
 * exportMetricsPdf.ts. Works cross-platform: web triggers a browser
 * download, native writes to the app's document directory and opens the
 * share sheet (see the platform branch at the bottom).
 */

import { todayISO } from "@/lib/dateUtils";
import { sanitizePdfText } from "@/lib/sanitizePdf";
import { Platform } from "react-native";
import { jsPDF } from "jspdf";

import type { TrendHoldBookLesson, TrendHoldBookLessonsSummary, TrendHoldBookPosition } from "@/hooks/useTrendHoldBook";

// ── Input ────────────────────────────────────────────────────────────

export interface LessonsReportInput {
  bookLabel: string; // "Trend-Hold" | "V1 Rating"
  lessons: TrendHoldBookLesson[];
  summary?: TrendHoldBookLessonsSummary | null;
  // Still-open positions -- included so every trade (open or closed) shows
  // a buy price, not just the ones that have exited. Undefined/empty for
  // books with no position concept in this report (falls back to omitting
  // the section rather than rendering it empty).
  positions?: TrendHoldBookPosition[];
}

const ENTRY_PATH_LABEL: Record<string, string> = { DONCHIAN: "Donchian breakout", EMA_CROSS: "EMA10/30 cross" };

function fmtPct(v: number | null | undefined, digits = 1): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined, digits = 3): string {
  return v == null ? "—" : v.toFixed(digits);
}

// ── Palette — mirrors the in-app Trend-Hold Book KPI identity (violet /
// amber, deliberately not green/blue, so a saved report still reads as
// "simulated" at a glance) with semantic green/red kept separate. ──────

const C = {
  headerBg: "#211D2F",
  primary: "#7C3AED",
  primaryLight: "#EDE4FD",
  gold: "#B45309",
  goldLight: "#FBEEDD",
  success: "#047857",
  successLight: "#D9F1E7",
  danger: "#BE123C",
  dangerLight: "#FBE1E8",
  muted: "#6C6178",
  border: "#E1D8ED",
  textDark: "#211D2F",
  textMedium: "#4A4257",
  textLight: "#8F8598",
  white: "#FFFFFF",
  altRow: "#F8F5FC",
  cardBg: "#FFFFFF",
} as const;

const OUTCOME_COLOR: Record<string, string> = {
  WIN: C.success,
  LOSS: C.danger,
  PARTIAL: C.primary,
  UNKNOWN: C.muted,
};

const PAGE_MX = 14;
const PAGE_HEADER_H = 26;
const PAGE_FOOTER_H = 12;
const SECTION_GAP = 8;
const LINE_H = 3.6;

// ── Drawing primitives (same shape as exportGrowthPdf.ts) ───────────────

function lightenHex(hex: string, amount = 0.85): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  doc.setFillColor(fill);
  if (stroke) {
    doc.setDrawColor(stroke);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, r, r, "FD");
  } else {
    doc.roundedRect(x, y, w, h, r, r, "F");
  }
}

function drawBadge(doc: jsPDF, x: number, y: number, text: string, bg: string, fg: string) {
  doc.setFontSize(7);
  const tw = doc.getTextWidth(text);
  const pw = tw + 6;
  drawRoundedRect(doc, x, y - 3.5, pw, 6, 1.5, bg);
  doc.setTextColor(fg);
  doc.text(text, x + 3, y);
  return pw;
}

function classificationLabel(cls: string): string {
  return cls
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Main export ──────────────────────────────────────────────────────

export async function exportLessonsLearnedPdf(input: LessonsReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const mx = PAGE_MX;
  const cw = W - mx * 2;
  const maxY = H - PAGE_FOOTER_H;
  let y = 0;

  const { bookLabel, lessons, summary } = input;
  const closed = summary?.total_closed ?? lessons.length;
  const wins = summary?.by_outcome?.WIN ?? lessons.filter((l) => l.outcome === "WIN").length;
  const losses = summary?.by_outcome?.LOSS ?? lessons.filter((l) => l.outcome === "LOSS").length;
  const partial = summary?.by_outcome?.PARTIAL ?? lessons.filter((l) => l.outcome === "PARTIAL").length;

  // ── Page header / footer ──────────────────────────────────────────
  function drawPageHeader() {
    doc.setFillColor(C.headerBg);
    doc.rect(0, 0, W, PAGE_HEADER_H, "F");
    doc.setFillColor(C.primary);
    doc.rect(0, PAGE_HEADER_H, W, 1.2, "F");

    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(C.white);
    doc.text("Trade Autopsy Report", mx, 12);

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor("#C9BEE0");
    doc.text(`${sanitizePdfText(bookLabel, 30)} Book — Lessons Learned`, mx, 20);

    drawBadge(doc, W - mx - 40, 11, `${closed} CLOSED`, C.primary, C.white);
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    doc.setFontSize(7.5).setTextColor("#C9BEE0");
    doc.text(today, W - mx, 21, { align: "right" });
  }

  function drawPageFooter(p: number, total: number) {
    doc.setPage(p);
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.2);
    doc.line(mx, H - 10, mx + cw, H - 10);
    doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textLight);
    doc.text("Eagle Eye V2 — Trend-Hold Book — simulated, virtual capital only", mx, H - 6);
    doc.text(`Page ${p} of ${total}`, W - mx, H - 6, { align: "right" });
  }

  function ensureSpace(needed: number) {
    if (y + needed > maxY) {
      doc.addPage();
      drawPageHeader();
      y = PAGE_HEADER_H + 6;
    }
  }

  drawPageHeader();
  y = PAGE_HEADER_H + 6;

  // ── Overview / KPI strip ─────────────────────────────────────────
  const overviewH = 24;
  ensureSpace(overviewH + 4);
  drawRoundedRect(doc, mx, y, cw, overviewH, 3, lightenHex(C.primary, 0.93), C.primary);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.primary);
  doc.text("Overview", mx + 8, y + 8);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(C.textMedium);
  const kpiLine1 = `${closed} closed trades   |   ${wins}W / ${losses}L / ${partial} scale-outs`;
  doc.text(kpiLine1, mx + 8, y + 15.5);
  // Profit-maximization headline leads, per this system's stated priority
  // (maximizing profit and win rate ahead of loss diagnostics) -- loss
  // stats stay in the same line but come last.
  const kpiBits: string[] = [];
  if (summary?.avg_pct_left_on_table != null) {
    kpiBits.push(
      `Profit left on table ${summary.avg_pct_left_on_table.toFixed(1)}pp avg (${summary.trades_with_room_to_improve ?? 0} had room)`,
    );
  }
  if (summary?.avg_entry_confidence_win != null || summary?.avg_entry_confidence_loss != null) {
    kpiBits.push(
      `Entry confidence win/loss ${summary?.avg_entry_confidence_win?.toFixed(0) ?? "—"} vs ${summary?.avg_entry_confidence_loss?.toFixed(0) ?? "—"}`,
    );
  }
  if (summary?.avg_loss_mae_pct != null) kpiBits.push(`Avg loss drawdown -${summary.avg_loss_mae_pct.toFixed(1)}%`);
  if (kpiBits.length) doc.text(kpiBits.join("   |   "), mx + 8, y + 21, { maxWidth: cw - 16 });
  y += overviewH + SECTION_GAP;

  // ── Trading-model disclosure: no fixed target price, and which gate
  // indicators are lagging vs same-session. System-level facts, stated
  // once here rather than repeated on every trade card. ─────────────────
  const disclosureText =
    "No fixed take-profit target is set at entry — this system exits only via the chandelier trailing stop " +
    "(3.5×ATR14 off the post-entry high) or the automatic +20% profit-milestone scale-out. The stop level shown " +
    "per trade is what actually governed the exit, not a target.";
  const lagText =
    "Indicator lag: EMA10/30/50, the Donchian-40 ceiling, ATR14, CMF10, OBV-slope40, and SMA200-slope are all " +
    "lagging (built from trailing price/volume history — they confirm a move already in progress, never predict " +
    "one). Relative-volume(20d) is same-session. ADX14 is regime context only, not a gate — like RSI14, it does " +
    "not fire or block any decision today.";
  const disclosureLines = doc.setFont("helvetica", "normal").setFontSize(7).splitTextToSize(disclosureText, cw - 16) as string[];
  const lagLines = doc.setFont("helvetica", "normal").setFontSize(7).splitTextToSize(lagText, cw - 16) as string[];
  const disclosureBoxH = (disclosureLines.length + lagLines.length) * LINE_H + 10;
  ensureSpace(disclosureBoxH + 4);
  drawRoundedRect(doc, mx, y, cw, disclosureBoxH, 2.5, C.altRow, C.border);
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.textDark);
  doc.text("How this system trades", mx + 6, y + 5);
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textMedium);
  doc.text(disclosureLines, mx + 6, y + 9.5);
  doc.text(lagLines, mx + 6, y + 9.5 + disclosureLines.length * LINE_H + 3);
  y += disclosureBoxH + SECTION_GAP;

  // ── By entry path / by ADX bucket mini-tables ─────────────────────
  function drawBucketTable(title: string, buckets: Record<string, { closed: number; wins: number; losses: number; win_rate_pct?: number | null }> | undefined, labelFor: (k: string) => string) {
    const entries = Object.entries(buckets ?? {});
    if (!entries.length) return;
    const rowH = 6;
    const tableH = 9 + entries.length * rowH + 3;
    ensureSpace(tableH + 4);
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(C.textDark);
    doc.text(title, mx, y + 4);
    y += 7;
    for (let i = 0; i < entries.length; i++) {
      const [key, s] = entries[i];
      if (i % 2 === 0) {
        doc.setFillColor(C.altRow);
        doc.rect(mx, y, cw, rowH, "F");
      }
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.textMedium);
      doc.text(sanitizePdfText(labelFor(key), 40), mx + 4, y + 4.2);
      const rate = s.win_rate_pct != null ? `${s.win_rate_pct.toFixed(0)}% win rate` : "not enough data yet";
      doc.text(`${s.wins}W / ${s.losses}L  ·  ${rate}  (${s.closed} closed)`, mx + cw - 4, y + 4.2, { align: "right" });
      y += rowH;
    }
    y += SECTION_GAP - 2;
  }

  const ADX_BUCKET_LABEL: Record<string, string> = {
    WEAK_LT20: "Weak trend (ADX < 20)",
    MODERATE_20_40: "Moderate trend (ADX 20-40)",
    STRONG_GT40: "Strong trend (ADX > 40)",
  };
  drawBucketTable("By entry path", summary?.by_entry_path, (k) => ENTRY_PATH_LABEL[k] ?? k);
  drawBucketTable("By trend strength at entry", summary?.by_adx_bucket, (k) => ADX_BUCKET_LABEL[k] ?? k);

  // ── Open positions — every trade should state a buy price, including
  // ones that haven't sold yet. No sell price/PnL exists until it closes;
  // the current trailing-stop level is shown instead of a target price
  // (this system doesn't set one). ─────────────────────────────────────
  const positions = input.positions ?? [];
  if (positions.length > 0) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(C.textDark);
    doc.text(`Open Positions (${positions.length})`, mx, y + 5);
    y += 10;

    for (const pos of positions) {
      const hasEntryCtx = pos.entry_path != null || pos.entry_confidence != null;
      const hasGateDetail = pos.rel_volume_entry != null || pos.cmf10_entry != null || pos.adx14_entry != null;
      const rowH = 6.5;
      const entryCtxH = hasEntryCtx ? 5.2 : 0;
      const gateH = hasGateDetail ? 5.2 : 0;
      const posCardH = 9 + rowH + entryCtxH + gateH + 4;

      ensureSpace(posCardH + 4);
      const cardTop = y;
      drawRoundedRect(doc, mx, y, cw, posCardH, 2.5, C.cardBg, C.border);

      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(C.textDark);
      doc.text(sanitizePdfText(pos.ticker, 20), mx + 5, y + 6.5);
      drawBadge(doc, mx + 5 + doc.getTextWidth(sanitizePdfText(pos.ticker, 20)) + 6, y + 6.5, "OPEN", lightenHex(C.primary, 0.85), C.primary);
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.textLight);
      doc.text(`opened ${sanitizePdfText(pos.opened_date ?? "—", 12)}`, mx + cw - 4, y + 6.5, { align: "right" });
      y += 9;

      const rowBits = [`Bought ${fmtNum(pos.avg_cost, 3)}`, `Qty ${pos.quantity.toFixed(2)}`];
      if (pos.latest_close != null) rowBits.push(`Now ${fmtNum(pos.latest_close, 3)}`);
      if (pos.unrealized_pnl_kwd != null) {
        rowBits.push(`Unrealized ${pos.unrealized_pnl_kwd >= 0 ? "+" : ""}${pos.unrealized_pnl_kwd.toFixed(3)} KWD`);
      }
      if (pos.structural_stop != null) rowBits.push(`Current stop ${pos.structural_stop.toFixed(3)}`);
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(C.textDark);
      doc.text(rowBits.join("   ·   "), mx + 5, y + 3.6);
      y += rowH;

      if (hasEntryCtx) {
        const bits: string[] = [];
        if (pos.entry_path) bits.push(`Buy trigger: ${ENTRY_PATH_LABEL[pos.entry_path] ?? pos.entry_path}`);
        if (pos.entry_confidence != null) bits.push(`Confidence ${pos.entry_confidence.toFixed(0)}/100`);
        if (pos.breakout_margin_pct != null) bits.push(`Breakout margin +${pos.breakout_margin_pct.toFixed(1)}%`);
        doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.primary);
        doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
        y += entryCtxH;
      }

      if (hasGateDetail) {
        const bits: string[] = [];
        if (pos.rel_volume_entry != null) bits.push(`Rel-vol ${pos.rel_volume_entry.toFixed(2)} (floor 0.80)`);
        if (pos.cmf10_entry != null) bits.push(`CMF10 ${pos.cmf10_entry.toFixed(3)} (floor -0.05)`);
        if (pos.adx14_entry != null) bits.push(`ADX14 ${pos.adx14_entry.toFixed(1)}`);
        if (pos.sma200_slope_entry != null) bits.push(`SMA200 slope ${pos.sma200_slope_entry >= 0 ? "up" : "down"}`);
        doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.primary);
        doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
        y += gateH;
      }

      y = cardTop + posCardH + 4;
    }
    y += SECTION_GAP - 4;
  }

  // ── Per-trade lesson cards ─────────────────────────────────────────
  ensureSpace(10);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(C.textDark);
  doc.text(`Trade-by-Trade Autopsy (${lessons.length})`, mx, y + 5);
  y += 10;

  const bodyW = cw - 16;

  for (const lesson of lessons) {
    const reasonLines = doc.setFont("helvetica", "normal").setFontSize(7.5).splitTextToSize(sanitizePdfText(lesson.reason, 600), bodyW) as string[];
    const enhancementLines = doc.setFont("helvetica", "normal").setFontSize(7.5).splitTextToSize(sanitizePdfText(lesson.enhancement, 900), bodyW - 6) as string[];

    const hasMetrics =
      lesson.holding_days != null ||
      lesson.mfe_pct != null ||
      lesson.mae_pct != null ||
      lesson.giveback_pct != null ||
      lesson.pct_left_on_table != null;
    const hasPriceLine = lesson.entry_price != null || lesson.exit_price != null || lesson.quantity != null;
    const hasEntryCtx1 = lesson.entry_path != null || lesson.entry_confidence != null || lesson.breakout_margin_pct != null;
    const hasEntryCtx2 =
      lesson.rel_volume_entry != null || lesson.cmf10_entry != null || lesson.adx14_entry != null || lesson.sma200_slope_entry != null;
    const hasExitCtx = lesson.structural_stop_at_exit != null || lesson.atr14_exit != null || lesson.adx14_exit != null;
    const hasForward = lesson.forward_1w_available || lesson.forward_sessions_available != null;

    const headerH = 9;
    const metricsH = hasMetrics ? 6 : 0;
    const priceLineH = hasPriceLine ? 5.5 : 0;
    const entryCtx1H = hasEntryCtx1 ? 5.2 : 0;
    const entryCtx2H = hasEntryCtx2 ? 5.2 : 0;
    const exitCtxH = hasExitCtx ? 5.2 : 0;
    const forwardH = hasForward ? 5.5 : 0;
    const reasonH = reasonLines.length * LINE_H + 2;
    // Must match exactly what the enhancement box drawing below produces
    // (encBoxH) plus its own trailing gap -- this is the single source of
    // truth for the card's total height, used both to draw the card's
    // background/border up front and to know how much space to reserve.
    const encBoxH = enhancementLines.length * LINE_H + 5;
    const cardH =
      headerH + metricsH + priceLineH + entryCtx1H + entryCtx2H + exitCtxH + forwardH + reasonH + encBoxH + 4 + 2;

    ensureSpace(cardH + 4);

    const cardTop = y;
    const outcomeColor = OUTCOME_COLOR[lesson.outcome] ?? C.muted;

    drawRoundedRect(doc, mx, y, cw, cardH, 2.5, C.cardBg, C.border);

    // header row: ticker, classification badge, date
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(C.textDark);
    doc.text(sanitizePdfText(lesson.ticker, 20), mx + 5, y + 6.5);
    const tickerW = doc.getTextWidth(sanitizePdfText(lesson.ticker, 20));
    drawBadge(doc, mx + 5 + tickerW + 6, y + 6.5, classificationLabel(lesson.classification).toUpperCase(), lightenHex(outcomeColor, 0.85), outcomeColor);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.textLight);
    doc.text(sanitizePdfText(lesson.trade_date, 12), mx + cw - 4, y + 6.5, { align: "right" });
    y += headerH;

    // buy/sell price + quantity + realized P&L -- every trade should state
    // what it bought and sold at, not just the % outcome.
    if (hasPriceLine) {
      const bits: string[] = [];
      if (lesson.entry_price != null) bits.push(`Bought ${fmtNum(lesson.entry_price, 3)}`);
      if (lesson.exit_price != null) bits.push(`Sold ${fmtNum(lesson.exit_price, 3)}`);
      if (lesson.quantity != null) bits.push(`Qty ${lesson.quantity.toFixed(2)}`);
      if (lesson.realized_pnl_kwd != null) {
        bits.push(`P&L ${lesson.realized_pnl_kwd >= 0 ? "+" : ""}${lesson.realized_pnl_kwd.toFixed(3)} KWD`);
      }
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(C.textDark);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.6);
      y += priceLineH;
    }

    // metrics line
    if (hasMetrics) {
      const bits: string[] = [];
      if (lesson.holding_days != null) bits.push(`Held ${lesson.holding_days}d`);
      if (lesson.mfe_pct != null) bits.push(`Peak +${lesson.mfe_pct.toFixed(1)}%`);
      if (lesson.mae_pct != null) bits.push(`Drawdown -${lesson.mae_pct.toFixed(1)}%`);
      if (lesson.giveback_pct != null) bits.push(`Giveback ${lesson.giveback_pct.toFixed(1)}pp`);
      if (lesson.pct_left_on_table != null) {
        bits.push(
          lesson.pct_left_on_table > 0.5
            ? `Profit left on table +${lesson.pct_left_on_table.toFixed(1)}pp`
            : `Profit left on table: none — efficient`,
        );
      }
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textMedium);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.6);
      y += metricsH;
    }

    // entry gate, line 1: which path fired the BUY and how strong the signal was
    if (hasEntryCtx1) {
      const bits: string[] = [];
      if (lesson.entry_path) bits.push(`Buy trigger: ${ENTRY_PATH_LABEL[lesson.entry_path] ?? lesson.entry_path}`);
      if (lesson.entry_confidence != null) bits.push(`Confidence ${lesson.entry_confidence.toFixed(0)}/100`);
      if (lesson.breakout_margin_pct != null) bits.push(`Breakout margin +${lesson.breakout_margin_pct.toFixed(1)}%`);
      doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.primary);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
      y += entryCtx1H;
    }

    // entry gate, line 2: the raw volume/flow/regime readings behind that trigger
    if (hasEntryCtx2) {
      const bits: string[] = [];
      if (lesson.rel_volume_entry != null) bits.push(`Rel-vol ${lesson.rel_volume_entry.toFixed(2)} (floor 0.80)`);
      if (lesson.cmf10_entry != null) bits.push(`CMF10 ${lesson.cmf10_entry.toFixed(3)} (floor -0.05)`);
      if (lesson.adx14_entry != null) bits.push(`ADX14 ${lesson.adx14_entry.toFixed(1)}`);
      if (lesson.sma200_slope_entry != null) bits.push(`SMA200 slope ${lesson.sma200_slope_entry >= 0 ? "up" : "down"}`);
      doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.primary);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
      y += entryCtx2H;
    }

    // exit gate: the trailing-stop level and volatility/regime context that
    // actually fired the SELL -- this system has no fixed target price, so
    // this line (not a target) is the real number that governed the exit.
    if (hasExitCtx) {
      const bits: string[] = [];
      if (lesson.structural_stop_at_exit != null) bits.push(`Sell trigger: stop ${lesson.structural_stop_at_exit.toFixed(3)}`);
      if (lesson.atr14_exit != null) bits.push(`ATR14 ${lesson.atr14_exit.toFixed(3)}`);
      if (lesson.adx14_exit != null) bits.push(`ADX14 ${lesson.adx14_exit.toFixed(1)}`);
      doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.gold);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
      y += exitCtxH;
    }

    // forward-look: did the stock have more room to run after this system exited it?
    if (hasForward) {
      let text: string;
      if (lesson.forward_1w_available) {
        const bits = [`1wk after exit: ${fmtPct(lesson.forward_1w_return_pct)}`];
        if (lesson.forward_peak_20d_pct != null) bits.push(`best of next ~20 sessions: ${fmtPct(lesson.forward_peak_20d_pct)}`);
        text = `Forward-look — ${bits.join("   ·   ")}`;
      } else {
        text = `Forward-look — pending (${lesson.forward_sessions_available ?? 0}/5 sessions elapsed since exit)`;
      }
      doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.textLight);
      doc.text(text, mx + 5, y + 3.4);
      y += forwardH;
    }

    // reason
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.textDark);
    doc.text(reasonLines, mx + 5, y + 3.4);
    y += reasonH;

    // enhancement box
    drawRoundedRect(doc, mx + 4, y, cw - 8, encBoxH, 2, lightenHex(C.gold, 0.92));
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.gold);
    doc.text(enhancementLines, mx + 7, y + 3.6);

    y = cardTop + cardH + 4; // next card starts cardH below this one's top, plus a gap
  }

  if (lessons.length === 0) {
    ensureSpace(16);
    drawRoundedRect(doc, mx, y, cw, 14, 2, C.altRow, C.border);
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(C.muted);
    doc.text("No closed trades yet — lessons appear once a position scales out or exits.", mx + 6, y + 8);
    y += 18;
  }

  // ── Disclaimer ───────────────────────────────────────────────────
  ensureSpace(16);
  drawRoundedRect(doc, mx, y, cw, 14, 2, C.altRow, C.border);
  doc.setFontSize(6.5).setFont("helvetica", "italic").setTextColor(C.muted);
  doc.text(
    "This report reflects virtual-money paper trades only, mechanically filled from trend_hold_engine.py's decisions. It never feeds back into the engine automatically — every classification and enhancement note here is evidence for a human to act on, not an auto-applied change.",
    mx + 4,
    y + 5,
    { maxWidth: cw - 8 },
  );

  // ── Finalize page footers ───────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    drawPageFooter(p, totalPages);
  }

  // ── Save / share ─────────────────────────────────────────────────
  const filename = `trend_hold_lessons_${input.bookLabel.toLowerCase().replace(/\s+/g, "_")}_${todayISO()}.pdf`;

  if (Platform.OS === "web") {
    doc.save(filename);
    return;
  }

  const buf = doc.output("arraybuffer");
  const bytes = new Uint8Array(buf);
  const { Paths, File } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.document, filename);
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Export Lessons Learned Report" });
  }
}
