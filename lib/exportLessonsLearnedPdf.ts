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

import type { TrendHoldBookLesson, TrendHoldBookLessonsSummary } from "@/hooks/useTrendHoldBook";

// ── Input ────────────────────────────────────────────────────────────

export interface LessonsReportInput {
  bookLabel: string; // "Trend-Hold" | "V1 Rating"
  lessons: TrendHoldBookLesson[];
  summary?: TrendHoldBookLessonsSummary | null;
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

  const ENTRY_PATH_LABEL: Record<string, string> = { DONCHIAN: "Donchian breakout", EMA_CROSS: "EMA10/30 cross" };
  const ADX_BUCKET_LABEL: Record<string, string> = {
    WEAK_LT20: "Weak trend (ADX < 20)",
    MODERATE_20_40: "Moderate trend (ADX 20-40)",
    STRONG_GT40: "Strong trend (ADX > 40)",
  };
  drawBucketTable("By entry path", summary?.by_entry_path, (k) => ENTRY_PATH_LABEL[k] ?? k);
  drawBucketTable("By trend strength at entry", summary?.by_adx_bucket, (k) => ADX_BUCKET_LABEL[k] ?? k);

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
    const hasEntryCtx = lesson.entry_path != null || lesson.entry_confidence != null || lesson.breakout_margin_pct != null;

    const headerH = 9;
    const metricsH = hasMetrics ? 6 : 0;
    const entryCtxH = hasEntryCtx ? 5.5 : 0;
    const reasonH = reasonLines.length * LINE_H + 2;
    // Must match exactly what the enhancement box drawing below produces
    // (encBoxH) plus its own trailing gap -- this is the single source of
    // truth for the card's total height, used both to draw the card's
    // background/border up front and to know how much space to reserve.
    const encBoxH = enhancementLines.length * LINE_H + 5;
    const cardH = headerH + metricsH + entryCtxH + reasonH + encBoxH + 4 + 2;

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

    // entry-quality context line
    if (hasEntryCtx) {
      const bits: string[] = [];
      if (lesson.entry_path) bits.push(ENTRY_PATH_LABEL[lesson.entry_path] ?? lesson.entry_path);
      if (lesson.entry_confidence != null) bits.push(`Confidence ${lesson.entry_confidence.toFixed(0)}/100`);
      if (lesson.breakout_margin_pct != null) bits.push(`Breakout margin +${lesson.breakout_margin_pct.toFixed(1)}%`);
      doc.setFont("helvetica", "italic").setFontSize(6.8).setTextColor(C.primary);
      doc.text(bits.join("   ·   "), mx + 5, y + 3.4);
      y += entryCtxH;
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
