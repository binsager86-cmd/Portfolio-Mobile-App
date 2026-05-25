import { todayISO } from "@/lib/dateUtils";
import { Platform } from "react-native";

export type ExportableRealizedTransaction = {
  symbol: string;
  portfolio: string;
  txnDate: string;
  purchaseValueKwd: number;
  shares: number;
  realizedPnlKwd: number;
  cashDividendsKwd: number;
  netPnlKwd: number;
  pnlPct: number | null;
};

export type RealizedTransactionsReportInput = {
  rows: ExportableRealizedTransaction[];
  filters: {
    symbol?: string;
    fromDate?: string;
    toDate?: string;
  };
  summary: {
    totalRealizedKwd: number;
    grossGainsKwd: number;
    grossLossesKwd: number;
    totalTrades: number;
    visibleTrades: number;
    currency: string;
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

async function buildWorkbook(input: RealizedTransactionsReportInput): Promise<Uint8Array> {
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

  const overviewRows: Array<Array<string | number>> = [
    ["Realized Transactions Report", "", "", ""],
    ["Filtered, sorted, and dividend-adjusted realized trade breakdown", "", "", ""],
    ["", "", "", ""],
    ["Generated", todayISO(), "Visible Trades", input.summary.visibleTrades],
    ["Currency", input.summary.currency, "All Trades", input.summary.totalTrades],
    ["Sort", `${input.summary.sortColumn} (${input.summary.sortDirection.toUpperCase()})`, "Symbol Filter", safeFilterValue(input.filters.symbol)],
    ["From Date", safeFilterValue(input.filters.fromDate), "To Date", safeFilterValue(input.filters.toDate)],
    ["", "", "", ""],
    ["Summary", "", "", ""],
    ["Total Realized", input.summary.totalRealizedKwd, "Gross Gains", input.summary.grossGainsKwd],
    ["Gross Losses", Math.abs(input.summary.grossLossesKwd), "Exported Rows", input.rows.length],
  ];

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
  overviewSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 3 } },
  ];
  overviewSheet["!cols"] = [{ wch: 20 }, { wch: 26 }, { wch: 20 }, { wch: 22 }];
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
    if (r === 8) {
      applyStyle(cell, sectionHeaderStyle);
      return;
    }
    if (r === 2 || r === 7) {
      applyStyle(cell, { border, fill: { fgColor: { rgb: COLORS.surface } } });
      return;
    }
    const style = c % 2 === 0 ? labelStyle : valueStyle;
    applyStyle(cell, style);
    if ((r === 9 || r === 10) && (c === 1 || c === 3)) {
      cell.t = "n";
      cell.s = {
        ...style,
        numFmt: '#,##0.000 "KWD"',
        alignment: { horizontal: "right", vertical: "center" },
      };
    }
  });
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

  const transactionRows: Array<Array<string | number | null>> = [
    ["Realized Transactions", "", "", "", "", "", "", "", "", ""],
    [
      `Exported ${todayISO()} | ${input.summary.visibleTrades} visible trades | Sorted by ${input.summary.sortColumn} ${input.summary.sortDirection.toUpperCase()}`,
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
    ["#", "Symbol", "Portfolio", "Date", "Purchase Value (KWD)", "Shares", "Realized P&L (KWD)", "Cash Dividends (KWD)", "Net P/L (KWD)", "P&L %"],
    ...input.rows.map((row, index) => [
      index + 1,
      row.symbol,
      row.portfolio,
      row.txnDate,
      row.purchaseValueKwd,
      row.shares,
      row.realizedPnlKwd,
      row.cashDividendsKwd,
      row.netPnlKwd,
      row.pnlPct == null ? null : row.pnlPct / 100,
    ]),
  ];

  const transactionSheet = XLSX.utils.aoa_to_sheet(transactionRows);
  transactionSheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ];
  transactionSheet["!cols"] = [
    { wch: 5 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 10 },
  ];
  transactionSheet["!rows"] = transactionRows.map((_, index) => ({ hpt: index <= 1 ? 22 : 20 }));
  transactionSheet["!autofilter"] = { ref: `A3:J${Math.max(transactionRows.length, 3)}` };

  Object.keys(transactionSheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = transactionSheet[address] as { t?: string; v?: unknown; s?: Record<string, unknown> };
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
    const numericStyle = {
      fill: { fgColor: { rgb: rowFill } },
      font: { color: { rgb: COLORS.ink }, sz: 10 },
      alignment: { horizontal: "right", vertical: "center" },
      border,
    };
    const textStyle = {
      fill: { fgColor: { rgb: rowFill } },
      font: { color: { rgb: COLORS.ink }, sz: 10 },
      alignment: { horizontal: c >= 4 ? "right" : "left", vertical: "center" },
      border,
    };

    applyStyle(cell, c >= 4 ? numericStyle : textStyle);

    if (c === 4 || c === 6 || c === 8) {
      const value = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0);
      cell.t = "n";
      cell.s = {
        ...numericStyle,
        font: {
          color: { rgb: c === 4 ? COLORS.ink : value >= 0 ? COLORS.positive : COLORS.negative },
          bold: c !== 4,
          sz: 10,
        },
        numFmt: '#,##0.000 "KWD"',
      };
      return;
    }

    if (c === 7) {
      const value = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0);
      cell.t = "n";
      cell.s = {
        ...numericStyle,
        font: {
          color: { rgb: value > 0 ? COLORS.positive : COLORS.muted },
          sz: 10,
        },
        numFmt: '#,##0.000 "KWD"',
      };
      return;
    }

    if (c === 5) {
      cell.t = "n";
      cell.s = { ...numericStyle, numFmt: "#,##0" };
      return;
    }

    if (c === 9) {
      if (cell.v == null || cell.v === "") {
        cell.t = "s";
        cell.v = "-";
        cell.s = { ...numericStyle, alignment: { horizontal: "center", vertical: "center" } };
        return;
      }
      const value = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0);
      cell.t = "n";
      cell.s = {
        ...numericStyle,
        font: {
          color: { rgb: value >= 0 ? COLORS.positive : COLORS.negative },
          bold: true,
          sz: 10,
        },
        numFmt: "0.00%",
      };
      return;
    }
  });
  XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(output);
}

export async function exportRealizedTransactionsReport(input: RealizedTransactionsReportInput): Promise<void> {
  const workbook = await buildWorkbook(input);
  const filename = `realized_transactions_${todayISO()}.xlsx`;

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