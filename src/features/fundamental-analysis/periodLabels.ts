export function formatQuarterSequenceLabel(
  fiscalYear: number,
  fiscalQuarter: number | null,
): string {
  return fiscalQuarter != null ? `Q${fiscalQuarter} ${fiscalYear}` : `FY${fiscalYear}`;
}

export function formatStatementPeriodLabel(
  periodView: "annual" | "quarter",
  fiscalYear: number,
  fiscalQuarter: number | null,
  isTtmPeriod: boolean,
): string {
  if (isTtmPeriod) return "TTM";
  if (periodView === "quarter") return formatQuarterSequenceLabel(fiscalYear, fiscalQuarter);
  return `FY${fiscalYear}`;
}

export function formatMetricPeriodChipLabel(
  fiscalYear: number,
  fiscalQuarter: number | null,
  metricYearLabel: string,
  isLatestInYear: boolean,
): string {
  const isTtmYear = metricYearLabel.startsWith("TTM ");
  if (isTtmYear && isLatestInYear) return metricYearLabel;
  return formatQuarterSequenceLabel(fiscalYear, fiscalQuarter);
}
