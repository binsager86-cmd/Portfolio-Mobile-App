import {
  buildImportedStatementsFromSheet,
  detectStatementType,
  parseImportedCellAmount,
} from "@/src/features/fundamental-analysis/statementImport";

describe("detectStatementType", () => {
  it("recognizes common sheet naming variants", () => {
    expect(detectStatementType("Income Statement")).toBe("income");
    expect(detectStatementType("Balance Sheet")).toBe("balance");
    expect(detectStatementType("Cash Flow")).toBe("cashflow");
    expect(detectStatementType("Changes in Equity")).toBe("equity");
  });
});

describe("parseImportedCellAmount", () => {
  it("treats blank markers as missing instead of zero", () => {
    expect(parseImportedCellAmount("")).toBeNull();
    expect(parseImportedCellAmount(" - ")).toBeNull();
    expect(parseImportedCellAmount("N/A")).toBeNull();
  });

  it("parses numeric text without losing negatives", () => {
    expect(parseImportedCellAmount("1,234.5")).toBe(1234.5);
    expect(parseImportedCellAmount("(250)")).toBe(-250);
    expect(parseImportedCellAmount("0")).toBe(0);
  });
});

describe("buildImportedStatementsFromSheet", () => {
  it("builds quarterly periods from quarter headers and skips empty cells", () => {
    const statements = buildImportedStatementsFromSheet(
      [
        ["Line Item", "Q1 2024", "Q2 2024"],
        ["Revenue", "100", ""],
        ["Operating Income", "(20)", "35"],
        ["Total Assets", "-", "500"],
      ],
      "income",
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      statement_type: "income",
      fiscal_year: 2024,
      fiscal_quarter: 1,
      period_end_date: "2024-03-31",
    });
    expect(statements[0].line_items).toEqual([
      { code: "revenue", name: "Revenue", amount: 100, is_total: false },
      { code: "operating_income", name: "Operating Income", amount: -20, is_total: false },
    ]);

    expect(statements[1]).toMatchObject({
      statement_type: "income",
      fiscal_year: 2024,
      fiscal_quarter: 2,
      period_end_date: "2024-06-30",
    });
    expect(statements[1].line_items).toEqual([
      { code: "operating_income", name: "Operating Income", amount: 35, is_total: false },
      { code: "total_assets", name: "Total Assets", amount: 500, is_total: true },
    ]);
  });

  it("creates stable unique codes for duplicate row names", () => {
    const statements = buildImportedStatementsFromSheet(
      [
        ["Line Item", "2024"],
        ["Other Income", 10],
        ["Other Income", 20],
      ],
      "income",
    );

    expect(statements[0].line_items).toEqual([
      { code: "other_income", name: "Other Income", amount: 10, is_total: false },
      { code: "other_income_2", name: "Other Income", amount: 20, is_total: false },
    ]);
  });
});
