/**
 * Performance, risk, snapshots & trading endpoints.
 */

import { dedupeSnapshotsByDate } from "@/lib/historicalPerformanceData";
import api from "../client";
import type {
  PerformanceData,
  RealizedProfitData,
  RealizedProfitDetail,
  RiskMetrics,
  SnapshotRecord,
  TradingSummaryResponse,
} from "../types";

type UnknownRecord = Record<string, unknown>;

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function roundKwd(value: number): number {
  if (Math.abs(value) < 0.0005) return 0;
  return Math.round(value * 1000) / 1000;
}

function asRecord(value: unknown): UnknownRecord {
  return value as UnknownRecord;
}

function normalizeRealizedProfitDetail(detail: RealizedProfitDetail | Record<string, unknown>): RealizedProfitDetail {
  const raw = asRecord(detail);
  const realizedPnlKwd = asFiniteNumber(raw["realized_pnl_kwd"]) ?? asFiniteNumber(raw["realizedPnlKwd"]) ?? 0;
  const explicitDividend =
    asFiniteNumber(raw["dividends_allocated_kwd"]) ??
    asFiniteNumber(raw["dividendsAllocatedKwd"]) ??
    asFiniteNumber(raw["cash_dividends_kwd"]) ??
    asFiniteNumber(raw["cashDividendsKwd"]) ??
    asFiniteNumber(raw["cash_dividend"]) ??
    asFiniteNumber(raw["cashDividend"]) ??
    asFiniteNumber(raw["dividend"]) ??
    asFiniteNumber(raw["dividends_received_kwd"]) ??
    asFiniteNumber(raw["dividendsReceivedKwd"]) ??
    asFiniteNumber(raw["dividends_received"]) ??
    asFiniteNumber(raw["dividendsReceived"]);
  const rawNetPnlKwd = asFiniteNumber(raw["net_pnl_kwd"]) ?? asFiniteNumber(raw["netPnlKwd"]);
  const derivedDividend = rawNetPnlKwd != null ? roundKwd(rawNetPnlKwd - realizedPnlKwd) : undefined;
  const dividendsAllocatedKwd = roundKwd(explicitDividend ?? derivedDividend ?? 0);
  const netPnlKwd = roundKwd(rawNetPnlKwd ?? (realizedPnlKwd + dividendsAllocatedKwd));

  return {
    ...(detail as RealizedProfitDetail),
    id: asFiniteNumber(raw["id"]) ?? 0,
    symbol: typeof raw["symbol"] === "string" ? raw["symbol"] : typeof raw["stock_symbol"] === "string" ? raw["stock_symbol"] : "",
    portfolio: typeof raw["portfolio"] === "string" ? raw["portfolio"] : "",
    txn_date: typeof raw["txn_date"] === "string" ? raw["txn_date"] : typeof raw["txnDate"] === "string" ? raw["txnDate"] : "",
    shares: asFiniteNumber(raw["shares"]) ?? 0,
    sell_value: asFiniteNumber(raw["sell_value"]) ?? asFiniteNumber(raw["sellValue"]) ?? 0,
    avg_cost_at_txn: asFiniteNumber(raw["avg_cost_at_txn"]) ?? asFiniteNumber(raw["avgCostAtTxn"]) ?? 0,
    realized_pnl: asFiniteNumber(raw["realized_pnl"]) ?? asFiniteNumber(raw["realizedPnl"]) ?? realizedPnlKwd,
    realized_pnl_kwd: roundKwd(realizedPnlKwd),
    dividends_allocated_kwd: dividendsAllocatedKwd,
    net_pnl_kwd: netPnlKwd,
    currency: typeof raw["currency"] === "string" ? raw["currency"] : "KWD",
    source: typeof raw["source"] === "string" ? raw["source"] : "calculated",
  };
}

function normalizeRealizedProfit(data: RealizedProfitData | Record<string, unknown>): RealizedProfitData {
  const raw = asRecord(data);
  const details = Array.isArray(raw["details"])
    ? raw["details"].map((detail) => normalizeRealizedProfitDetail(detail as RealizedProfitDetail | Record<string, unknown>))
    : [];

  return {
    ...(data as RealizedProfitData),
    total_realized_kwd: roundKwd(asFiniteNumber(raw["total_realized_kwd"]) ?? asFiniteNumber(raw["totalRealizedKwd"]) ?? 0),
    total_profit_kwd: roundKwd(asFiniteNumber(raw["total_profit_kwd"]) ?? asFiniteNumber(raw["totalProfitKwd"]) ?? 0),
    total_loss_kwd: roundKwd(asFiniteNumber(raw["total_loss_kwd"]) ?? asFiniteNumber(raw["totalLossKwd"]) ?? 0),
    total_dividends_allocated_kwd: roundKwd(
      asFiniteNumber(raw["total_dividends_allocated_kwd"]) ??
        asFiniteNumber(raw["totalDividendsAllocatedKwd"]) ??
        details.reduce((sum, detail) => sum + (detail.dividends_allocated_kwd ?? 0), 0),
    ),
    details,
  };
}

// ── Performance & Risk ──────────────────────────────────────────────

/** Get portfolio performance (TWR, MWRR, ROI). */
export async function getPerformance(params?: {
  portfolio?: string;
  period?: string;
}): Promise<PerformanceData> {
  const { data } = await api.get<{ status: string; data: PerformanceData }>(
    "/api/v1/analytics/performance",
    { params }
  );
  return data.data;
}

/** Get risk metrics (Sharpe, Sortino). */
export async function getRiskMetrics(params: {
  rf_rate: number;
  mar?: number;
}): Promise<RiskMetrics> {
  const { data } = await api.get<{ status: string; data: RiskMetrics }>(
    "/api/v1/analytics/risk-metrics",
    { params }
  );
  return data.data;
}

/** Get stored risk-free rate for current user. */
export async function getRfRate(): Promise<number | null> {
  const { data } = await api.get<{ status: string; data: { rf_rate: number | null } }>(
    "/api/v1/analytics/settings/rf-rate"
  );
  return data.data.rf_rate;
}

/** Save risk-free rate for current user (percentage, e.g. 4.25). */
export async function setRfRate(rfRate: number): Promise<number> {
  const { data } = await api.put<{ status: string; data: { rf_rate: number } }>(
    "/api/v1/analytics/settings/rf-rate",
    null,
    { params: { rf_rate: rfRate } }
  );
  return data.data.rf_rate;
}

/** Get realized profit breakdown. */
export async function getRealizedProfit(): Promise<RealizedProfitData> {
  const { data } = await api.get<{ status: string; data: RealizedProfitData }>(
    "/api/v1/analytics/realized-profit"
  );
  return normalizeRealizedProfit(data.data);
}

/** Get portfolio snapshots (date-filtered). */
export async function getSnapshots(params?: {
  portfolio?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ snapshots: SnapshotRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { snapshots: SnapshotRecord[]; count: number } }>(
    "/api/v1/analytics/snapshots",
    { params }
  );
  const normalized = dedupeSnapshotsByDate(data.data.snapshots).sort((a, b) =>
    b.snapshot_date.localeCompare(a.snapshot_date),
  );
  return {
    ...data.data,
    snapshots: normalized,
    count: normalized.length,
  };
}

// ── Trading ─────────────────────────────────────────────────────────

/** Get trading section summary with enriched transactions. */
export async function getTradingSummary(params?: {
  portfolio?: string;
  txn_type?: string;
  search?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<TradingSummaryResponse> {
  const { data } = await api.get<{ status: string; data: TradingSummaryResponse }>(
    "/api/v1/portfolio/trading-summary",
    { params }
  );
  return data.data;
}

/** Recalculate WAC for all positions and backfill avg_cost columns. */
export async function recalculateWAC(): Promise<{
  updated: number;
  positions_processed: number;
  errors: string[];
}> {
  const { data } = await api.post<{
    status: string;
    data: { updated: number; positions_processed: number; errors: string[] };
  }>("/api/v1/portfolio/trading-recalculate");
  return data.data;
}

/** Export trading data as Excel file. Returns blob URL for download/sharing. */
export async function exportTradingExcel(): Promise<Blob> {
  const { data } = await api.get("/api/v1/portfolio/trading-export", {
    responseType: "blob",
  });
  return data;
}
