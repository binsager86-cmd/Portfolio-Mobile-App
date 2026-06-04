import { todayISO } from "@/lib/dateUtils";
import { Platform } from "react-native";

export type ExportableEagleEyeScannerRow = {
  ticker: string;
  nameEn: string;
  sector: string;
  stage: string;
  rating: string;
  confidence: number;
  lastPrice?: number | null;
  entryPrimary?: number | null;
  tp1?: number | null;
  bookValuePerShare?: number | null;
  peRatio?: number | null;
  rrRatio?: number | null;
  relativeVolume?: number | null;
  volumeConfirmed?: boolean;
  computedAt?: string | null;
};

export type EagleEyeScannerReportInput = {
  rows: ExportableEagleEyeScannerRow[];
  filters: {
    search?: string;
    minConfidence?: number;
    ratingFilter?: string;
    statusFilter?: string;
    stageFilter?: string;
    highVolumeOnly?: boolean;
  };
  summary: {
    visibleRows: number;
    totalRows: number;
    sortColumn: string;
    sortDirection: "asc" | "desc";
  };
};

const COLORS = {
  ink: "0F172A",
  header: "1E293B",
  accent: "2563EB",
  accentSoft: "DBEAFE",
  border: "CBD5E1",
  surface: "FFFFFF",
  surfaceAlt: "F8FAFC",
  positive: "059669",
  negative: "DC2626",
  muted: "64748B",
  white: "FFFFFF",
} as const;

function applyStyle(cell: { s?: Record<string, unknown> }, style: Record<string, unknown>) {
  cell.s = style;
}

function safeFilterValue(value?: string): string {
  return value && value.trim() ? value.trim() : "All";
}

function formatVolumeConfirmed(v?: boolean): string {
  if (v == null) return "-";
  return v ? "Yes" : "No";
}

async function buildWorkbook(input: EagleEyeScannerReportInput): Promise<Uint8Array> {
  const XLSX = await import("xlsx-js-style");
  const workbook = XLSX.utils.book_new();

  const border = {
    top: { style: "thin", color: { rgb: COLORS.border } },
    bottom: { style: "thin", color: { rgb: COLORS.border } },
    left: { style: "thin", color: { rgb: COLORS.border } },
    right: { style: "thin", color: { rgb: COLORS.border } },
  };

  const titleStyle = {
    fill: { fgColor: { rgb: COLORS.ink } },
    font: { color: { rgb: COLORS.white }, bold: true, sz: 15 },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  };
  const subtitleStyle = {
    fill: { fgColor: { rgb: COLORS.accent } },
    font: { color: { rgb: COLORS.white }, bold: true, sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  };
  const sectionHeaderStyle = {
    fill: { fgColor: { rgb: COLORS.accentSoft } },
    font: { color: { rgb: COLORS.accent }, bold: true, sz: 11 },
    alignment: { horizontal: "left", vertical: "center" },
    border,
  };
  const labelStyle = {
    fill: { fgColor: { rgb: COLORS.surfaceAlt } },
    font: { color: { rgb: COLORS.muted }, bold: true, sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
    border,
  };
  const valueStyle = {
    fill: { fgColor: { rgb: COLORS.surface } },
    font: { color: { rgb: COLORS.ink }, bold: true, sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
    border,
  };
  const tableHeaderStyle = {
    fill: { fgColor: { rgb: COLORS.header } },
    font: { color: { rgb: COLORS.white }, bold: true, sz: 10 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border,
  };

  const avgConfidence =
    input.rows.length > 0
      ? input.rows.reduce((sum, row) => sum + (Number.isFinite(row.confidence) ? row.confidence : 0), 0) /
        input.rows.length
      : 0;

  const overviewRows: Array<Array<string | number>> = [
    ["Eagle Eye Scanner Report", "", "", ""],
    ["Filtered scanner table export", "", "", ""],
    ["", "", "", ""],
    ["Generated", todayISO(), "Visible Rows", input.summary.visibleRows],
    ["Sort", `${input.summary.sortColumn} (${input.summary.sortDirection.toUpperCase()})`, "Total Rows", input.summary.totalRows],
    ["Search", safeFilterValue(input.filters.search), "Min Confidence", input.filters.minConfidence ?? 0],
    ["Rating Filter", safeFilterValue(input.filters.ratingFilter), "Status Filter", safeFilterValue(input.filters.statusFilter)],
    ["Stage Filter", safeFilterValue(input.filters.stageFilter), "High Volume Only", input.filters.highVolumeOnly ? "Yes" : "No"],
    ["", "", "", ""],
    ["Summary", "", "", ""],
    ["Average Confidence", avgConfidence, "Exported Rows", input.rows.length],
  ];

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
  overviewSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },
  ];
  overviewSheet["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 22 }];
  overviewSheet["!rows"] = overviewRows.map((_, index) => ({ hpt: index <= 1 ? 24 : 20 }));

  Object.keys(overviewSheet).forEach((address) => {
    if (address.startsWith("!")) return;

    const cell = overviewSheet[address] as { t?: string; v?: unknown; s?: Record<string, unknown> };
    const { r, c } = XLSX.utils.decode_cell(address);

    if (r === 0) {
      applyStyle(cell, titleStyle);
      return;
    }
    if (r === 1) {
      applyStyle(cell, subtitleStyle);
      return;
    }
    if (r === 9) {
      applyStyle(cell, sectionHeaderStyle);
      return;
    }
    if (r === 2 || r === 8) {
      applyStyle(cell, { border, fill: { fgColor: { rgb: COLORS.surface } } });
      return;
    }

    const style = c % 2 === 0 ? labelStyle : valueStyle;
    applyStyle(cell, style);

    if (r === 10 && (c === 1 || c === 3)) {
      cell.t = "n";
      cell.s = {
        ...style,
        numFmt: c === 1 ? "0.00" : "#,##0",
        alignment: { horizontal: "right", vertical: "center" },
      };
      return;
    }

    if (r === 5 && c === 3) {
      cell.t = "n";
      cell.s = {
        ...style,
        numFmt: "0",
        alignment: { horizontal: "right", vertical: "center" },
      };
    }
  });

  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

  const scannerRows: Array<Array<string | number>> = [
    ["Eagle Eye Scanner Table", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    [
      `Exported ${todayISO()} | ${input.summary.visibleRows} visible rows | Sorted by ${input.summary.sortColumn} ${input.summary.sortDirection.toUpperCase()}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "#",
      "Ticker",
      "Name",
      "Sector",
      "Stage",
      "Rating",
      "Confidence",
      "Current",
      "Entry",
      "TP1",
      "BVPS",
      "P/E",
      "R:R",
      "Rel Vol",
      "Vol Confirmed",
      "Computed At",
    ],
    ...input.rows.map((row, index) => [
      index + 1,
      row.ticker,
      row.nameEn,
      row.sector,
      row.stage,
      row.rating,
      row.confidence,
      row.lastPrice ?? "",
      row.entryPrimary ?? "",
      row.tp1 ?? "",
      row.bookValuePerShare ?? "",
      row.peRatio ?? "",
      row.rrRatio ?? "",
      row.relativeVolume ?? "",
      formatVolumeConfirmed(row.volumeConfirmed),
      row.computedAt ?? "",
    ]),
  ];

  const tableSheet = XLSX.utils.aoa_to_sheet(scannerRows);
  tableSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 15 } },
  ];
  tableSheet["!cols"] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 14 },
  ];
  tableSheet["!rows"] = scannerRows.map((_, index) => ({ hpt: index <= 1 ? 22 : 20 }));
  tableSheet["!autofilter"] = { ref: `A3:P${Math.max(scannerRows.length, 3)}` };

  Object.keys(tableSheet).forEach((address) => {
    if (address.startsWith("!")) return;

    const cell = tableSheet[address] as { t?: string; v?: unknown; s?: Record<string, unknown> };
    const { r, c } = XLSX.utils.decode_cell(address);

    if (r === 0) {
      applyStyle(cell, titleStyle);
      return;
    }
    if (r === 1) {
      applyStyle(cell, subtitleStyle);
      return;
    }
    if (r === 2) {
      applyStyle(cell, tableHeaderStyle);
      return;
    }

    const rowFill = (r - 3) % 2 === 0 ? COLORS.surface : COLORS.surfaceAlt;
    const textStyle = {
      fill: { fgColor: { rgb: rowFill } },
      font: { color: { rgb: COLORS.ink }, sz: 10 },
      alignment: { horizontal: c >= 6 && c <= 13 ? "right" : "left", vertical: "center" },
      border,
    };

    applyStyle(cell, textStyle);

    if (c >= 6 && c <= 13) {
      if (cell.v === "" || cell.v == null) {
        cell.t = "s";
        cell.v = "-";
        cell.s = { ...textStyle, alignment: { horizontal: "center", vertical: "center" } };
        return;
      }

      cell.t = "n";
      let numFmt = "#,##0.000";
      if (c === 6) numFmt = "0.0";
      if (c === 12 || c === 13) numFmt = "0.00";
      if (c === 11) numFmt = "0.00";
      cell.s = {
        ...textStyle,
        numFmt,
        font: {
          color: {
            rgb:
              c === 11 || c === 12
                ? Number(cell.v) >= 0
                  ? COLORS.positive
                  : COLORS.negative
                : COLORS.ink,
          },
          sz: 10,
          bold: c === 11 || c === 12,
        },
      };
      return;
    }

    if (c === 0) {
      cell.t = "n";
      cell.s = {
        ...textStyle,
        numFmt: "#,##0",
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
  });

  XLSX.utils.book_append_sheet(workbook, tableSheet, "Scanner");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(output);
}

export async function exportEagleEyeScannerReport(input: EagleEyeScannerReportInput): Promise<void> {
  const workbook = await buildWorkbook(input);
  const filename = `eagle_eye_scanner_${todayISO()}.xlsx`;

  if (Platform.OS === "web") {
    const blob = new Blob([workbook], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return;
  }

  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  const fileUri = FileSystem.documentDirectory + filename;
  const XLSX = await import("xlsx-js-style");
  const base64 = XLSX.write(await XLSX.read(workbook, { type: "array" }), { type: "base64", bookType: "xlsx" });

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri);
  }
}
