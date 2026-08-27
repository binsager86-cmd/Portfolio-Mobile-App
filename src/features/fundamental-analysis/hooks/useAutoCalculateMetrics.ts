import { useEffect, useRef } from "react";

export function useAutoCalculateMetrics({
  stockId,
  statementPeriods,
  metricPeriods,
  onCalculateAll,
}: {
  stockId: number;
  statementPeriods: string[];
  metricPeriods: string[];
  onCalculateAll: () => void | Promise<void>;
}) {
  const triggeredForStockRef = useRef<number | null>(null);
  const latestStatementPeriod = statementPeriods.length > 0
    ? [...statementPeriods].sort().at(-1) ?? null
    : null;
  const hasLatestPeriodMetrics = latestStatementPeriod != null && metricPeriods.includes(latestStatementPeriod);

  useEffect(() => {
    if (latestStatementPeriod == null) return;
    if (hasLatestPeriodMetrics) return;
    if (triggeredForStockRef.current === stockId) return;

    triggeredForStockRef.current = stockId;
    void onCalculateAll();
  }, [hasLatestPeriodMetrics, latestStatementPeriod, onCalculateAll, stockId]);
}
