/**
 * Trade Signals API client.
 */

import api from "../client";

export type Quarter = "q1" | "q2" | "q3" | "q4";
export type QuarterRow = Record<Quarter, number | null>;

export interface PEQuarterlyVerdict {
  verdict: "overvalued" | "undervalued" | "fair" | "unknown";
  scale: 0 | 1 | 2 | 3 | 4;
  scaleLabel: "n/a" | "minimal" | "mild" | "strong" | "extreme";
  diffPct: number | null;
  diffAbs: number | null;
}

export interface PEQuarterlyResponse {
  symbol: string;
  company_name: string | null;
  yf_ticker: string | null;
  years: number[];
  pe_table: Record<string, QuarterRow>;
  growth_table: Record<string, QuarterRow>;
  averages: QuarterRow;
  current_pe: number | null;
  current_quarter: Quarter;
  compare_quarter_avg: number | null;
  verdict: PEQuarterlyVerdict;
  source: string;
}

/** Fetch quarterly P/E history + verdict for a fundamental-analysis stock. */
export async function getPEQuarterly(stockId: number): Promise<PEQuarterlyResponse> {
  const { data } = await api.get<{ status: string; data: PEQuarterlyResponse }>(
    `/api/v1/trade-signals/pe-quarterly/${stockId}`,
  );
  return data.data;
}
