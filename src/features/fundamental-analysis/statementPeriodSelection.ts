import type { FinancialStatement, LatestPreferredStatementPeriod } from "@/services/api";

export type StatementPeriodView = "annual" | "quarter";

export type StatementDisplaySelection = {
  rows: FinancialStatement[];
  ttmPeriodEndDate: string | null;
};

type StatementLineItem = FinancialStatement["line_items"][number];

export function normalizeQuarter(raw: unknown): number | null {
  if (raw == null) return null;
  const q = Number(raw);
  if (!Number.isFinite(q)) return null;
  const qi = Math.trunc(q);
  return qi >= 1 && qi <= 4 ? qi : null;
}

function isQuarterlySource(sourceFile: string | null | undefined): boolean {
  return typeof sourceFile === "string" && sourceFile.toLowerCase().includes("p=quarterly");
}

function statementPeriodKey(statement: FinancialStatement): string {
  return `${statement.stock_id}:${statement.statement_type}:${statement.fiscal_year}:${statement.period_end_date}`;
}

export function isAnnualStatement(statement: FinancialStatement): boolean {
  const quarter = normalizeQuarter(statement.fiscal_quarter);
  if (isQuarterlySource(statement.source_file)) return false;
  if (quarter === 4) return true;
  if (quarter != null) return false;
  return true;
}

export function isQuarterlyStatement(statement: FinancialStatement): boolean {
  return !isAnnualStatement(statement);
}

function sortStatementsAscending(statements: FinancialStatement[]): FinancialStatement[] {
  return [...statements].sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));
}

function sortAnnualWithTtmLast(
  annualHistory: FinancialStatement[],
  ttmStatement: FinancialStatement | null,
): FinancialStatement[] {
  return [
    ...sortStatementsAscending(annualHistory),
    ...(ttmStatement ? [ttmStatement] : []),
  ];
}

function dedupeStatementsByPeriod(statements: FinancialStatement[]): FinancialStatement[] {
  const byPeriod = new Map<string, FinancialStatement>();
  for (const statement of statements) {
    const key = statementPeriodKey(statement);
    const existing = byPeriod.get(key);
    if (!existing || isQuarterlyStatement(statement)) {
      byPeriod.set(key, statement);
    }
  }
  return [...byPeriod.values()];
}

function sortLineItems(statement: FinancialStatement): StatementLineItem[] {
  return [...(statement.line_items ?? [])].sort(
    (a, b) => (a.order_index ?? 10_000) - (b.order_index ?? 10_000),
  );
}

function buildStandaloneQuarterFourStatement(
  annualStatement: FinancialStatement,
  quarterlyHistory: FinancialStatement[],
): FinancialStatement | null {
  const existingQuarterFour = quarterlyHistory.some(
    (statement) => statement.stock_id === annualStatement.stock_id
      && statement.statement_type === annualStatement.statement_type
      && statement.fiscal_year === annualStatement.fiscal_year
      && normalizeQuarter(statement.fiscal_quarter) === 4,
  );
  if (existingQuarterFour) return null;

  const sameYearQuarters = [1, 2, 3].map((quarter) => quarterlyHistory.find(
    (statement) => statement.stock_id === annualStatement.stock_id
      && statement.statement_type === annualStatement.statement_type
      && statement.fiscal_year === annualStatement.fiscal_year
      && normalizeQuarter(statement.fiscal_quarter) === quarter,
  ));
  if (sameYearQuarters.some((statement) => !statement)) return null;

  const statementType = String(annualStatement.statement_type ?? "").toLowerCase();
  const isFlowStatement = statementType === "income" || statementType === "cashflow";
  const quarterTotalsByCode = new Map<string, number>();
  if (isFlowStatement) {
    for (const quarterStatement of sameYearQuarters) {
      for (const lineItem of quarterStatement?.line_items ?? []) {
        quarterTotalsByCode.set(
          lineItem.line_item_code,
          (quarterTotalsByCode.get(lineItem.line_item_code) ?? 0) + lineItem.amount,
        );
      }
    }
  }

  const lineItems = sortLineItems(annualStatement).map((lineItem, index) => ({
    ...lineItem,
    id: -(annualStatement.id * 10_000 + index + 1),
    statement_id: -annualStatement.id,
    amount: isFlowStatement
      ? lineItem.amount - (quarterTotalsByCode.get(lineItem.line_item_code) ?? 0)
      : lineItem.amount,
    manually_edited: false,
  }));
  if (lineItems.length === 0) return null;

  return {
    ...annualStatement,
    id: -annualStatement.id,
    fiscal_quarter: 4,
    line_items: lineItems,
    source_file: annualStatement.source_file
      ? `${annualStatement.source_file}#derived-q4`
      : "derived-q4",
    notes: isFlowStatement
      ? "Derived standalone Q4 from annual - Q1 - Q2 - Q3"
      : "Derived standalone Q4 from annual year-end statement",
  };
}

function buildQuarterHistory(
  annualHistory: FinancialStatement[],
  explicitQuarterHistory: FinancialStatement[],
): FinancialStatement[] {
  const derivedQuarterFours = annualHistory
    .map((statement) => buildStandaloneQuarterFourStatement(statement, explicitQuarterHistory))
    .filter((statement): statement is FinancialStatement => statement != null);
  const coveredQuarterFourKeys = new Set([
    ...explicitQuarterHistory,
    ...derivedQuarterFours,
  ].filter((statement) => normalizeQuarter(statement.fiscal_quarter) === 4).map(statementPeriodKey));
  const annualQuarterFourFallbacks = annualHistory.filter(
    (statement) => normalizeQuarter(statement.fiscal_quarter) === 4
      && !coveredQuarterFourKeys.has(statementPeriodKey(statement)),
  );
  return sortStatementsAscending(dedupeStatementsByPeriod([
    ...explicitQuarterHistory,
    ...derivedQuarterFours,
    ...annualQuarterFourFallbacks,
  ]));
}

export function buildSyntheticTtmStatement(
  latestQuarter: FinancialStatement | null,
  annualHistory: FinancialStatement[],
  quarterlyHistory: FinancialStatement[],
): FinancialStatement | null {
  if (!latestQuarter) return null;

  const statementType = String(latestQuarter.statement_type ?? "").toLowerCase();
  if (statementType !== "income" && statementType !== "cashflow") return null;

  const latestQuarterNum = normalizeQuarter(latestQuarter.fiscal_quarter);
  if (latestQuarterNum == null || latestQuarterNum === 4) return null;

  const priorAnnual = annualHistory.find(
    (statement) => statement.fiscal_year === latestQuarter.fiscal_year - 1,
  );
  if (!priorAnnual) return null;

  const priorSameQuarter = quarterlyHistory.find(
    (statement) => statement.fiscal_year === latestQuarter.fiscal_year - 1
      && normalizeQuarter(statement.fiscal_quarter) === latestQuarterNum,
  );
  if (!priorSameQuarter) return null;

  const annualByCode = new Map<string, StatementLineItem>();
  const priorByCode = new Map<string, StatementLineItem>();
  for (const lineItem of sortLineItems(priorAnnual)) {
    annualByCode.set(lineItem.line_item_code, lineItem);
  }
  for (const lineItem of sortLineItems(priorSameQuarter)) {
    priorByCode.set(lineItem.line_item_code, lineItem);
  }

  const syntheticLineItems: StatementLineItem[] = [];
  for (const latestItem of sortLineItems(latestQuarter)) {
    const annualItem = annualByCode.get(latestItem.line_item_code);
    const priorQuarterItem = priorByCode.get(latestItem.line_item_code);
    const annualAmount = annualItem?.amount ?? 0;
    const priorQuarterAmount = priorQuarterItem?.amount ?? 0;
    const ttmAmount = annualAmount + latestItem.amount - priorQuarterAmount;

    syntheticLineItems.push({
      ...latestItem,
      statement_id: latestQuarter.id,
      amount: ttmAmount,
      manually_edited: false,
    });
  }

  if (syntheticLineItems.length === 0) return null;

  return {
    ...latestQuarter,
    line_items: syntheticLineItems,
    source_file: latestQuarter.source_file
      ? `${latestQuarter.source_file}#derived-ttm`
      : "derived-ttm",
    notes: "Derived TTM from annual + latest quarter - prior-year same quarter",
  };
}

export function selectStatementsForDisplay(
  statements: FinancialStatement[],
  latestPreferred: LatestPreferredStatementPeriod | null | undefined,
  periodView: StatementPeriodView,
): StatementDisplaySelection {
  if (statements.length === 0) return { rows: statements, ttmPeriodEndDate: null };

  const normalized = statements
    .map((statement) => ({ ...statement, fiscal_quarter: normalizeQuarter(statement.fiscal_quarter) }))
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const annualHistory = normalized.filter((statement) => isAnnualStatement(statement));
  const explicitQuarterHistory = normalized.filter(
    (statement) => normalizeQuarter(statement.fiscal_quarter) != null && !isAnnualStatement(statement),
  );
  const quarterlyHistory = buildQuarterHistory(annualHistory, explicitQuarterHistory);

  let latestQuarter: FinancialStatement | null = null;
  const preferredQuarter = normalizeQuarter(latestPreferred?.fiscal_quarter);
  if (latestPreferred && preferredQuarter != null) {
    latestQuarter = quarterlyHistory.find((statement) => statement.period_end_date === latestPreferred.period_end_date) ?? null;
  }
  if (!latestQuarter) {
    latestQuarter = quarterlyHistory[quarterlyHistory.length - 1] ?? null;
  }

  if (periodView === "quarter") {
    if (quarterlyHistory.length > 0) {
      return {
        rows: quarterlyHistory,
        ttmPeriodEndDate: null,
      };
    }
    return { rows: sortStatementsAscending(normalized), ttmPeriodEndDate: null };
  }

  const ttmStatement = buildSyntheticTtmStatement(
    latestQuarter,
    annualHistory,
    quarterlyHistory,
  );

  const combined = sortAnnualWithTtmLast(annualHistory, ttmStatement);

  const deduped = new Map<number, FinancialStatement>();
  for (const statement of combined) {
    deduped.set(statement.id, statement);
  }
  const rows = [...deduped.values()];

  if (rows.length === 0) {
    return { rows: [], ttmPeriodEndDate: null };
  }

  return {
    rows,
    ttmPeriodEndDate: ttmStatement?.period_end_date ?? null,
  };
}