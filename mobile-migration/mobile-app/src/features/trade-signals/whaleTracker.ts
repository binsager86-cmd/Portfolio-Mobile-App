import { subDays } from "date-fns";

import type { WhaleTrackerCandle } from "@/services/api/analytics/whaleTracker";
import { todayISO } from "@/lib/dateUtils";

export type WhaleCandleType = "red" | "green";
export type WhaleWaveDirection = "up" | "down" | "flat";

export interface WhaleTrackerRow extends WhaleTrackerCandle {
  candleType: WhaleCandleType;
  accumulation: number;
  distribution: number;
  dailyInstitutionalPower: number;
  cumulativeInstitutionalShares: number;
  waveId: number;
  waveDirection: WhaleWaveDirection;
}

export interface WhaleWaveSummary {
  id: number;
  startDate: string;
  endDate: string;
  direction: WhaleWaveDirection;
  netResult: number;
  isInstitutionalAccumulation: boolean;
  bars: number;
}

export interface WhaleTrackerSummary {
  rows: WhaleTrackerRow[];
  waves: WhaleWaveSummary[];
  totalAccumulation: number;
  totalDistribution: number;
  netInstitutionalResult: number;
  finalInstitutionalShares: number;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function defaultWhaleTrackerRange(): { from: string; to: string } {
  const to = todayISO();
  const from = subDays(new Date(`${to}T00:00:00`), 180)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

function waveDirectionFor(prevClose: number | null, close: number): WhaleWaveDirection {
  if (prevClose == null) return "flat";
  if (close > prevClose) return "up";
  if (close < prevClose) return "down";
  return "flat";
}

export function calculateWhaleTracker(candles: WhaleTrackerCandle[]): WhaleTrackerSummary {
  let cumulativeInstitutionalShares = 0;
  let totalAccumulation = 0;
  let totalDistribution = 0;
  let currentWaveId = 1;
  let previousClose: number | null = null;
  let previousDirection: WhaleWaveDirection | null = null;

  const rows: WhaleTrackerRow[] = candles.map((candle, index) => {
    const candleType: WhaleCandleType = candle.close < candle.open ? "red" : "green";
    const accumulation = candleType === "red" ? candle.volume : 0;
    const distribution = candleType === "green" ? -candle.volume : 0;
    const dailyInstitutionalPower = (accumulation + distribution) * 0.8;
    const waveDirection = waveDirectionFor(previousClose, candle.close);

    if (
      index > 0 &&
      previousDirection != null &&
      waveDirection !== "flat" &&
      previousDirection !== "flat" &&
      waveDirection !== previousDirection
    ) {
      currentWaveId += 1;
    }

    cumulativeInstitutionalShares += dailyInstitutionalPower;
    totalAccumulation += accumulation;
    totalDistribution += distribution;

    previousClose = candle.close;
    previousDirection = waveDirection === "flat" ? previousDirection : waveDirection;

    return {
      ...candle,
      candleType,
      accumulation,
      distribution,
      dailyInstitutionalPower,
      cumulativeInstitutionalShares,
      waveId: currentWaveId,
      waveDirection,
    };
  });

  const waveMap = new Map<number, WhaleWaveSummary>();
  for (const row of rows) {
    const existing = waveMap.get(row.waveId);
    if (!existing) {
      waveMap.set(row.waveId, {
        id: row.waveId,
        startDate: row.date,
        endDate: row.date,
        direction: row.waveDirection,
        netResult: row.dailyInstitutionalPower,
        isInstitutionalAccumulation: false,
        bars: 1,
      });
      continue;
    }

    existing.endDate = row.date;
    existing.direction = existing.direction === "flat" ? row.waveDirection : existing.direction;
    existing.netResult += row.dailyInstitutionalPower;
    existing.bars += 1;
  }

  const waves = Array.from(waveMap.values()).map((wave) => ({
    ...wave,
    isInstitutionalAccumulation: wave.netResult > 0,
  }));

  const finalInstitutionalShares = (totalAccumulation + totalDistribution) * 0.8;

  return {
    rows,
    waves,
    totalAccumulation,
    totalDistribution,
    netInstitutionalResult: finalInstitutionalShares,
    finalInstitutionalShares,
  };
}