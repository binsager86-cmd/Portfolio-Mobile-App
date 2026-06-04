import type {
  DividendRecord,
  RealizedProfitDetail,
  SnapshotRecord,
} from "@/services/api/types";

export interface YearlyPerformanceDataPoint {
  year: string;
  portfolioValue: number;
  growth: number;
  dividends: number;
  appreciation: number;
  realizedPnl: number;
  hasSnapshot: boolean;
}

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
): Map<string, SnapshotRecord[]> {
  const grouped = new Map<string, SnapshotRecord[]>();
  for (const snap of snapshots) {
    const year = snap.snapshot_date.slice(0, 4);
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
}): YearlyPerformanceDataPoint[] {
  const snapshots = dedupeSnapshotsByDate(args.snapshots);
  const byYear = groupSnapshotsByYear(snapshots);

  const divByYear = new Map<string, number>();
  for (const div of args.dividends) {
    const year = div.txn_date.slice(0, 4);
    divByYear.set(year, round3((divByYear.get(year) ?? 0) + safeNum(div.cash_dividend_kwd)));
  }

  const realizedByYear = new Map<string, number>();
  for (const row of args.realizedDetails) {
    const year = row.txn_date.slice(0, 4);
    realizedByYear.set(year, round3((realizedByYear.get(year) ?? 0) + safeNum(row.realized_pnl_kwd)));
  }

  const allYears = new Set<string>([
    ...byYear.keys(),
    ...divByYear.keys(),
    ...realizedByYear.keys(),
  ]);

  const years = Array.from(allYears).sort();
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

    const yearEndValue = safeNum(yearEnd.portfolio_value);
    const yearStartValue = safeNum(yearStart.portfolio_value);
    const yearStartAccumulated = safeNum(yearStart.accumulated_cash);
    const yearEndAccumulated = safeNum(yearEnd.accumulated_cash);

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
      dividends: round3(dividends),
      appreciation: round3(appreciation),
      realizedPnl: round3(realizedPnl),
      hasSnapshot: true,
    };
  });
}
