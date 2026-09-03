import {
  formatMetricPeriodChipLabel,
  formatQuarterSequenceLabel,
  formatStatementPeriodLabel,
} from "@/src/features/fundamental-analysis/periodLabels";

describe("periodLabels", () => {
  it("formats quarter sequence labels as Qx YYYY", () => {
    expect(formatQuarterSequenceLabel(2016, 3)).toBe("Q3 2016");
    expect(formatQuarterSequenceLabel(2017, 1)).toBe("Q1 2017");
  });

  it("formats annual statement labels as FYYYYY and preserves TTM", () => {
    expect(formatStatementPeriodLabel("annual", 2024, 4, false)).toBe("FY2024");
    expect(formatStatementPeriodLabel("annual", 2025, 2, true)).toBe("TTM");
  });

  it("formats quarter statement labels as Qx YYYY", () => {
    expect(formatStatementPeriodLabel("quarter", 2019, 4, false)).toBe("Q4 2019");
    expect(formatStatementPeriodLabel("quarter", 2020, 2, false)).toBe("Q2 2020");
  });

  it("uses TTM year chip only for latest TTM period in year", () => {
    expect(formatMetricPeriodChipLabel(2025, 2, "TTM 2025", true)).toBe("TTM 2025");
    expect(formatMetricPeriodChipLabel(2025, 1, "TTM 2025", false)).toBe("Q1 2025");
    expect(formatMetricPeriodChipLabel(2024, 4, "FY2024", true)).toBe("Q4 2024");
  });
});