/**
 * Market API service — fetches Boursa Kuwait market summary from backend.
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

const MARKET_API = `${API_BASE_URL}/api/v1/market`;

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
    const res = await fetch(`${MARKET_API}/summary`, { headers });
    if (!res.ok) throw new Error(`Market API error: ${res.status}`);
    const json = await res.json();
    return json.data;
  },

  async refresh(): Promise<MarketData> {
    const headers = await authHeaders();
    // Prefer non-blocking refresh: the /overview?live=true call kicks off a
    // background TickerChart refresh on the server and returns the (still
    // stale) cached snapshot immediately with status "refreshing". We then
    // poll the plain (non-live) overview a few times so the pull-to-refresh
    // gesture actually reflects the newly-refreshed data once it lands,
    // instead of silently re-showing the same stale snapshot.
    const overviewRes = await fetch(`${MARKET_API}/overview?live=true&include_quotes=false`, { headers });
    if (overviewRes.ok) {
      const json = await overviewRes.json();
      const initial: MarketData = json.data;
      if (json.status !== "refreshing") return initial;

      const initialFetchedAt = initial?._fetched_at ?? 0;
      const POLL_INTERVAL_MS = 3000;
      const MAX_POLLS = 8; // ~24s ceiling before giving up and returning latest snapshot
      let latest = initial;
      for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const pollRes = await fetch(`${MARKET_API}/overview?live=false&include_quotes=false`, { headers });
        if (!pollRes.ok) continue;
        const pollJson = await pollRes.json();
        latest = pollJson.data;
        if ((latest?._fetched_at ?? 0) > initialFetchedAt) break;
      }
      return latest;
    }

    // Backward-compatible fallback for deployments without /overview.
    if (overviewRes.status !== 404) {
      throw new Error(`Market refresh error: ${overviewRes.status}`);
    }

    const res = await fetch(`${MARKET_API}/refresh`, { headers });
    if (!res.ok) throw new Error(`Market refresh error: ${res.status}`);
    const json = await res.json();
    return json.data;
  },
};
