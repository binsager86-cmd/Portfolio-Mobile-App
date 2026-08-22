import type {
  FinancialStatement,
  LatestPreferredStatementPeriod,
} from "@/services/api";

export type ComparePeriodView = "annual" | "quarter" | "ttm";

export type ComparisonSelection = {
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

function isAnnualStatement(statement: FinancialStatement): boolean {
  const quarter = normalizeQuarter(statement.fiscal_quarter);
  if (quarter === 4) return true;
  if (quarter != null) return false;
  if (isQuarterlySource(statement.source_file)) return false;
  return true;
}

function isQuarterlyStatement(statement: FinancialStatement): boolean {
  return !isAnnualStatement(statement);
}

function sortLineItems(statement: FinancialStatement): StatementLineItem[] {
  return [...(statement.line_items ?? [])].sort(
    (a, b) => (a.order_index ?? 10_000) - (b.order_index ?? 10_000),
  );
}

function buildSyntheticTtmStatement(
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

export function selectComparisonStatements(
  statements: FinancialStatement[],
  latestPreferred: LatestPreferredStatementPeriod | null | undefined,
  periodView: ComparePeriodView,
): ComparisonSelection {
  if (statements.length === 0) return { rows: statements, ttmPeriodEndDate: null };

  const normalized = statements
    .map((statement) => ({ ...statement, fiscal_quarter: normalizeQuarter(statement.fiscal_quarter) }))
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const annualHistory = normalized.filter((statement) => isAnnualStatement(statement));
  const quarterlyHistory = normalized.filter((statement) => isQuarterlyStatement(statement));

  let latestQuarter: FinancialStatement | null = null;
  const preferredQuarter = normalizeQuarter(latestPreferred?.fiscal_quarter);
  if (latestPreferred && preferredQuarter != null) {
    latestQuarter = quarterlyHistory.find(
      (statement) => statement.period_end_date === latestPreferred.period_end_date,
    ) ?? null;
  }
  if (!latestQuarter) {
    latestQuarter = quarterlyHistory[quarterlyHistory.length - 1] ?? null;
  }

  if (periodView === "quarter") {
    if (quarterlyHistory.length > 0) return { rows: quarterlyHistory, ttmPeriodEndDate: null };
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  if (periodView === "annual") {
    if (annualHistory.length > 0) return { rows: annualHistory, ttmPeriodEndDate: null };
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  const ttmStatement = buildSyntheticTtmStatement(
    latestQuarter,
    annualHistory,
    quarterlyHistory,
  );

  const combined = [
    ...annualHistory,
    ...(ttmStatement ? [ttmStatement] : []),
  ].sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const deduped = new Map<string, FinancialStatement>();
  for (const statement of combined) {
    deduped.set(statement.period_end_date, statement);
  }
  const rows = [...deduped.values()];

  if (rows.length === 0) return { rows: normalized, ttmPeriodEndDate: null };
  return {
    rows,
    ttmPeriodEndDate: ttmStatement?.period_end_date ?? null,
  };
}