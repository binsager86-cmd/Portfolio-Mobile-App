import { formatScannerCoverageLine } from "@/components/eagle-eye/scannerCoverage";

describe("formatScannerCoverageLine", () => {
  it("keeps full-universe coverage when the visible rows are filtered", () => {
    const coverage = {
      total: 139,
      evaluated_count: 139,
      not_evaluated_count: 0,
      scanner_count: 141,
      scanner_extra_symbols: ["ALENMA", "PAPER"],
      buckets: [],
    };
    const filteredRows = [{ ticker: "BUY_ONLY" }];

    expect(formatScannerCoverageLine(coverage)).toBe(
      "139 of 139 sealed · 0 not evaluated · 2 outside universe",
    );
    expect(filteredRows).not.toHaveLength(139);
  });
});