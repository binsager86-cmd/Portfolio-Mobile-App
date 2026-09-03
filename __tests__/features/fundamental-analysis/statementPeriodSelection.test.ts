import type { FinancialLineItem, FinancialStatement, LatestPreferredStatementPeriod } from "@/services/api";
import { selectStatementsForDisplay } from "@/src/features/fundamental-analysis/statementPeriodSelection";

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

describe("statementPeriodSelection", () => {
  it("keeps annual rows and appends synthetic TTM in annual view", () => {
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
      "report?p=quarterly",
      [makeLineItem(201, "revenue", 200)],
    );
    const q22025 = makeStatement(
      3,
      "income",
      2025,
      2,
      "2025-06-30",
      "report?p=quarterly",
      [makeLineItem(301, "revenue", 300)],
    );

    const latestPreferred: LatestPreferredStatementPeriod = {
      period_end_date: "2025-06-30",
      fiscal_year: 2025,
      fiscal_quarter: 2,
      resolution: "latest_quarter",
      cached: false,
    };

    const selection = selectStatementsForDisplay(
      [annual2024, q22024, q22025],
      latestPreferred,
      "annual",
    );

    expect(selection.rows).toHaveLength(2);
    expect(selection.rows.map((row) => row.period_end_date)).toEqual([
      "2024-12-31",
      "2025-06-30",
    ]);
    expect(selection.rows[1].notes).toContain("Derived TTM");
    expect(selection.rows[1].line_items[0].amount).toBe(1100);
    expect(selection.ttmPeriodEndDate).toBe("2025-06-30");
  });

  it("does not fall back to raw quarterly rows in annual view when annual history is absent", () => {
    const q12025 = makeStatement(
      10,
      "income",
      2025,
      1,
      "2025-03-31",
      "report?p=quarterly",
      [makeLineItem(401, "revenue", 120)],
    );
    const q22025 = makeStatement(
      11,
      "income",
      2025,
      2,
      "2025-06-30",
      "report?p=quarterly",
      [makeLineItem(402, "revenue", 140)],
    );

    const selection = selectStatementsForDisplay([q12025, q22025], null, "annual");

    expect(selection.rows).toEqual([]);
    expect(selection.ttmPeriodEndDate).toBeNull();
  });

  it("treats Q4 quarterly-source rows as quarter rows, not annual rows", () => {
    const annual2023 = makeStatement(
      20,
      "income",
      2023,
      4,
      "2023-12-31",
      "annual_2023.pdf",
      [makeLineItem(501, "revenue", 800)],
    );
    const q42024QuarterlySource = makeStatement(
      21,
      "income",
      2024,
      4,
      "2024-12-31",
      "provider?p=quarterly",
      [makeLineItem(502, "revenue", 260)],
    );

    const annualSelection = selectStatementsForDisplay(
      [annual2023, q42024QuarterlySource],
      null,
      "annual",
    );
    const quarterSelection = selectStatementsForDisplay(
      [annual2023, q42024QuarterlySource],
      null,
      "quarter",
    );

    expect(annualSelection.rows.map((row) => row.period_end_date)).toEqual(["2023-12-31"]);
    const quarterPeriods = quarterSelection.rows.map((row) => row.period_end_date);
    expect(quarterPeriods).toContain("2024-12-31");
    expect(quarterPeriods).toContain("2023-12-31");
  });
});