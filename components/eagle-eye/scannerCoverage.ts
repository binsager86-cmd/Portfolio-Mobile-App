import type { ScannerCoverageSummary } from "@/hooks/useEagleEye";

export function formatScannerCoverageLine(
  coverage: ScannerCoverageSummary | null | undefined,
): string {
  if (!coverage) return "Coverage unavailable";

  const extraCount = coverage.scanner_extra_symbols.length;
  return `${coverage.evaluated_count} of ${coverage.total} sealed · ${coverage.not_evaluated_count} not evaluated${extraCount ? ` · ${extraCount} outside universe` : ""}`;
}
