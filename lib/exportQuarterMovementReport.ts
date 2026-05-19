import { todayISO } from "@/lib/dateUtils";
import { sanitizePdfText } from "@/lib/sanitizePdf";
import type { AnalysisStock, Quarter, QuarterMovementResponse } from "@/services/api";
import { Platform } from "react-native";

type JsPdf = import("jspdf").jsPDF;

type QuarterCellModel = {
  highText: string;
  lowText: string;
  statusText?: string;
};

type TableRow = {
  label: string;
  cells: QuarterCellModel[];
  highlight?: boolean;
};

type SummaryMetric = {
  label: string;
  value: string;
  note?: string;
};

type ScenarioMetric = {
  label: string;
  value: string;
};

type ScenarioBlock = {
  title: string;
  note?: string;
  accent: string;
  background: string;
  metrics: ScenarioMetric[];
};

type TableSection = {
  title: string;
  subtitle: string;
  rows: TableRow[];
};

type QuarterMovementReportModel = {
  companyName: string;
  symbol: string;
  currency: string;
  reportDateLabel: string;
  activeQuarterLabel: string;
  expectedRangeText: string;
  dataSource: string;
  lastUpdated: string;
  epsCoverageLabel: string;
  stale: boolean;
  highestQuarterSummary: string;
  lowestQuarterSummary: string;
  summaryMetrics: SummaryMetric[];
  scenarios: [ScenarioBlock, ScenarioBlock];
  notes: string[];
  priceTable: TableSection;
  peTable: TableSection | null;
};

type QuarterExtreme = {
  quarter: Quarter;
  value: number;
};

type ReportInput = {
  data: QuarterMovementResponse;
  stock: Pick<AnalysisStock, "symbol" | "company_name" | "currency">;
  currentPrice: number | null;
};

const QUARTERS: readonly Quarter[] = ["q1", "q2", "q3", "q4"] as const;
const QUARTER_LABELS: Record<Quarter, string> = {
  q1: "Q1",
  q2: "Q2",
  q3: "Q3",
  q4: "Q4",
};

const COLORS = {
  ink: "#0F172A",
  blue: "#1D4ED8",
  blueSoft: "#DBEAFE",
  teal: "#0F766E",
  tealSoft: "#CCFBF1",
  emerald: "#059669",
  emeraldSoft: "#D1FAE5",
  amber: "#D97706",
  amberSoft: "#FEF3C7",
  red: "#DC2626",
  redSoft: "#FEE2E2",
  slate: "#475569",
  slateSoft: "#F8FAFC",
  border: "#CBD5E1",
  white: "#FFFFFF",
} as const;

function normalizeQuarterMovementPrice(
  rawPrice: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (rawPrice == null || !Number.isFinite(rawPrice)) return null;
  if ((currency ?? "").toUpperCase() === "KWD" && rawPrice >= 10) {
    return rawPrice / 1000;
  }
  return rawPrice;
}

function computePctExpectedPrice(
  baselinePrice: number | null,
  pctMove: number | null | undefined,
): number | null {
  if (baselinePrice == null || !Number.isFinite(baselinePrice) || baselinePrice <= 0) return null;
  if (pctMove == null || !Number.isFinite(pctMove)) return null;
  return Math.round(baselinePrice * (1 + pctMove / 100) * 1000) / 1000;
}

function computePeExpectedPrice(
  ttmEps: number | null | undefined,
  peMean: number | null | undefined,
): number | null {
  if (ttmEps == null || !Number.isFinite(ttmEps) || ttmEps <= 0) return null;
  if (peMean == null || !Number.isFinite(peMean)) return null;
  return Math.round(ttmEps * peMean * 1000) / 1000;
}

function computeConsensusExpectedPrice(
  first: number | null,
  second: number | null,
): number | null {
  if (first == null || second == null) return null;
  return Math.round(((first + second) / 2) * 1000) / 1000;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtPE(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(2);
}

function fmtPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return value.toFixed(3);
}

function fmtCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${fmtPrice(value)} ${currency}`.trim();
}

function formatEpsSourceLabel(source: string): string {
  switch (source) {
    case "stock_metrics":
      return "Stored metrics";
    case "financials":
      return "Financial statements";
    case "flatfiles":
      return "Flat files";
    case "none":
      return "Unavailable";
    default:
      return source.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatCoverageLabel(coverage: QuarterMovementResponse["eps_coverage"]): string {
  switch (coverage) {
    case "full":
      return "Full quarterly EPS coverage";
    case "latest_only":
      return "Latest TTM EPS only";
    case "flatfiles":
      return "Flat file EPS coverage";
    case "none":
    default:
      return "No EPS coverage";
  }
}

function buildCellStatus(inProgress: boolean, reducedSample?: boolean): string | undefined {
  if (inProgress) return "LIVE";
  if (reducedSample) return "Limited sample";
  return undefined;
}

function pickQuarterExtreme(
  means: Record<Quarter, { high_pct_mean: number | null; low_pct_mean: number | null }>,
  key: "high_pct_mean" | "low_pct_mean",
  mode: "max" | "min",
): QuarterExtreme | null {
  let selected: QuarterExtreme | null = null;
  for (const quarter of QUARTERS) {
    const value = means[quarter][key];
    if (value == null || !Number.isFinite(value)) continue;
    if (!selected) {
      selected = { quarter, value };
      continue;
    }
    if (mode === "max" ? value > selected.value : value < selected.value) {
      selected = { quarter, value };
    }
  }
  return selected;
}

function buildPriceCell(
  cell: QuarterMovementResponse["price_movement_table"][string][Quarter] | null,
): QuarterCellModel {
  if (cell == null || cell.insufficient_data) {
    return { highText: "N/A", lowText: "N/A" };
  }
  return {
    highText: fmtPct(cell.high_pct),
    lowText: fmtPct(cell.low_pct),
    statusText: buildCellStatus(cell.in_progress),
  };
}

function buildPeCell(
  cell: QuarterMovementResponse["pe_movement_table"][string][Quarter] | null,
): QuarterCellModel {
  if (cell == null || cell.insufficient_data) {
    return { highText: "N/A", lowText: "N/A" };
  }
  return {
    highText: fmtPE(cell.highest_pe),
    lowText: fmtPE(cell.lowest_pe),
    statusText: buildCellStatus(cell.in_progress),
  };
}

function buildModel(input: ReportInput): QuarterMovementReportModel {
  const { data, stock } = input;
  const currency = data.currency ?? stock.currency ?? "";
  const currentPrice = normalizeQuarterMovementPrice(input.currentPrice, currency);
  const baselinePrice = normalizeQuarterMovementPrice(data.baseline_price, currency);
  const activePriceMean = data.price_movement_means[data.active_quarter_key];
  const activePeMean = data.pe_movement_means[data.active_quarter_key];

  const priceHighExpected = computePctExpectedPrice(baselinePrice, activePriceMean.high_pct_mean);
  const priceLowExpected = computePctExpectedPrice(baselinePrice, activePriceMean.low_pct_mean);
  const peHighExpected = computePeExpectedPrice(data.ttm_eps, activePeMean.highest_pe_mean);
  const peLowExpected = computePeExpectedPrice(data.ttm_eps, activePeMean.lowest_pe_mean);
  const consensusHighExpected = computeConsensusExpectedPrice(priceHighExpected, peHighExpected);
  const consensusLowExpected = computeConsensusExpectedPrice(priceLowExpected, peLowExpected);
  const companyName = data.company_name ?? stock.company_name ?? stock.symbol;
  const activeQuarterLabel = `${data.active_quarter.toUpperCase()} ${data.active_year}`;
  const highestQuarter = pickQuarterExtreme(data.price_movement_means, "high_pct_mean", "max");
  const lowestQuarter = pickQuarterExtreme(data.price_movement_means, "low_pct_mean", "min");
  const highestQuarterSummary = highestQuarter
    ? `${QUARTER_LABELS[highestQuarter.quarter]} (${fmtPct(highestQuarter.value)} avg high)`
    : "N/A";
  const lowestQuarterSummary = lowestQuarter
    ? `${QUARTER_LABELS[lowestQuarter.quarter]} (${fmtPct(lowestQuarter.value)} avg low)`
    : "N/A";

  const summaryMetrics: SummaryMetric[] = [
    { label: "Active Quarter", value: activeQuarterLabel },
    { label: "Current Price", value: fmtCurrency(currentPrice, currency) },
    { label: "Baseline Price", value: fmtCurrency(baselinePrice, currency) },
    {
      label: "TTM EPS",
      value: data.ttm_eps != null ? data.ttm_eps.toFixed(4) : "N/A",
      note: data.ttm_eps != null ? formatEpsSourceLabel(data.ttm_eps_source) : undefined,
    },
  ];

  const scenarios: [ScenarioBlock, ScenarioBlock] = [
    {
      title: "High Case",
      note: activePriceMean.reduced_sample ? "Based on a limited historical sample." : undefined,
      accent: COLORS.emerald,
      background: COLORS.emeraldSoft,
      metrics: [
        { label: "Historical Mean High %", value: fmtPct(activePriceMean.high_pct_mean) },
        { label: "Expected from Price %", value: fmtCurrency(priceHighExpected, currency) },
        {
          label: "Expected from P/E x EPS",
          value: data.eps_coverage === "none" ? "N/A" : fmtCurrency(peHighExpected, currency),
        },
        { label: "Consensus High", value: fmtCurrency(consensusHighExpected, currency) },
      ],
    },
    {
      title: "Low Case",
      note: activePriceMean.reduced_sample ? "Based on a limited historical sample." : undefined,
      accent: COLORS.red,
      background: COLORS.redSoft,
      metrics: [
        { label: "Historical Mean Low %", value: fmtPct(activePriceMean.low_pct_mean) },
        { label: "Expected from Price %", value: fmtCurrency(priceLowExpected, currency) },
        {
          label: "Expected from P/E x EPS",
          value: data.eps_coverage === "none" ? "N/A" : fmtCurrency(peLowExpected, currency),
        },
        { label: "Consensus Low", value: fmtCurrency(consensusLowExpected, currency) },
      ],
    },
  ];

  const priceRows: TableRow[] = data.years.map((year) => ({
    label: String(year),
    cells: QUARTERS.map((quarter) => buildPriceCell(data.price_movement_table[String(year)]?.[quarter] ?? null)),
  }));

  priceRows.push({
    label: "Avg",
    highlight: true,
    cells: QUARTERS.map((quarter) => ({
      highText: `${fmtPct(data.price_movement_means[quarter].high_pct_mean)}${data.price_movement_means[quarter].reduced_sample ? "*" : ""}`,
      lowText: fmtPct(data.price_movement_means[quarter].low_pct_mean),
      statusText: buildCellStatus(false, data.price_movement_means[quarter].reduced_sample),
    })),
  });

  const peTable = data.eps_coverage === "none"
    ? null
    : {
        title: "P/E Movement",
        subtitle: data.eps_coverage === "latest_only"
          ? "Quarterly peak and trough P/E values. Latest TTM EPS is used where full coverage is unavailable."
          : "Quarterly peak and trough P/E values based on stored EPS coverage.",
        rows: [
          ...data.years.map<TableRow>((year) => ({
            label: String(year),
            cells: QUARTERS.map((quarter) => buildPeCell(data.pe_movement_table[String(year)]?.[quarter] ?? null)),
          })),
          {
            label: "Avg",
            highlight: true,
            cells: QUARTERS.map((quarter) => ({
              highText: `${fmtPE(data.pe_movement_means[quarter].highest_pe_mean)}${data.pe_movement_means[quarter].reduced_sample ? "*" : ""}`,
              lowText: fmtPE(data.pe_movement_means[quarter].lowest_pe_mean),
              statusText: buildCellStatus(false, data.pe_movement_means[quarter].reduced_sample),
            })),
          },
        ],
      };

  const expectedRangeText = consensusLowExpected != null && consensusHighExpected != null
    ? `${fmtCurrency(consensusLowExpected, currency)} to ${fmtCurrency(consensusHighExpected, currency)}`
    : "N/A";

  return {
    companyName,
    symbol: stock.symbol,
    currency,
    reportDateLabel: new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    activeQuarterLabel,
    expectedRangeText,
    dataSource: data.data_source,
    lastUpdated: data.last_updated,
    epsCoverageLabel: formatCoverageLabel(data.eps_coverage),
    stale: data.stale,
    highestQuarterSummary,
    lowestQuarterSummary,
    summaryMetrics,
    scenarios,
    notes: [
      `Expected range is built from the active-quarter consensus low/high export calculations shown on the screen.`,
      `Highest historical quarter: ${highestQuarterSummary}. Lowest historical quarter: ${lowestQuarterSummary}.`,
      `KWD values are normalized from fils when the source quote is delivered in fils.`,
      `LIVE cells indicate the current quarter is still in progress.`,
      data.eps_coverage === "none"
        ? "P/E movement is not included because no EPS coverage was available for this company."
        : `P/E coverage status: ${formatCoverageLabel(data.eps_coverage)}.`,
    ],
    priceTable: {
      title: "Price Movement",
      subtitle: "Green HIGH captures the upside from the quarter baseline. Red LOW captures the downside from the same baseline.",
      rows: priceRows,
    },
    peTable,
  };
}

function buildFilename(symbol: string, extension: "xlsx" | "pdf"): string {
  return `${symbol}_quarter_movement_report_${todayISO()}.${extension}`;
}

function webDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function nativeShareBytes(bytes: Uint8Array, filename: string, mimeType: string) {
  const { Paths, File } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.document, filename);
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Export ${filename}` });
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const intValue = Number.parseInt(value, 16);
  return [
    (intValue >> 16) & 255,
    (intValue >> 8) & 255,
    intValue & 255,
  ];
}

function setFillColor(doc: JsPdf, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDrawColor(doc: JsPdf, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setTextColor(doc: JsPdf, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawRoundedRect(
  doc: JsPdf,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke?: string,
) {
  setFillColor(doc, fill);
  if (stroke) {
    setDrawColor(doc, stroke);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, height, 3, 3, "FD");
  } else {
    doc.roundedRect(x, y, width, height, 3, 3, "F");
  }
}

function drawMetricCard(
  doc: JsPdf,
  metric: SummaryMetric,
  x: number,
  y: number,
  width: number,
  colors: { fill: string; accent: string },
) {
  drawRoundedRect(doc, x, y, width, 30, colors.fill, COLORS.border);
  setFillColor(doc, colors.accent);
  doc.rect(x, y, width, 2.2, "F");
  doc.setFont("helvetica", "bold").setFontSize(9.5);
  setTextColor(doc, COLORS.slate);
  doc.text(sanitizePdfText(metric.label, 50), x + 4, y + 8);
  doc.setFont("helvetica", "bold").setFontSize(13.5);
  setTextColor(doc, COLORS.ink);
  doc.text(sanitizePdfText(metric.value, 60), x + 4, y + 17);
  if (metric.note) {
    doc.setFont("helvetica", "normal").setFontSize(8);
    setTextColor(doc, COLORS.slate);
    doc.text(sanitizePdfText(metric.note, 60), x + 4, y + 25);
  }
}

function drawScenarioCard(
  doc: JsPdf,
  scenario: ScenarioBlock,
  x: number,
  y: number,
  width: number,
): number {
  const height = 14 + scenario.metrics.length * 9 + (scenario.note ? 7 : 0);
  drawRoundedRect(doc, x, y, width, height, scenario.background, COLORS.border);
  setFillColor(doc, scenario.accent);
  doc.rect(x, y, width, 3, "F");
  doc.setFont("helvetica", "bold").setFontSize(12);
  setTextColor(doc, scenario.accent);
  doc.text(sanitizePdfText(scenario.title, 40), x + 5, y + 10);
  let cursorY = y + 18;
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  for (const metric of scenario.metrics) {
    setTextColor(doc, COLORS.slate);
    doc.text(sanitizePdfText(metric.label, 55), x + 5, cursorY);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, COLORS.ink);
    doc.text(sanitizePdfText(metric.value, 35), x + width - 5, cursorY, { align: "right" });
    doc.setFont("helvetica", "normal");
    cursorY += 8;
  }
  if (scenario.note) {
    doc.setFont("helvetica", "italic").setFontSize(8.5);
    setTextColor(doc, COLORS.slate);
    doc.text(sanitizePdfText(scenario.note, 90), x + 5, cursorY);
  }
  return height;
}

function drawSectionTitle(doc: JsPdf, title: string, subtitle: string, y: number) {
  doc.setFont("helvetica", "bold").setFontSize(13);
  setTextColor(doc, COLORS.ink);
  doc.text(sanitizePdfText(title, 80), 12, y);
  doc.setFont("helvetica", "normal").setFontSize(9);
  setTextColor(doc, COLORS.slate);
  doc.text(sanitizePdfText(subtitle, 240), 12, y + 6);
}

function estimateDualValueTableHeight(section: TableSection): number {
  const titleBlockHeight = 14;
  const headerBlockHeight = 12;
  const rowBlockHeight = section.rows.length * 25;
  return titleBlockHeight + headerBlockHeight + rowBlockHeight;
}

function drawDualValueTable(doc: JsPdf, section: TableSection, y: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 24;
  const yearWidth = 32;
  const colWidth = (contentWidth - yearWidth) / 4;
  const startX = 12;
  let cursorY = y;

  drawSectionTitle(doc, section.title, section.subtitle, cursorY);
  cursorY += 12;

  drawRoundedRect(doc, startX, cursorY, contentWidth, 11, COLORS.blueSoft, COLORS.border);
  doc.setFont("helvetica", "bold").setFontSize(10);
  setTextColor(doc, COLORS.blue);
  doc.text("Year", startX + 4, cursorY + 7);
  QUARTERS.forEach((quarter, index) => {
    doc.text(QUARTER_LABELS[quarter], startX + yearWidth + index * colWidth + colWidth / 2, cursorY + 7, { align: "center" });
  });
  cursorY += 12;

  for (const row of section.rows) {
    const rowHeight = 22;
    drawRoundedRect(
      doc,
      startX,
      cursorY,
      contentWidth,
      rowHeight,
      row.highlight ? COLORS.amberSoft : COLORS.white,
      COLORS.border,
    );
    doc.setFont("helvetica", row.highlight ? "bold" : "normal").setFontSize(10.5);
    setTextColor(doc, row.highlight ? COLORS.amber : COLORS.ink);
    doc.text(sanitizePdfText(row.label, 20), startX + 4, cursorY + 12.5);

    row.cells.forEach((cell, index) => {
      const cellX = startX + yearWidth + index * colWidth;
      doc.setFont("helvetica", "bold").setFontSize(8.4);
      setTextColor(doc, COLORS.emerald);
      doc.text(`HIGH ${sanitizePdfText(cell.highText, 18)}`, cellX + colWidth / 2, cursorY + 8.2, { align: "center" });
      setTextColor(doc, COLORS.red);
      doc.text(`LOW ${sanitizePdfText(cell.lowText, 18)}`, cellX + colWidth / 2, cursorY + 15, { align: "center" });
      if (cell.statusText) {
        doc.setFont("helvetica", "bold").setFontSize(7);
        setTextColor(doc, COLORS.blue);
        doc.text(sanitizePdfText(cell.statusText, 18).toUpperCase(), cellX + colWidth / 2, cursorY + 20, { align: "center" });
      }
    });
    cursorY += rowHeight + 3;
  }

  return cursorY;
}

async function buildPdf(model: QuarterMovementReportModel): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const doc: JsPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  let page = 1;
  let y = 32;

  const drawHeader = () => {
    setFillColor(doc, COLORS.ink);
    doc.rect(0, 0, pageWidth, 24, "F");
    drawRoundedRect(doc, marginX, 6, 20, 12, COLORS.blue);
    doc.setFont("helvetica", "bold").setFontSize(13);
    setTextColor(doc, COLORS.white);
    doc.text("SAHAM", marginX + 10, 14.5, { align: "center" });
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text("Quarter Movement Report", marginX + 28, 12);
    doc.setFont("helvetica", "normal").setFontSize(9);
    setTextColor(doc, COLORS.slateSoft);
    doc.text(`${sanitizePdfText(model.companyName, 70)} (${sanitizePdfText(model.symbol, 18)})`, marginX + 28, 18);
    doc.text(model.reportDateLabel, pageWidth - marginX, 12, { align: "right" });
    doc.text(model.stale ? "Stale cache snapshot" : "Fresh export snapshot", pageWidth - marginX, 18, { align: "right" });
  };

  const drawFooter = (pageNumber: number, totalPages?: number) => {
    doc.setPage(pageNumber);
    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.setFont("helvetica", "normal").setFontSize(7.5);
    setTextColor(doc, COLORS.slate);
    doc.text(`Source: ${sanitizePdfText(model.dataSource, 80)} · Updated ${sanitizePdfText(model.lastUpdated, 40)}`, marginX, pageHeight - 5.5);
    const label = totalPages ? `Page ${pageNumber} of ${totalPages}` : `Page ${pageNumber}`;
    doc.text(label, pageWidth - marginX, pageHeight - 5.5, { align: "right" });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 16) return;
    drawFooter(page);
    doc.addPage();
    page += 1;
    drawHeader();
    y = 32;
  };

  drawHeader();

  drawRoundedRect(doc, marginX, y, contentWidth, 20, COLORS.slateSoft, COLORS.border);
  doc.setFont("helvetica", "bold").setFontSize(12.5);
  setTextColor(doc, COLORS.ink);
  doc.text("Decision Snapshot", marginX + 5, y + 8);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  setTextColor(doc, COLORS.slate);
  doc.text(`Active quarter: ${sanitizePdfText(model.activeQuarterLabel, 30)} · Expected range: ${sanitizePdfText(model.expectedRangeText, 40)}`, marginX + 5, y + 15);
  doc.text(`EPS coverage: ${sanitizePdfText(model.epsCoverageLabel, 40)}`, pageWidth - marginX - 5, y + 15, { align: "right" });
  y += 26;

  drawRoundedRect(doc, marginX, y, contentWidth, 18, COLORS.tealSoft, COLORS.border);
  doc.setFont("helvetica", "bold").setFontSize(10.5);
  setTextColor(doc, COLORS.teal);
  doc.text("Historical Quarter Extremes", marginX + 5, y + 7);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  setTextColor(doc, COLORS.ink);
  doc.text(`Highest: ${sanitizePdfText(model.highestQuarterSummary, 50)}`, marginX + 5, y + 13);
  doc.text(`Lowest: ${sanitizePdfText(model.lowestQuarterSummary, 50)}`, pageWidth - marginX - 5, y + 13, { align: "right" });
  y += 24;

  const metricGap = 4;
  const metricWidth = (contentWidth - metricGap * 3) / 4;
  model.summaryMetrics.forEach((metric, index) => {
    drawMetricCard(doc, metric, marginX + index * (metricWidth + metricGap), y, metricWidth, {
      fill: COLORS.white,
      accent: index % 2 === 0 ? COLORS.blue : COLORS.teal,
    });
  });
  y += 38;

  const scenarioGap = 6;
  const scenarioWidth = (contentWidth - scenarioGap) / 2;
  const highHeight = drawScenarioCard(doc, model.scenarios[0], marginX, y, scenarioWidth);
  const lowHeight = drawScenarioCard(doc, model.scenarios[1], marginX + scenarioWidth + scenarioGap, y, scenarioWidth);
  y += Math.max(highHeight, lowHeight) + 8;

  ensureSpace(36);
  drawRoundedRect(doc, marginX, y, contentWidth, 28, COLORS.blueSoft, COLORS.border);
  doc.setFont("helvetica", "bold").setFontSize(10.5);
  setTextColor(doc, COLORS.blue);
  doc.text("Report Notes", marginX + 5, y + 8);
  doc.setFont("helvetica", "normal").setFontSize(8.7);
  setTextColor(doc, COLORS.slate);
  model.notes.slice(0, 3).forEach((note, index) => {
    doc.text(`• ${sanitizePdfText(note, 180)}`, marginX + 5, y + 15 + index * 5.2);
  });
  y += 36;

  ensureSpace(estimateDualValueTableHeight(model.priceTable));
  y = drawDualValueTable(doc, model.priceTable, y);

  if (model.peTable) {
    ensureSpace(estimateDualValueTableHeight(model.peTable) + 4);
    y = drawDualValueTable(doc, model.peTable, y + 4);
  }

  const totalPages = doc.getNumberOfPages();
  for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
    drawFooter(currentPage, totalPages);
  }

  return doc;
}

function applyCellStyle(cell: { s?: Record<string, unknown> }, style: Record<string, unknown>) {
  cell.s = style;
}

async function buildExcelWorkbook(model: QuarterMovementReportModel): Promise<Uint8Array> {
  const XLSX = await import("xlsx-js-style");
  const workbook = XLSX.utils.book_new();

  const border = {
    top: { style: "thin", color: { rgb: COLORS.border.slice(1) } },
    bottom: { style: "thin", color: { rgb: COLORS.border.slice(1) } },
    left: { style: "thin", color: { rgb: COLORS.border.slice(1) } },
    right: { style: "thin", color: { rgb: COLORS.border.slice(1) } },
  };

  const titleStyle = {
    fill: { fgColor: { rgb: COLORS.ink.slice(1) } },
    font: { color: { rgb: COLORS.white.slice(1) }, bold: true, sz: 16 },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  };
  const subtitleStyle = {
    fill: { fgColor: { rgb: COLORS.blue.slice(1) } },
    font: { color: { rgb: COLORS.white.slice(1) }, bold: true, sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  };
  const labelStyle = {
    fill: { fgColor: { rgb: COLORS.slateSoft.slice(1) } },
    font: { color: { rgb: COLORS.slate.slice(1) }, bold: true, sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
    border,
  };
  const valueStyle = {
    fill: { fgColor: { rgb: COLORS.white.slice(1) } },
    font: { color: { rgb: COLORS.ink.slice(1) }, bold: true, sz: 11 },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border,
  };
  const sectionTitleStyle = {
    fill: { fgColor: { rgb: COLORS.blueSoft.slice(1) } },
    font: { color: { rgb: COLORS.blue.slice(1) }, bold: true, sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
    border,
  };
  const scenarioHeaderStyle = (accent: string) => ({
    fill: { fgColor: { rgb: accent.slice(1) } },
    font: { color: { rgb: COLORS.white.slice(1) }, bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  });
  const scenarioCellStyle = (fill: string) => ({
    fill: { fgColor: { rgb: fill.slice(1) } },
    font: { color: { rgb: COLORS.ink.slice(1) }, sz: 10 },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border,
  });
  const noteStyle = {
    fill: { fgColor: { rgb: COLORS.slateSoft.slice(1) } },
    font: { color: { rgb: COLORS.slate.slice(1) }, sz: 10 },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border,
  };

  const overviewRows: (string | null)[][] = [
    ["SAHAM | Quarter Movement Report", null, null, null],
    [`${model.companyName} (${model.symbol})`, null, null, null],
    [null, null, null, null],
    ["Generated", model.reportDateLabel, "Active Quarter", model.activeQuarterLabel],
    ["Currency", model.currency || "N/A", "Data Source", model.dataSource],
    ["Last Updated", model.lastUpdated, "EPS Coverage", model.epsCoverageLabel],
    ["Expected Range", model.expectedRangeText, "Data Freshness", model.stale ? "Stale cache" : "Current cache"],
    ["Highest Quarter", model.highestQuarterSummary, "Lowest Quarter", model.lowestQuarterSummary],
    [null, null, null, null],
    ["Snapshot Metrics", null, null, null],
    [model.summaryMetrics[0].label, model.summaryMetrics[0].value, model.summaryMetrics[1].label, model.summaryMetrics[1].value],
    [model.summaryMetrics[2].label, model.summaryMetrics[2].value, model.summaryMetrics[3].label, model.summaryMetrics[3].value],
    [null, null, null, null],
    [model.scenarios[0].title, null, model.scenarios[1].title, null],
    ["Metric", "Value", "Metric", "Value"],
  ];

  const scenarioRowCount = Math.max(model.scenarios[0].metrics.length, model.scenarios[1].metrics.length);
  for (let index = 0; index < scenarioRowCount; index += 1) {
    const highMetric = model.scenarios[0].metrics[index];
    const lowMetric = model.scenarios[1].metrics[index];
    overviewRows.push([
      highMetric?.label ?? "",
      highMetric?.value ?? "",
      lowMetric?.label ?? "",
      lowMetric?.value ?? "",
    ]);
  }

  overviewRows.push([null, null, null, null]);
  overviewRows.push(["Report Notes", null, null, null]);
  model.notes.forEach((note) => {
    overviewRows.push([note, null, null, null]);
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
  overviewSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },
    { s: { r: 13, c: 2 }, e: { r: 13, c: 3 } },
    { s: { r: 15 + scenarioRowCount + 1, c: 0 }, e: { r: 15 + scenarioRowCount + 1, c: 3 } },
  ];
  overviewSheet["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }];
  overviewSheet["!rows"] = overviewRows.map((row, index) => ({
    hpt: index === 0 ? 28 : index === 1 ? 20 : row.some((value) => value && String(value).length > 50) ? 34 : 22,
  }));

  Object.keys(overviewSheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = overviewSheet[address] as { v?: string; s?: Record<string, unknown> };
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r === 0) {
      applyCellStyle(cell, titleStyle);
      return;
    }
    if (r === 1) {
      applyCellStyle(cell, subtitleStyle);
      return;
    }
    if (r === 9 || r === 15 + scenarioRowCount + 1) {
      applyCellStyle(cell, sectionTitleStyle);
      return;
    }
    if (r === 13) {
      applyCellStyle(cell, c < 2 ? scenarioHeaderStyle(COLORS.emerald) : scenarioHeaderStyle(COLORS.red));
      return;
    }
    if (r === 14) {
      applyCellStyle(cell, labelStyle);
      return;
    }
    if (r >= 15 && r < 15 + scenarioRowCount) {
      applyCellStyle(cell, c < 2 ? scenarioCellStyle(COLORS.emeraldSoft) : scenarioCellStyle(COLORS.redSoft));
      return;
    }
    if (r > 15 + scenarioRowCount + 1) {
      applyCellStyle(cell, noteStyle);
      return;
    }
    applyCellStyle(cell, c % 2 === 0 ? labelStyle : valueStyle);
  });

  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

  const buildHistorySheet = (section: TableSection, sheetName: string) => {
    const rows: string[][] = [
      [section.title, "", "", "", ""],
      [section.subtitle, "", "", "", ""],
      ["Year", ...QUARTERS.map((quarter) => QUARTER_LABELS[quarter])],
      ...section.rows.map((row) => [
        row.label,
        ...row.cells.map((cell) => {
          const statusSuffix = cell.statusText ? `\n${cell.statusText.toUpperCase()}` : "";
          return `HIGH ${cell.highText}\nLOW ${cell.lowText}${statusSuffix}`;
        }),
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    ];
    sheet["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }];
    sheet["!rows"] = rows.map((row, index) => ({
      hpt: index < 2 ? 22 : index === 2 ? 20 : row[0] === "Avg" ? 34 : 32,
    }));
    Object.keys(sheet).forEach((address) => {
      if (address.startsWith("!")) return;
      const cell = sheet[address] as { v?: string; s?: Record<string, unknown> };
      const { r, c } = XLSX.utils.decode_cell(address);
      if (r === 0) {
        applyCellStyle(cell, titleStyle);
        return;
      }
      if (r === 1) {
        applyCellStyle(cell, subtitleStyle);
        return;
      }
      if (r === 2) {
        applyCellStyle(cell, sectionTitleStyle);
        return;
      }
      const isAverageRow = rows[r]?.[0] === "Avg";
      applyCellStyle(cell, {
        fill: { fgColor: { rgb: (isAverageRow ? COLORS.amberSoft : r % 2 === 0 ? COLORS.white : COLORS.slateSoft).slice(1) } },
        font: { color: { rgb: (isAverageRow && c === 0 ? COLORS.amber : COLORS.ink).slice(1) }, bold: isAverageRow || c === 0, sz: 10 },
        alignment: { horizontal: c === 0 ? "left" : "center", vertical: "center", wrapText: true },
        border,
      });
    });
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  };

  buildHistorySheet(model.priceTable, "Price Movement");
  if (model.peTable) {
    buildHistorySheet(model.peTable, "PE Movement");
  }

  const notesSheet = XLSX.utils.aoa_to_sheet([
    ["Methodology", "", "", ""],
    ["Baseline logic", "Quarter values are measured against the baseline price immediately before each quarter begins.", "", ""],
    ["Price movement", "HIGH shows peak upside from baseline. LOW shows peak downside from baseline.", "", ""],
    ["P/E movement", "When EPS coverage exists, the report also exports quarterly peak and trough P/E values.", "", ""],
    ["Export range", "Consensus low/high are the same values displayed in the app for the active quarter.", "", ""],
  ]);
  notesSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
  ];
  notesSheet["!cols"] = [{ wch: 18 }, { wch: 80 }, { wch: 2 }, { wch: 2 }];
  Object.keys(notesSheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = notesSheet[address] as { s?: Record<string, unknown> };
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r === 0) {
      applyCellStyle(cell, titleStyle);
      return;
    }
    applyCellStyle(cell, c === 0 ? labelStyle : noteStyle);
  });
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Methodology");

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buffer);
}

export async function exportQuarterMovementExcel(input: ReportInput): Promise<void> {
  const model = buildModel(input);
  const bytes = await buildExcelWorkbook(model);
  const filename = buildFilename(model.symbol, "xlsx");
  const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (Platform.OS === "web") {
    webDownloadBlob(new Blob([bytes as unknown as BlobPart], { type: mimeType }), filename);
    return;
  }
  await nativeShareBytes(bytes, filename, mimeType);
}

export async function exportQuarterMovementPdf(input: ReportInput): Promise<void> {
  const model = buildModel(input);
  const doc = await buildPdf(model);
  const filename = buildFilename(model.symbol, "pdf");
  if (Platform.OS === "web") {
    doc.save(filename);
    return;
  }
  const buffer = doc.output("arraybuffer");
  await nativeShareBytes(new Uint8Array(buffer), filename, "application/pdf");
}