import api from "../client";

interface OhlcvRow {
  date: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  adjusted_close?: number | string;
  volume: number | string;
}

export interface WhaleTrackerCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WhaleTrackerFetchParams {
  symbol: string;
  exchange?: string | null;
  country?: string | null;
  from?: string;
  to?: string;
}

function buildSymbolCandidates(symbol: string, exchange?: string | null, country?: string | null): string[] {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return [];

  // Preserve explicitly provided exchange suffixes (e.g. KFH.KW, AAPL.US).
  if (trimmed.includes(".")) return [trimmed];

  const exchangeCode = (exchange ?? "").trim().toUpperCase();
  const countryCode = (country ?? "").trim().toUpperCase();
  const isKuwait =
    exchangeCode === "KW" ||
    exchangeCode === "KSE" ||
    exchangeCode === "BK" ||
    countryCode === "KW" ||
    countryCode === "KWT" ||
    countryCode === "KUWAIT";

  // Try likely market first, then fallback to the other to support manual inputs like "KFH".
  return isKuwait ? [`${trimmed}.KW`, `${trimmed}.US`] : [`${trimmed}.US`, `${trimmed}.KW`];
}

function toNumber(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchRows(
  symbol: string,
  exchange?: string | null,
  country?: string | null,
  from?: string,
  to?: string,
): Promise<OhlcvRow[]> {
  const { data } = await api.get<{ status: string; data: OhlcvRow[] }>(
    "/api/v1/trade-signals/whale-candles",
    {
      params: {
        symbol,
        exchange,
        country,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
      timeout: 15_000,
    },
  );
  return Array.isArray(data.data) ? data.data : [];
}

export async function getWhaleTrackerCandles({
  symbol,
  exchange,
  country,
  from,
  to,
}: WhaleTrackerFetchParams): Promise<WhaleTrackerCandle[]> {
  const candidates = buildSymbolCandidates(symbol, exchange, country);
  if (candidates.length === 0) return [];

  let rows: OhlcvRow[] = [];
  for (const candidate of candidates) {
    rows = await fetchRows(candidate, exchange, country, from, to);
    if (rows.length > 0) break;
  }

  return rows
    .map((row) => ({
      date: row.date,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume),
    }))
    .filter((row) => row.date && row.volume >= 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}