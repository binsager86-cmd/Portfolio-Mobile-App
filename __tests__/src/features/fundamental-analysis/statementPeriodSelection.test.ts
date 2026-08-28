import type { FinancialStatement } from "@/services/api";
import { selectStatementsForDisplay } from "@/src/features/fundamental-analysis/statementPeriodSelection";

function statement(overrides: Partial<FinancialStatement>): FinancialStatement {
  const id = overrides.id ?? 1;
  return {
    id,
    stock_id: 1,
    statement_type: "income",
    fiscal_year: 2026,
    fiscal_quarter: null,
    period_end_date: "2026-12-31",
    filing_date: null,
    source_file: "https://stockanalysis.com/stocks/demo/financials/",
    extracted_by: "test",
    confidence_score: null,
    notes: null,
    created_at: id,
    line_items: [],
    ...overrides,
  };
}

describe("statement period selection", () => {
  it("keeps Q4 as a standalone quarter and orders quarters oldest first", () => {
    const rows = [1, 2, 3, 4].map((quarter) => statement({
      id: quarter,
      fiscal_year: 2025,
      fiscal_quarter: quarter,
      period_end_date: `2025-${String(quarter * 3).padStart(2, "0")}-30`,
      source_file: quarter === 4
        ? "https://stockanalysis.com/stocks/demo/financials/"
        : "https://stockanalysis.com/stocks/demo/financials/?p=quarterly",
    }));

    const selection = selectStatementsForDisplay(rows, null, "quarter");

    expect(selection.rows.map((row) => row.fiscal_quarter)).toEqual([1, 2, 3, 4]);
    expect(selection.ttmPeriodEndDate).toBeNull();
  });

  it("derives a standalone Q4 when annual and Q1 through Q3 are available", () => {
    const annual = statement({
      id: 30,
      fiscal_year: 2025,
      fiscal_quarter: null,
      period_end_date: "2025-12-31",
      source_file: "https://stockanalysis.com/stocks/demo/financials/",
      line_items: [{
        id: 301,
        statement_id: 30,
        line_item_code: "REVENUE",
        line_item_name: "Revenue",
        amount: 1_000,
        currency: "KWD",
        order_index: 1,
        is_total: true,
        manually_edited: false,
      }],
    });
    const quarters = [
      { quarter: 1, amount: 100, date: "2025-03-31" },
      { quarter: 2, amount: 200, date: "2025-06-30" },
      { quarter: 3, amount: 300, date: "2025-09-30" },
    ].map(({ quarter, amount, date }) => statement({
      id: 30 + quarter,
      fiscal_year: 2025,
      fiscal_quarter: quarter,
      period_end_date: date,
      source_file: "https://stockanalysis.com/stocks/demo/financials/?p=quarterly",
      line_items: [{
        id: 310 + quarter,
        statement_id: 30 + quarter,
        line_item_code: "REVENUE",
        line_item_name: "Revenue",
        amount,
        currency: "KWD",
        order_index: 1,
        is_total: true,
        manually_edited: false,
      }],
    }));

    const selection = selectStatementsForDisplay([annual, ...quarters], null, "quarter");

    expect(selection.rows.map((row) => row.fiscal_quarter)).toEqual([1, 2, 3, 4]);
    expect(selection.rows[3].period_end_date).toBe("2025-12-31");
    expect(selection.rows[3].line_items[0].amount).toBe(400);
  });

  it("does not show a raw quarter in annual view when annual or TTM data is unavailable", () => {
    const rows = [statement({
      id: 10,
      fiscal_year: 2026,
      fiscal_quarter: 2,
      period_end_date: "2026-06-30",
      source_file: "https://stockanalysis.com/stocks/demo/financials/?p=quarterly",
    })];

    const selection = selectStatementsForDisplay(rows, {
      period_end_date: "2026-06-30",
      fiscal_year: 2026,
      fiscal_quarter: 2,
      resolution: "latest_quarter",
      cached: false,
    }, "annual");

    expect(selection.rows).toEqual([]);
    expect(selection.ttmPeriodEndDate).toBeNull();
  });

  it("adds a computed TTM column to annual history when the required quarters exist", () => {
    const annual = statement({
      id: 20,
      fiscal_year: 2025,
      fiscal_quarter: null,
      period_end_date: "2025-12-31",
      line_items: [{
        id: 201,
        statement_id: 20,
        line_item_code: "REVENUE",
        line_item_name: "Revenue",
        amount: 100,
        currency: "KWD",
        order_index: 1,
        is_total: false,
        manually_edited: false,
      }],
    });
    const priorQ2 = statement({
      id: 21,
      fiscal_year: 2025,
      fiscal_quarter: 2,
      period_end_date: "2025-06-30",
      source_file: "https://stockanalysis.com/stocks/demo/financials/?p=quarterly",
      line_items: [{
        id: 211,
        statement_id: 21,
        line_item_code: "REVENUE",
        line_item_name: "Revenue",
        amount: 40,
        currency: "KWD",
        order_index: 1,
        is_total: false,
        manually_edited: false,
      }],
    });
    const latestQ2 = statement({
      id: 22,
      fiscal_year: 2026,
      fiscal_quarter: 2,
      period_end_date: "2026-06-30",
      source_file: "https://stockanalysis.com/stocks/demo/financials/?p=quarterly",
      line_items: [{
        id: 221,
        statement_id: 22,
        line_item_code: "REVENUE",
        line_item_name: "Revenue",
        amount: 60,
        currency: "KWD",
        order_index: 1,
        is_total: false,
        manually_edited: false,
      }],
    });

    const selection = selectStatementsForDisplay([latestQ2, priorQ2, annual], {
      period_end_date: "2026-06-30",
      fiscal_year: 2026,
      fiscal_quarter: 2,
      resolution: "latest_quarter",
      cached: false,
    }, "annual");

    expect(selection.rows.map((row) => row.period_end_date)).toEqual(["2025-12-31", "2026-06-30"]);
    expect(selection.rows[1].line_items[0].amount).toBe(120);
    expect(selection.ttmPeriodEndDate).toBe("2026-06-30");
  });
});