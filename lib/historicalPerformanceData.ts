import type {
  DividendRecord,
  RealizedProfitDetail,
  SnapshotRecord,
} from "@/services/api/types";

export interface YearlyPerformanceDataPoint {
  year: string;
  portfolioValue: number;
  growth: number;
  deposits: number;
  dividends: number;
  appreciation: number;
  realizedPnl: number;
  hasSnapshot: boolean;
}

export type PeriodMode = "calendar" | "fiscal-apr";

function safeNum(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseIsoDateParts(dateIso: string): { year: number; month: number } | null {
  if (typeof dateIso !== "string" || dateIso.length < 10) return null;
  const year = Number(dateIso.slice(0, 4));
  const month = Number(dateIso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Returns period key year for a date.
 * - calendar: YYYY
 * - fiscal-apr: fiscal year ending year (FY2023 = 2022-05-01..2023-04-30)
 */
export function getPeriodYearKey(dateIso: string, periodMode: PeriodMode = "calendar"): string | null {
  const parts = parseIsoDateParts(dateIso);
  if (!parts) return null;
  if (periodMode === "calendar") return String(parts.year);
  return String(parts.month >= 5 ? parts.year + 1 : parts.year);
}

export function formatPeriodYearLabel(yearKey: string, periodMode: PeriodMode = "calendar"): string {
  if (periodMode === "calendar") return yearKey;
  return `FY${yearKey}`;
}

export function dedupeSnapshotsByDate(
  snapshots: SnapshotRecord[],
): SnapshotRecord[] {
  const byDate = new Map<string, SnapshotRecord>();

  for (const snap of snapshots) {
    const existing = byDate.get(snap.snapshot_date);
    if (!existing) {
      byDate.set(snap.snapshot_date, snap);
      continue;
    }

    const existingCreated = safeNum(existing.created_at);
    const nextCreated = safeNum(snap.created_at);

    if (nextCreated > existingCreated) {
      byDate.set(snap.snapshot_date, snap);
      continue;
    }

    if (nextCreated === existingCreated && safeNum(snap.id) > safeNum(existing.id)) {
      byDate.set(snap.snapshot_date, snap);
    }
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  );
}

function groupSnapshotsByYear(
  snapshots: SnapshotRecord[],
  periodMode: PeriodMode,
): Map<string, SnapshotRecord[]> {
  const grouped = new Map<string, SnapshotRecord[]>();
  for (const snap of snapshots) {
    const year = getPeriodYearKey(snap.snapshot_date, periodMode);
    if (!year) continue;
    const arr = grouped.get(year) ?? [];
    arr.push(snap);
    grouped.set(year, arr);
  }
  return grouped;
}

export function buildYearlyHistoricalData(args: {
  snapshots: SnapshotRecord[];
  dividends: DividendRecord[];
  realizedDetails: RealizedProfitDetail[];
  livePortfolioValue?: number;
  liveAsOfDate?: string;
  periodMode?: PeriodMode;
}): YearlyPerformanceDataPoint[] {
  const periodMode = args.periodMode ?? "calendar";
  const snapshots = dedupeSnapshotsByDate(args.snapshots);
  const byYear = groupSnapshotsByYear(snapshots, periodMode);
  const hasLiveValue =
    typeof args.livePortfolioValue === "number" &&
    Number.isFinite(args.livePortfolioValue);
  const liveValue = hasLiveValue ? safeNum(args.livePortfolioValue) : 0;
  const liveAsOfDate =
    typeof args.liveAsOfDate === "string" && args.liveAsOfDate.length >= 10
      ? args.liveAsOfDate.slice(0, 10)
      : null;

  const divByYear = new Map<string, number>();
  for (const div of args.dividends) {
    const year = getPeriodYearKey(div.txn_date, periodMode);
    if (!year) continue;
    divByYear.set(year, round3((divByYear.get(year) ?? 0) + safeNum(div.cash_dividend_kwd)));
  }

  const realizedByYear = new Map<string, number>();
  for (const row of args.realizedDetails) {
    const year = getPeriodYearKey(row.txn_date, periodMode);
    if (!year) continue;
    const netPnlKwd =
      safeNum(row.net_pnl_kwd) ||
      (safeNum(row.realized_pnl_kwd) + safeNum(row.dividends_allocated_kwd));
    realizedByYear.set(year, round3((realizedByYear.get(year) ?? 0) + netPnlKwd));
  }

  const allYears = new Set<string>([
    ...byYear.keys(),
    ...divByYear.keys(),
    ...realizedByYear.keys(),
  ]);

  const years = Array.from(allYears).sort((a, b) => Number(a) - Number(b));
  if (!years.length) return [];

  let hasPrevSnapshotYear = false;
  let prevYearEndValue = 0;
  let prevYearEndAccumulatedCash = 0;

  return years.map((year) => {
    const yearSnapshots = byYear.get(year);
    const dividends = divByYear.get(year) ?? 0;
    const realizedPnl = realizedByYear.get(year) ?? 0;

    if (!yearSnapshots || !yearSnapshots.length) {
      return {
        year,
        portfolioValue: 0,
        growth: 0,
        deposits: 0,
        dividends,
        appreciation: 0,
        realizedPnl,
        hasSnapshot: false,
      };
    }

    const sorted = [...yearSnapshots].sort((a, b) =>
      a.snapshot_date.localeCompare(b.snapshot_date),
    );

    const yearStart = sorted[0];
    const yearEnd = sorted[sorted.length - 1];

    let yearEndValue = safeNum(yearEnd.portfolio_value);
    const yearEndAccumulated = safeNum(yearEnd.accumulated_cash);
    const yearStartValue = safeNum(yearStart.portfolio_value);
    const yearStartAccumulated = safeNum(yearStart.accumulated_cash);

    // For the current year, use today's live overview value when snapshots lag behind.
    if (
      hasLiveValue &&
      liveAsOfDate &&
      getPeriodYearKey(liveAsOfDate, periodMode) === year &&
      liveAsOfDate >= yearEnd.snapshot_date
    ) {
      yearEndValue = liveValue;
    }

    const startValue = hasPrevSnapshotYear ? prevYearEndValue : yearStartValue;
    const accumulatedBaseline =
      hasPrevSnapshotYear ? prevYearEndAccumulatedCash : yearStartAccumulated;
    const growth = yearEndValue - startValue;
    const netDepositsThisYear = yearEndAccumulated - accumulatedBaseline;
    const appreciation = growth - netDepositsThisYear;

    hasPrevSnapshotYear = true;
    prevYearEndValue = yearEndValue;
    prevYearEndAccumulatedCash = yearEndAccumulated;

    return {
      year,
      portfolioValue: round3(yearEndValue),
      growth: round3(growth),
      deposits: round3(netDepositsThisYear),
      dividends: round3(dividends),
      appreciation: round3(appreciation),
      realizedPnl: round3(realizedPnl),
      hasSnapshot: true,
    };
  });
}
