/**
 * Market API service — fetches Boursa Kuwait market summary from backend.
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

const MARKET_API = `${API_BASE_URL}/api/v1/market`;

function noStoreFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store" });
}

async function triggerBackgroundRefresh(headers: Record<string, string>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    await noStoreFetch(
      `${MARKET_API}/overview?live=true&include_quotes=false&_=${Date.now()}`,
      { headers, signal: controller.signal },
    );
  } catch {
    // The server refresh continues independently; the current snapshot remains usable.
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface MarketIndex {
  name: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface MarketMover {
  symbol: string;
  last: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
}

export interface SectorIndex {
  name: string;
  changePercent: number | null;
  last: number | null;
}

export interface MarketSummary {
  volume: number | null;
  value_traded: number | null;
  trades: number | null;
  market_cap: number | null;
  gainers: number;
  losers: number;
  neutral: number;
  stock_gainers: number;
  stock_losers: number;
}

export interface PerMarketSummary {
  volume: number | null;
  value_traded: number | null;
  trades: number | null;
  market_cap?: number | null;
}

export interface MarketData {
  indices: MarketIndex[];
  market_summary: MarketSummary;
  premier_summary: PerMarketSummary;
  main_summary: PerMarketSummary;
  top_gainers: MarketMover[];
  top_losers: MarketMover[];
  top_value: MarketMover[];
  sectors: SectorIndex[];
  date: string | null;
  status: string | null;
  _cached: boolean;
  _fetched_at: number;
  _trade_date?: string;
  _stale?: boolean;
}

export const marketApi = {
  async getSummary(): Promise<MarketData> {
    const headers = await authHeaders();
    const res = await noStoreFetch(`${MARKET_API}/overview?include_quotes=false&_=${Date.now()}`, { headers });
    if (!res.ok) throw new Error(`Market API error: ${res.status}`);
    const json = await res.json();
    return json.data;
  },

  async refresh(): Promise<MarketData> {
    const headers = await authHeaders();
    const current = await this.getSummary();
    const currentFetchedAt = current?._fetched_at ?? 0;

    // Do not make the button wait for the full TickerChart universe refresh.
    // Trigger it independently, then immediately return the current snapshot.
    void triggerBackgroundRefresh(headers);

    // The first response is intentionally cached. Poll only the fast read path
    // for a short bounded window so the UI picks up the new snapshot without
    // ever waiting on the live provider request.
    const deadline = Date.now() + 15000;
    let latest = current;
    while (Date.now() < deadline) {
      await sleep(500);
      const candidate = await this.getSummary();
      latest = candidate;
      if ((candidate?._fetched_at ?? 0) > currentFetchedAt) return candidate;
    }
    return latest;
  },
};
