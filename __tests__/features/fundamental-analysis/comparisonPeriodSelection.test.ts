import type { FinancialLineItem, FinancialStatement, LatestPreferredStatementPeriod } from "@/services/api";
import {
  selectComparisonStatements,
  type ComparePeriodView,
} from "@/src/features/fundamental-analysis/comparisonPeriodSelection";

function makeLineItem(id: number, code: string, amount: number): FinancialLineItem {
  return {
    id,
    statement_id: id,
    line_item_code: code,
    line_item_name: code,
    amount,
    currency: "KWD",
    order_index: 1,
    is_total: false,
    manually_edited: false,
  };
}

function makeStatement(
  id: number,
  statementType: string,
  fiscalYear: number,
  fiscalQuarter: number | null,
  periodEndDate: string,
  sourceFile: string | null,
  lineItems: FinancialLineItem[],
): FinancialStatement {
  return {
    id,
    stock_id: 1,
    statement_type: statementType,
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    period_end_date: periodEndDate,
    filing_date: null,
    source_file: sourceFile,
    extracted_by: "test",
    confidence_score: null,
    notes: null,
    created_at: 0,
    line_items: lineItems.map((lineItem) => ({ ...lineItem, statement_id: id })),
  };
}

describe("comparisonPeriodSelection", () => {
  const annual2024 = makeStatement(
    1,
    "income",
    2024,
    4,
    "2024-12-31",
    "annual_2024.pdf",
    [makeLineItem(101, "revenue", 1000)],
  );
  const q22024 = makeStatement(
    2,
    "income",
    2024,
    2,
    "2024-06-30",
    "provider?p=quarterly",
    [makeLineItem(201, "revenue", 200)],
  );
  const q22025 = makeStatement(
    3,
    "income",
    2025,
    2,
    "2025-06-30",
    "provider?p=quarterly",
    [makeLineItem(301, "revenue", 300)],
  );
  const latestPreferred: LatestPreferredStatementPeriod = {
    period_end_date: "2025-06-30",
    fiscal_year: 2025,
    fiscal_quarter: 2,
    resolution: "latest_quarter",
    cached: false,
  };

  function select(view: ComparePeriodView) {
    return selectComparisonStatements([annual2024, q22024, q22025], latestPreferred, view);
  }

  it("returns quarter-only rows in quarter view", () => {
    const selection = select("quarter");
    expect(selection.rows.map((row) => row.period_end_date)).toEqual([
      "2024-06-30",
      "2025-06-30",
    ]);
    expect(selection.ttmPeriodEndDate).toBeNull();
  });

  it("returns annual-only rows in annual view", () => {
    const selection = select("annual");
    expect(selection.rows.map((row) => row.period_end_date)).toEqual(["2024-12-31"]);
    expect(selection.ttmPeriodEndDate).toBeNull();
  });

  it("returns annual plus synthetic TTM in ttm view", () => {
    const selection = select("ttm");
    expect(selection.rows.map((row) => row.period_end_date)).toEqual([
      "2024-12-31",
      "2025-06-30",
    ]);
    expect(selection.rows[1].notes).toContain("Derived TTM");
    expect(selection.rows[1].line_items[0].amount).toBe(1100);
    expect(selection.ttmPeriodEndDate).toBe("2025-06-30");
  });
});