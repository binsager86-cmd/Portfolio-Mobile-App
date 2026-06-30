import {
  buildYearlyHistoricalData,
  dedupeSnapshotsByDate,
} from "@/lib/historicalPerformanceData";
import type {
  DividendRecord,
  RealizedProfitDetail,
  SnapshotRecord,
} from "@/services/api/types";

function makeSnapshot(overrides: Partial<SnapshotRecord>): SnapshotRecord {
  return {
    id: 1,
    snapshot_date: "2025-01-01",
    portfolio_value: 0,
    daily_movement: 0,
    beginning_difference: 0,
    deposit_cash: 0,
    accumulated_cash: 0,
    net_gain: 0,
    change_percent: 0,
    roi_percent: 0,
    twr_percent: null,
    mwrr_percent: null,
    created_at: 0,
    ...overrides,
  };
}

function makeDividend(overrides: Partial<DividendRecord>): DividendRecord {
  return {
    id: 1,
    stock_symbol: "TEST",
    portfolio: "KFH",
    txn_date: "2025-01-01",
    cash_dividend: 0,
    bonus_shares: 0,
    reinvested_dividend: 0,
    currency: "KWD",
    cash_dividend_kwd: 0,
    reinvested_kwd: 0,
    notes: null,
    ...overrides,
  };
}

function makeRealized(overrides: Partial<RealizedProfitDetail>): RealizedProfitDetail {
  return {
    id: 1,
    symbol: "TEST",
    portfolio: "KFH",
    txn_date: "2025-01-01",
    shares: 0,
    sell_value: 0,
    avg_cost_at_txn: 0,
    realized_pnl: 0,
    realized_pnl_kwd: 0,
    dividends_allocated_kwd: 0,
    net_pnl_kwd: 0,
    currency: "KWD",
    source: "calculated",
    ...overrides,
  };
}

describe("dedupeSnapshotsByDate", () => {
  it("keeps the newest row per snapshot_date", () => {
    const input: SnapshotRecord[] = [
      makeSnapshot({ id: 10, snapshot_date: "2025-01-01", created_at: 100, portfolio_value: 100 }),
      makeSnapshot({ id: 11, snapshot_date: "2025-01-01", created_at: 200, portfolio_value: 200 }),
      makeSnapshot({ id: 12, snapshot_date: "2025-01-02", created_at: 150, portfolio_value: 300 }),
    ];

    const out = dedupeSnapshotsByDate(input);

    expect(out).toHaveLength(2);
    expect(out[0].snapshot_date).toBe("2025-01-01");
    expect(out[0].id).toBe(11);
    expect(out[0].portfolio_value).toBe(200);
    expect(out[1].snapshot_date).toBe("2025-01-02");
  });
});

describe("buildYearlyHistoricalData", () => {
  it("uses accumulated_cash delta for yearly net deposits", () => {
    const snapshots: SnapshotRecord[] = [
      makeSnapshot({
        id: 1,
        snapshot_date: "2024-12-31",
        portfolio_value: 100,
        deposit_cash: 0,
        accumulated_cash: 40,
        created_at: 1,
      }),
      makeSnapshot({
        id: 2,
        snapshot_date: "2025-01-02",
        portfolio_value: 120,
        deposit_cash: 20,
        accumulated_cash: 60,
        created_at: 2,
      }),
      makeSnapshot({
        id: 3,
        snapshot_date: "2025-12-31",
        portfolio_value: 240,
        deposit_cash: 0,
        accumulated_cash: 140,
        created_at: 3,
      }),
    ];

    const data = buildYearlyHistoricalData({
      snapshots,
      dividends: [],
      realizedDetails: [],
    });

    const y2025 = data.find((row) => row.year === "2025");
    expect(y2025).toBeDefined();
    expect(y2025?.hasSnapshot).toBe(true);

    // Growth = 2025 end minus prior year-end = 240 - 100
    expect(y2025?.growth).toBe(140);

    // Appreciation = (240 - 100) - (140 - 40) = 40
    expect(y2025?.appreciation).toBe(40);
  });

  it("uses first/last snapshot in the first available year for growth baseline", () => {
    const data = buildYearlyHistoricalData({
      snapshots: [
        makeSnapshot({ id: 1, snapshot_date: "2025-01-15", portfolio_value: 136151.259, accumulated_cash: 0, created_at: 1 }),
        makeSnapshot({ id: 2, snapshot_date: "2025-12-31", portfolio_value: 145746.0, accumulated_cash: 10794.359, created_at: 2 }),
      ],
      dividends: [],
      realizedDetails: [],
    });

    const y2025 = data.find((row) => row.year === "2025");
    expect(y2025).toBeDefined();
    expect(y2025?.hasSnapshot).toBe(true);
    // First available year should not be measured from zero.
    expect(y2025?.growth).toBeCloseTo(9594.741, 3);
  });

  it("uses previous year-end baseline even when prior value is non-positive", () => {
    const data = buildYearlyHistoricalData({
      snapshots: [
        makeSnapshot({ id: 1, snapshot_date: "2024-12-31", portfolio_value: -100, accumulated_cash: 1000, created_at: 1 }),
        makeSnapshot({ id: 2, snapshot_date: "2025-12-31", portfolio_value: 50, accumulated_cash: 1200, created_at: 2 }),
      ],
      dividends: [],
      realizedDetails: [],
    });

    const y2025 = data.find((row) => row.year === "2025");
    expect(y2025).toBeDefined();
    // Growth should be 50 - (-100) = 150, not 0-based.
    expect(y2025?.growth).toBe(150);
    // Appreciation = growth - net deposits = 150 - 200.
    expect(y2025?.appreciation).toBe(-50);
  });

  it("uses live as-of value for current-year growth when snapshots are not up to today", () => {
    const data = buildYearlyHistoricalData({
      snapshots: [
        makeSnapshot({ id: 1, snapshot_date: "2025-12-31", portfolio_value: 145, accumulated_cash: 100, created_at: 1 }),
        makeSnapshot({ id: 2, snapshot_date: "2026-06-02", portfolio_value: 160, accumulated_cash: 130, created_at: 2 }),
      ],
      dividends: [],
      realizedDetails: [],
      livePortfolioValue: 170,
      liveAsOfDate: "2026-06-04",
    });

    const y2026 = data.find((row) => row.year === "2026");
    expect(y2026).toBeDefined();
    expect(y2026?.hasSnapshot).toBe(true);
    // Growth should use live value through today: 170 - 145 = 25.
    expect(y2026?.growth).toBe(25);
    expect(y2026?.portfolioValue).toBe(170);
  });

  it("retains years with dividends/realized data even without snapshots", () => {
    const data = buildYearlyHistoricalData({
      snapshots: [
        makeSnapshot({
          id: 1,
          snapshot_date: "2025-12-31",
          portfolio_value: 250,
          accumulated_cash: 140,
          created_at: 10,
        }),
      ],
      dividends: [
        makeDividend({ txn_date: "2026-03-01", cash_dividend_kwd: 25 }),
      ],
      realizedDetails: [
        makeRealized({ txn_date: "2026-04-01", realized_pnl_kwd: 10 }),
      ],
    });

    const y2026 = data.find((row) => row.year === "2026");
    expect(y2026).toBeDefined();
    expect(y2026?.hasSnapshot).toBe(false);
    expect(y2026?.dividends).toBe(25);
    expect(y2026?.realizedPnl).toBe(10);
    expect(y2026?.portfolioValue).toBe(0);
    expect(y2026?.growth).toBe(0);
  });

  it("uses net_pnl_kwd (or realized+dividends fallback) for yearly realized totals", () => {
    const data = buildYearlyHistoricalData({
      snapshots: [
        makeSnapshot({
          id: 1,
          snapshot_date: "2025-12-31",
          portfolio_value: 250,
          accumulated_cash: 140,
          created_at: 10,
        }),
      ],
      dividends: [],
      realizedDetails: [
        // Explicit net P/L should be used directly.
        makeRealized({
          id: 1,
          txn_date: "2026-01-15",
          realized_pnl_kwd: 10,
          dividends_allocated_kwd: 5,
          net_pnl_kwd: 18,
        }),
        // Missing net P/L should fall back to realized + dividends.
        makeRealized({
          id: 2,
          txn_date: "2026-03-10",
          realized_pnl_kwd: 7,
          dividends_allocated_kwd: 3,
          net_pnl_kwd: undefined,
        }),
      ],
    });

    const y2026 = data.find((row) => row.year === "2026");
    expect(y2026).toBeDefined();
    expect(y2026?.realizedPnl).toBe(28);
  });
});
