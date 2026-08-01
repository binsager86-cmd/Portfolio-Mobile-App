import { ensureStockMetrics } from "@/services/api";

export type MetricCalculationPeriod = {
  period_end_date: string;
  fiscal_year: number;
  fiscal_quarter?: number | null;
};

export type MetricCalculationSummary = {
  totalPeriods: number;
  calculatedPeriods: number;
  skippedPeriods: number;
  failedPeriods: number;
  failures: Array<{ period_end_date: string; error: string }>;
};

export function buildMetricCalculationSignature(periods: MetricCalculationPeriod[]): string {
  return periods
    .map((period) => `${period.period_end_date}:${period.fiscal_year}:${period.fiscal_quarter ?? ""}`)
    .join("|");
}

export async function calculateAllMetricPeriods(
  stockId: number,
  _periods: MetricCalculationPeriod[],
): Promise<MetricCalculationSummary> {
  const summary = await ensureStockMetrics(stockId);

  return {
    totalPeriods: summary.total_periods,
    calculatedPeriods: summary.calculated_periods,
    skippedPeriods: summary.skipped_periods,
    failedPeriods: summary.failed_periods,
    failures: summary.failures,
  };
}