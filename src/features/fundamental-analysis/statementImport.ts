export type ImportedStatementType = "income" | "balance" | "cashflow" | "equity";

export interface ImportedLineItem {
  code: string;
  name: string;
  amount: number;
  is_total: boolean;
}

export interface ImportedStatement {
  statement_type: ImportedStatementType;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string;
  line_items: ImportedLineItem[];
}

const QUARTER_ENDS: Record<number, string> = {
  1: "03-31",
  2: "06-30",
  3: "09-30",
  4: "12-31",
};

export function detectStatementType(sheetName: string): ImportedStatementType | null {
  const normalized = sheetName.toLowerCase().trim();
  if (/balance|financial\s*position|bs\b/.test(normalized)) return "balance";
  if (/income|profit|loss|p\s*&\s*l|p&l|earnings/.test(normalized)) return "income";
  if (/cash\s*flow|cashflow|cf\b/.test(normalized)) return "cashflow";
  if (/equity|changes\s*in\s*equity/.test(normalized)) return "equity";
  return null;
}

export function parseImportedCellAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim();
  if (!raw || /^[-–—]+$/.test(raw) || /^(n\/a|na|null)$/i.test(raw)) return null;

  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[(),$\s]/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function normalizeLineItemCode(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "line_item";
}

function parsePeriodHeader(header: unknown): { year: number; quarter: number | null; periodEnd: string } | null {
  const text = String(header ?? "").trim();
  if (!text) return null;

  const quarterFirst = text.match(/\bq([1-4])\b[^0-9]*(\d{4})/i);
  const yearFirst = text.match(/\b(\d{4})\b[^q]*\bq([1-4])\b/i);
  const quarter = quarterFirst ? Number(quarterFirst[1]) : yearFirst ? Number(yearFirst[2]) : null;
  const yearMatch = quarterFirst ? quarterFirst[2] : yearFirst ? yearFirst[1] : text.match(/\b(\d{4})\b/)?.[1];
  if (!yearMatch) return null;

  const year = Number(yearMatch);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;

  const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicitDate) return { year, quarter, periodEnd: explicitDate };

  return {
    year,
    quarter,
    periodEnd: `${year}-${quarter ? QUARTER_ENDS[quarter] : "12-31"}`,
  };
}

export function buildImportedStatementsFromSheet(
  rows: unknown[][],
  statementType: ImportedStatementType,
): ImportedStatement[] {
  const headers = rows[0] ?? [];
  const periods = headers
    .map((header, colIdx) => ({ colIdx, period: colIdx > 0 ? parsePeriodHeader(header) : null }))
    .filter((entry): entry is { colIdx: number; period: NonNullable<ReturnType<typeof parsePeriodHeader>> } => entry.period != null);

  return periods.map(({ colIdx, period }) => {
    const codeCounts = new Map<string, number>();
    const lineItems: ImportedLineItem[] = [];

    for (const row of rows.slice(1)) {
      const name = String(row[0] ?? "").trim();
      if (!name) continue;

      const amount = parseImportedCellAmount(row[colIdx]);
      if (amount == null) continue;

      const baseCode = normalizeLineItemCode(name);
      const count = (codeCounts.get(baseCode) ?? 0) + 1;
      codeCounts.set(baseCode, count);

      const lowerName = name.toLowerCase();
      lineItems.push({
        code: count === 1 ? baseCode : `${baseCode}_${count}`,
        name,
        amount,
        is_total: lowerName.includes("total") || lowerName.startsWith("net "),
      });
    }

    return {
      statement_type: statementType,
      fiscal_year: period.year,
      fiscal_quarter: period.quarter,
      period_end_date: period.periodEnd,
      line_items: lineItems,
    };
  });
}