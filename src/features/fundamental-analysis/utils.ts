/**
 * Fundamental Analysis — Pure helper / utility functions.
 */

import type { ThemePalette } from "@/constants/theme";
import type { FinancialStatement, StockMetric } from "@/services/api";
import { format, parseISO } from "date-fns";
import { SCORE_THRESHOLDS } from "./types";

const DEBT_EQUITY_METRIC_NAME = "Debt / Equity";

/** Group metrics by category with yearly history. */
export function buildHistoricalMetrics(allMetrics: StockMetric[], statements: FinancialStatement[] = []) {
  const monthFromDate = (dateStr: string): number | null => {
    const month = Number(dateStr?.slice(5, 7));
    return Number.isFinite(month) ? month : null;
  };

  const inferredQuarter = (m: StockMetric): number | null => {
    if (m.fiscal_quarter != null && m.fiscal_quarter >= 1 && m.fiscal_quarter <= 4) {
      return m.fiscal_quarter;
    }
    const month = monthFromDate(m.period_end_date);
    if (month === 3) return 1;
    if (month === 6) return 2;
    if (month === 9) return 3;
    if (month === 12) return 4;
    return null;
  };

  const isAnnualMetric = (m: StockMetric): boolean => {
    const q = inferredQuarter(m);
    if (q === 4) return true;
    if (q != null) return false;
    return monthFromDate(m.period_end_date) === 12;
  };

  const shouldReplaceMetric = (current: StockMetric, next: StockMetric): boolean => {
    const currAnnual = isAnnualMetric(current);
    const nextAnnual = isAnnualMetric(next);

    // For FY display, always keep annual over quarterly rows.
    if (nextAnnual && !currAnnual) return true;
    if (!nextAnnual && currAnnual) return false;

    // Otherwise keep the latest period snapshot.
    if (next.period_end_date > current.period_end_date) return true;
    if (next.period_end_date < current.period_end_date) return false;

    // Final tie-breaker: latest created row.
    return (next.created_at ?? 0) > (current.created_at ?? 0);
  };

  const catMap: Record<string, { nameSet: Set<string>; yearData: Record<number, Record<string, number>> }> = {};
  const chosenMap: Record<string, Record<number, Record<string, StockMetric>>> = {};

  for (const m of allMetrics) {
    const cat = m.metric_type;
    if (!catMap[cat]) catMap[cat] = { nameSet: new Set(), yearData: {} };
    if (!chosenMap[cat]) chosenMap[cat] = {};
    catMap[cat].nameSet.add(m.metric_name);
    if (!catMap[cat].yearData[m.fiscal_year]) catMap[cat].yearData[m.fiscal_year] = {};
    if (!chosenMap[cat][m.fiscal_year]) chosenMap[cat][m.fiscal_year] = {};

    const current = chosenMap[cat][m.fiscal_year][m.metric_name];
    if (!current || shouldReplaceMetric(current, m)) {
      chosenMap[cat][m.fiscal_year][m.metric_name] = m;
      catMap[cat].yearData[m.fiscal_year][m.metric_name] = m.metric_value;
    }
  }
  const result: Record<string, { metricNames: string[]; yearData: Record<number, Record<string, number>>; years: number[] }> = {};
  const catOrder = ["profitability", "liquidity", "leverage", "efficiency", "valuation", "cashflow", "growth"];
  for (const cat of catOrder) {
    if (!catMap[cat]) continue;
    result[cat] = { metricNames: Array.from(catMap[cat].nameSet), yearData: catMap[cat].yearData, years: Object.keys(catMap[cat].yearData).map(Number).sort() };
  }

  // Align TTM values with Statements tab for additive cash-flow metrics:
  // TTM = prior fiscal-year annual + current-year latest quarter - prior-year same quarter.
  if (statements.length > 0 && result.cashflow) {
    const annualByYear = new Set<number>();
    const latestQuarterByYear = new Map<number, number>();

    for (const statement of statements) {
      const year = Number(statement.fiscal_year);
      if (!Number.isFinite(year)) continue;
      const quarter = normalizeQuarter(statement.fiscal_quarter) ?? inferQuarterFromDate(String(statement.period_end_date ?? ""));

      if (isAnnualStatementForLabels(statement)) {
        annualByYear.add(year);
      }

      if (quarter != null && quarter >= 1 && quarter <= 3) {
        const current = latestQuarterByYear.get(year);
        if (current == null || quarter > current) {
          latestQuarterByYear.set(year, quarter);
        }
      }
    }

    const metricValueForYearQuarter = (
      metricType: string,
      metricName: string,
      fiscalYear: number,
      fiscalQuarter: number,
    ): number | null => {
      let best: StockMetric | null = null;
      for (const m of allMetrics) {
        if (m.metric_type !== metricType || m.metric_name !== metricName || m.fiscal_year !== fiscalYear) continue;
        const q = normalizeQuarter(m.fiscal_quarter) ?? inferQuarterFromDate(String(m.period_end_date ?? ""));
        if (q !== fiscalQuarter) continue;
        if (!best || m.period_end_date > best.period_end_date || ((m.period_end_date === best.period_end_date) && ((m.created_at ?? 0) > (best.created_at ?? 0)))) {
          best = m;
        }
      }
      return best?.metric_value ?? null;
    };

    const additiveCashflowMetrics = [
      "Cash from Operations",
      "Cash from Investing",
      "Cash from Financing",
      "Free Cash Flow",
    ] as const;

    for (const [year, quarter] of latestQuarterByYear.entries()) {
      // Only synthesize TTM when there is no annual statement for that fiscal year.
      if (annualByYear.has(year)) continue;
      const priorYear = year - 1;
      const cashflowYearData = result.cashflow.yearData;

      for (const metricName of additiveCashflowMetrics) {
        const priorAnnual = cashflowYearData[priorYear]?.[metricName] ?? null;
        const currentQuarter = metricValueForYearQuarter("cashflow", metricName, year, quarter);
        const priorSameQuarter = metricValueForYearQuarter("cashflow", metricName, priorYear, quarter);

        if (priorAnnual == null || currentQuarter == null || priorSameQuarter == null) continue;
        if (!cashflowYearData[year]) cashflowYearData[year] = {};
        cashflowYearData[year][metricName] = priorAnnual + currentQuarter - priorSameQuarter;
      }
    }
  }

  return result;
}

function normalizeQuarter(raw: unknown): number | null {
  if (raw == null) return null;
  const q = Number(raw);
  if (!Number.isFinite(q)) return null;
  const qi = Math.trunc(q);
  return qi >= 1 && qi <= 4 ? qi : null;
}

function isQuarterlySource(sourceFile: string | null | undefined): boolean {
  return typeof sourceFile === "string" && sourceFile.toLowerCase().includes("p=quarterly");
}

function isAnnualStatementForLabels(statement: FinancialStatement): boolean {
  const quarter = normalizeQuarter(statement.fiscal_quarter);
  if (quarter === 4) return true;
  if (quarter != null) return false;
  if (isQuarterlySource(statement.source_file)) return false;
  return true;
}

/**
 * Build display labels for metric years.
 *
 * If a fiscal year has no annual statement (Q4/year-end) and only a running
 * quarter period, label it as "TTM {year}" instead of "FY{year}".
 */
export function buildMetricYearLabels(
  years: number[],
  statements: FinancialStatement[],
): Record<number, string> {
  const annualByYear = new Set<number>();
  const latestByYear = new Map<number, { periodEndDate: string; quarter: number | null }>();

  for (const statement of statements) {
    const year = Number(statement.fiscal_year);
    if (!Number.isFinite(year)) continue;

    if (isAnnualStatementForLabels(statement)) {
      annualByYear.add(year);
    }

    const quarter = normalizeQuarter(statement.fiscal_quarter);
    const periodEndDate = String(statement.period_end_date ?? "");
    const current = latestByYear.get(year);
    if (!current || periodEndDate > current.periodEndDate) {
      latestByYear.set(year, { periodEndDate, quarter });
    }
  }

  const labels: Record<number, string> = {};
  for (const year of years) {
    const latest = latestByYear.get(year);
    const isTtmYear = !annualByYear.has(year)
      && latest?.quarter != null
      && latest.quarter !== 4;
    labels[year] = isTtmYear ? `TTM ${year}` : `FY${year}`;
  }
  return labels;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function isPerShareMetricName(name: string): boolean {
  const lc = name.toLowerCase();
  return lc.includes("eps")
    || lc.includes("earnings per share")
    || lc.includes("book value per share")
    || lc.includes("book value/share")
    || lc.includes("bvps");
}

export function formatLineItemValue(name: string, value: number): string {
  return isPerShareMetricName(name) ? value.toFixed(3) : formatNumber(value);
}

export function formatMetricValue(name: string, value: number): string {
  const lc = name.toLowerCase().trim();
  const hasRatioWord = /(^|\s)ratio(\s|$)/.test(lc);
  // True percentage metrics (stored as decimals, display ×100 as %)
  const isPct = ["margin", "roe", "roa", "roic", "growth", "payout", "retention", "cagr"].some((k) => lc.includes(k))
    || lc.includes("dupont") || lc.includes("sustainable");
  if (isPct) return (value * 100).toFixed(1) + "%";
  // Days metrics
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  // Multiplier metrics (turnover, coverage, liquidity & leverage ratios)
  const isMult = ["turnover", "coverage", "multiplier"].some((k) => lc.includes(k))
    || lc.includes("debt / equity")
    || lc.includes("debt-to-equity")
    || lc.includes("debt to equity")
    || (hasRatioWord && !["payout", "retention"].some((k) => lc.includes(k)));
  if (isMult) return value.toFixed(2) + "x";
  // Per-share metrics
  if (isPerShareMetricName(name) || lc.includes("book value")) return value.toFixed(3);
  return formatNumber(value);
}

/** Type-safe metric formatter — returns "–" for non-numeric values. */
export function safeFormatMetric(name: string, val: unknown): string {
  if (typeof val !== "number" || isNaN(val)) return "–";
  return formatMetricValue(name, val);
}

/** Format ISO date string to a consistent display format. */
export function formatScoreDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "–";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

export function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= SCORE_THRESHOLDS.EXCEPTIONAL) return colors.success;
  if (score >= SCORE_THRESHOLDS.STRONG) return "#22c55e";
  if (score >= SCORE_THRESHOLDS.ACCEPTABLE) return colors.warning ?? "#f59e0b";
  if (score >= SCORE_THRESHOLDS.WEAK) return "#f97316";
  return colors.danger;
}

export function scoreLabel(score: number): string {
  if (score >= SCORE_THRESHOLDS.EXCEPTIONAL) return "Exceptional";
  if (score >= SCORE_THRESHOLDS.STRONG) return "Strong";
  if (score >= SCORE_THRESHOLDS.ACCEPTABLE) return "Acceptable";
  if (score >= SCORE_THRESHOLDS.WEAK) return "Weak";
  return "Avoid";
}

/**
 * Derive fiscal quarter from period_end_date when fiscal_quarter is not
 * explicitly stored in the DB.  Standard calendar-year mapping:
 *   March (03)    → Q1
 *   June  (06)    → Q2
 *   September (09)→ Q3
 *   December (12) → null  (full-year / annual)
 */
export function inferQuarterFromDate(periodEndDate: string): number | null {
  const month = parseInt(periodEndDate.slice(5, 7), 10);
  if (month === 3) return 1;
  if (month === 6) return 2;
  if (month === 9) return 3;
  return null; // December or other → treat as annual
}

// ── CFA-level fallback calculations for valuation metrics ────────────

/** Extract a numeric line-item from a statement by matching canonical codes. */
function extractLineItem(statement: FinancialStatement, ...codes: string[]): number | null {
  const upperCodes = new Set(codes.map((c) => c.toUpperCase()));
  for (const li of statement.line_items ?? []) {
    if (upperCodes.has(li.line_item_code.toUpperCase()) && li.amount != null) {
      return li.amount;
    }
  }
  return null;
}

function sumLineItems(statement: FinancialStatement, ...codes: string[]): number | null {
  const upperCodes = new Set(codes.map((c) => c.toUpperCase()));
  let total = 0;
  let found = false;
  for (const li of statement.line_items ?? []) {
    if (upperCodes.has(li.line_item_code.toUpperCase()) && li.amount != null) {
      total += li.amount;
      found = true;
    }
  }
  return found ? total : null;
}

/**
 * Compute missing valuation metrics from uploaded financial statements
 * using standard CFA Level 1/2 formulas:
 *
 *   Dividends / Share  = Common Dividends Paid / Shares Outstanding
 *                         (or directly from DIVIDEND_PER_SHARE line item)
 *   Payout Ratio       = Dividends Per Share / EPS
 *                         (fallback: |Common Dividends Paid| / Net Income)
 *   Retention Rate     = 1 − Payout Ratio
 *   Sustainable Growth = ROE × Retention Rate
 *                         where ROE = Net Income / Shareholders' Equity
 *
 * Only fills in metrics that are missing (nil) for a given fiscal year.
 * Returns a new array with the original metrics plus any computed ones.
 */
export function enrichMetricsWithFallbacks(
  allMetrics: StockMetric[],
  statements: FinancialStatement[],
): StockMetric[] {
  // Normalize leverage metric aliases so old backend rows, new backend rows,
  // and frontend fallbacks land on one stable display name.
  // Skip the map() allocation when nothing needs renaming (most common case).
  const needsRename = allMetrics.some(
    (m) => m.metric_type === "leverage"
      && (m.metric_name === "Debt-to-Equity" || m.metric_name === "Debt/Equity Ratio"),
  );
  const normalized: StockMetric[] = needsRename
    ? allMetrics.map((m) =>
        m.metric_type === "leverage"
          && (m.metric_name === "Debt-to-Equity" || m.metric_name === "Debt/Equity Ratio")
          ? { ...m, metric_name: DEBT_EQUITY_METRIC_NAME }
          : m,
      )
    : allMetrics;

  // Index existing valuation metrics by fiscal_year → metric_name
  const existing = new Map<string, number>();
  for (const m of normalized) {
    if (m.metric_type === "valuation") {
      existing.set(`${m.fiscal_year}::${m.metric_name}`, m.metric_value);
    }
  }

  // Index existing leverage metrics so we don't double-add
  const existingLeverage = new Set<string>();
  for (const m of normalized) {
    if (m.metric_type === "leverage") {
      existingLeverage.add(`${m.fiscal_year}::${m.metric_name}`);
    }
  }

  // Index existing profitability metrics so we don't double-add
  const existingProfitability = new Set<string>();
  for (const m of normalized) {
    if (m.metric_type === "profitability") {
      existingProfitability.add(`${m.fiscal_year}::${m.metric_name}`);
    }
  }

  const VALUATION_TARGETS = ["Dividends / Share", "Payout Ratio", "Retention Rate", "Sustainable Growth Rate"] as const;
  const computed: StockMetric[] = [];
  let syntheticId = -1;

  // Group annual statements by fiscal_year → statement_type.
  // Skip statements that are explicitly quarterly (fiscal_quarter != null) OR
  // whose period_end_date implies a mid-year quarter (June → Q2, September → Q3).
  // March and December are kept because they represent common fiscal-year ends
  // (Kuwait companies often use Dec 31 or Mar 31 as their year-end).
  const stmtByYear = new Map<number, Map<string, FinancialStatement>>();
  for (const s of statements) {
    if (s.fiscal_quarter != null) continue; // explicitly quarterly
    const endMonth = parseInt(s.period_end_date.slice(5, 7), 10);
    if (endMonth === 6 || endMonth === 9) continue; // inferred Q2/Q3 — clearly non-annual
    if (!stmtByYear.has(s.fiscal_year)) stmtByYear.set(s.fiscal_year, new Map());
    stmtByYear.get(s.fiscal_year)!.set(s.statement_type, s);
  }

  for (const [fiscalYear, typeMap] of stmtByYear) {
    // Check which valuation metrics are missing for this year
    const missing = VALUATION_TARGETS.filter(
      (name) => !existing.has(`${fiscalYear}::${name}`),
    );
    if (missing.length === 0) continue;

    const income = typeMap.get("income");
    const balance = typeMap.get("balance");
    const cashflow = typeMap.get("cashflow");

    // Extract required line items
    const netIncome = income ? extractLineItem(income, "NET_INCOME", "NET_INCOME_TO_COMMON") : null;
    const epsDiluted = income
      ? extractLineItem(income, "EPS_DILUTED", "EPS_BASIC", "eps_basic",
          "basic_and_diluted_earnings_per_share_fils",
          "basic_and_diluted_earnings_per_share_attributable_to_owners_of_the_parent_company_fils")
      : null;
    const sharesOutstanding = balance
      ? extractLineItem(balance, "SHARES_OUTSTANDING_DILUTED", "SHARES_OUTSTANDING_BASIC",
          "DILUTED_SHARES_OUTSTANDING", "BASIC_SHARES_OUTSTANDING",
          "TOTAL_COMMON_SHARES_OUTSTANDING", "FILING_DATE_SHARES_OUTSTANDING",
          "SHARES_OUTSTANDING", "SHARES_DILUTED")
      : (income
        ? extractLineItem(income, "SHARES_OUTSTANDING_DILUTED", "SHARES_OUTSTANDING_BASIC",
            "DILUTED_SHARES_OUTSTANDING", "BASIC_SHARES_OUTSTANDING",
            "TOTAL_COMMON_SHARES_OUTSTANDING", "SHARES_OUTSTANDING", "SHARES_DILUTED")
        : null);
    const dividendsPaid = cashflow
      ? extractLineItem(cashflow, "COMMON_DIVIDENDS_PAID", "dividends_paid")
      : null;
    const dpsLineItem = income
      ? extractLineItem(income, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE")
        ?? (cashflow ? extractLineItem(cashflow, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE") : null)
        ?? (balance ? extractLineItem(balance, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE") : null)
      : null;
    const shareholdersEquity = balance
      ? extractLineItem(balance, "SHAREHOLDERS_EQUITY", "TOTAL_EQUITY")
      : null;

    // Find a period_end_date for this fiscal year from any statement
    const periodEndDate = (income ?? balance ?? cashflow)?.period_end_date ?? `${fiscalYear}-12-31`;

    // Helper to check if an EPS code looks like it's in fils/cents (sub-unit)
    const isSubUnit = (code: string) => /fils|cents|halala/i.test(code);
    let eps = existing.get(`${fiscalYear}::EPS`) ?? null;
    if (eps == null && epsDiluted != null) {
      // Check for sub-unit codes in income statement
      const epsLi = income?.line_items?.find((li) =>
        ["EPS_DILUTED", "EPS_BASIC", "eps_basic",
         "basic_and_diluted_earnings_per_share_fils",
         "basic_and_diluted_earnings_per_share_attributable_to_owners_of_the_parent_company_fils"]
          .some((c) => li.line_item_code.toUpperCase() === c.toUpperCase()) && li.amount != null);
      eps = epsLi && isSubUnit(epsLi.line_item_code) ? epsDiluted / 1000 : epsDiluted;
    }

    // ── 1. Dividends / Share ─────────────────────────────────────
    let dps: number | null = null;
    if (missing.includes("Dividends / Share")) {
      if (dpsLineItem != null) {
        dps = dpsLineItem;
      } else if (dividendsPaid != null && sharesOutstanding != null && sharesOutstanding !== 0) {
        // dividends_paid is typically negative in cash flow; use absolute value
        dps = Math.abs(dividendsPaid) / sharesOutstanding;
      }
      if (dps != null) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Dividends / Share",
          metric_value: dps, created_at: 0,
        });
        existing.set(`${fiscalYear}::Dividends / Share`, dps);
      }
    } else {
      dps = existing.get(`${fiscalYear}::Dividends / Share`) ?? null;
    }

    // ── 2. Payout Ratio  = DPS / EPS  (or |Div Paid| / Net Income) ─
    let payoutRatio: number | null = null;
    if (missing.includes("Payout Ratio")) {
      if (dps != null && eps != null && eps !== 0) {
        payoutRatio = dps / eps;
      } else if (dividendsPaid != null && netIncome != null && netIncome !== 0) {
        payoutRatio = Math.abs(dividendsPaid) / netIncome;
      }
      // Clamp to [0,1] – payout > 100% is possible but cap display sanity
      if (payoutRatio != null && payoutRatio < 0) payoutRatio = 0;
      if (payoutRatio != null) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Payout Ratio",
          metric_value: payoutRatio, created_at: 0,
        });
        existing.set(`${fiscalYear}::Payout Ratio`, payoutRatio);
      }
    } else {
      payoutRatio = existing.get(`${fiscalYear}::Payout Ratio`) ?? null;
    }

    // ── 3. Retention Rate = 1 − Payout Ratio ─────────────────────
    let retentionRate: number | null = null;
    if (missing.includes("Retention Rate")) {
      if (payoutRatio != null) {
        retentionRate = 1 - payoutRatio;
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Retention Rate",
          metric_value: retentionRate, created_at: 0,
        });
        existing.set(`${fiscalYear}::Retention Rate`, retentionRate);
      }
    } else {
      retentionRate = existing.get(`${fiscalYear}::Retention Rate`) ?? null;
    }

    // ── 4. Sustainable Growth Rate = ROE × Retention Rate ────────
    if (missing.includes("Sustainable Growth Rate")) {
      if (retentionRate != null && netIncome != null && shareholdersEquity != null && shareholdersEquity !== 0) {
        const roe = netIncome / shareholdersEquity;
        const sgr = roe * retentionRate;
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Sustainable Growth Rate",
          metric_value: sgr, created_at: 0,
        });
      }
    }
  }

  // ── Leverage fallbacks (Capital Structure) ──────────────────────
  // Compute Debt-to-Equity and Interest Coverage directly from the
  // uploaded statements when the backend hasn't produced them. Matches
  // the CFA-level formulas used server-side in fundamental_legacy.py.
  for (const [fiscalYear, typeMap] of stmtByYear) {
    const income = typeMap.get("income");
    const balance = typeMap.get("balance");
    const periodEndDate = (income ?? balance)?.period_end_date ?? `${fiscalYear}-12-31`;

    // Debt/Equity Ratio = (ST debt + LT debt) / Total Equity
    if (!existingLeverage.has(`${fiscalYear}::${DEBT_EQUITY_METRIC_NAME}`)) {
      const bankBorrowings = balance
        ? sumLineItems(
            balance,
            "CURRENT_BANK_BORROWINGS",
            "BANK_BORROWINGS_CURRENT",
            "BANK_BORROWING_CURRENT",
            "CURRENT_BORROWINGS",
            "CURRENT_PORTION_OF_BANK_BORROWINGS",
            "CURRENTPORTDEBT",
            "SHORT_TERM_BORROWINGS",
            "SHORT_TERM_LOANS",
            "SHORT_TERM_LOAN",
            "BANK_OVERDRAFT",
            "BANK_OVERDRAFTS",
            "OVERDRAFT",
            "OVERDRAFTS",
            "LONG_TERM_BANK_BORROWINGS",
            "BANK_BORROWINGS_NON_CURRENT",
            "BANK_BORROWING_NON_CURRENT",
            "NON_CURRENT_BANK_BORROWINGS",
            "NON_CURRENT_BORROWINGS",
            "DEBTNC",
            "LONG_TERM_BORROWINGS",
            "LONG_TERM_LOANS",
            "LONG_TERM_LOAN",
            "TERM_LOAN",
            "TERM_LOANS",
            "NON_CURRENT_MURABAHA_PAYABLE",
            "DUE_TO_BANK",
            "DUE_TO_BANKS",
            "BANK_FACILITY",
            "BANK_FACILITIES",
            "BANKING_FACILITY",
            "BANKING_FACILITIES",
            "MURABAHA_PAYABLE",
          )
        : null;
      const fallbackDebt = balance
        ? sumLineItems(
            balance,
            "SHORT_TERM_DEBT",
            "SHORT_TERM_BORROWINGS",
            "CURRENT_PORTION_OF_LONG_TERM_DEBT",
            "NOTES_PAYABLE",
            "LONG_TERM_DEBT",
            "LONG_TERM_BORROWINGS",
            "BONDS_PAYABLE",
          )
        : null;
      const equity = balance
        ? extractLineItem(balance, "TOTAL_EQUITY", "SHAREHOLDERS_EQUITY",
            "TOTAL_SHAREHOLDERS_EQUITY", "STOCKHOLDERS_EQUITY")
        : null;
      const totalDebt = bankBorrowings ?? fallbackDebt;
      if (totalDebt != null && equity != null && equity !== 0) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "leverage", metric_name: DEBT_EQUITY_METRIC_NAME,
          metric_value: totalDebt / equity, created_at: 0,
        });
        existingLeverage.add(`${fiscalYear}::${DEBT_EQUITY_METRIC_NAME}`);
      }
    }

    // Interest Coverage = Operating Income (EBIT) / |Interest Expense|
    if (!existingLeverage.has(`${fiscalYear}::Interest Coverage`)) {
      const operatingIncome = income
        ? extractLineItem(income, "OPERATING_INCOME", "OPERATING_PROFIT",
            "EBIT", "INCOME_FROM_OPERATIONS")
        : null;
      const interestExpense = income
        ? extractLineItem(income, "INTEREST_EXPENSE", "FINANCE_COSTS",
            "FINANCE_EXPENSE", "INTEREST_AND_FINANCE_COSTS")
        : null;
      if (operatingIncome != null && interestExpense != null && interestExpense !== 0) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "leverage", metric_name: "Interest Coverage",
          metric_value: operatingIncome / Math.abs(interestExpense), created_at: 0,
        });
        existingLeverage.add(`${fiscalYear}::Interest Coverage`);
      }
    }

    // ── ROIC (Profitability) ─────────────────────────────────────
    // CFA: ROIC = NOPAT / Invested Capital
    //   NOPAT            = Operating Income × (1 − Effective Tax Rate)
    //   Invested Capital = Total Equity + Total Debt − Cash − ST Investments
    if (!existingProfitability.has(`${fiscalYear}::ROIC`)) {
      const operatingIncomeP = income
        ? extractLineItem(income, "OPERATING_INCOME", "OPERATING_PROFIT",
            "EBIT", "INCOME_FROM_OPERATIONS")
        : null;
      const stDebtP = balance
        ? extractLineItem(balance, "SHORT_TERM_DEBT", "SHORT_TERM_BORROWINGS",
            "CURRENT_PORTION_OF_LONG_TERM_DEBT", "NOTES_PAYABLE")
        : null;
      const ltDebtP = balance
        ? extractLineItem(balance, "LONG_TERM_DEBT", "LONG_TERM_BORROWINGS",
            "BONDS_PAYABLE")
        : null;
      const equityP = balance
        ? extractLineItem(balance, "TOTAL_EQUITY", "SHAREHOLDERS_EQUITY",
            "TOTAL_SHAREHOLDERS_EQUITY", "STOCKHOLDERS_EQUITY")
        : null;
      const cash = balance
        ? extractLineItem(balance, "CASH_AND_EQUIVALENTS", "CASH_AND_CASH_EQUIVALENTS",
            "CASH")
        : null;
      const shortTermInv = balance
        ? extractLineItem(balance, "SHORT_TERM_INVESTMENTS", "MARKETABLE_SECURITIES")
        : null;

      // Effective tax rate: prefer line item, else compute from tax / pretax
      let taxRate = income
        ? extractLineItem(income, "EFFECTIVE_TAX_RATE")
        : null;
      if (taxRate == null && income) {
        const incomeTax = extractLineItem(income, "INCOME_TAX_EXPENSE",
          "PROVISION_FOR_INCOME_TAXES", "TAX_EXPENSE");
        const pretax = extractLineItem(income, "PRETAX_INCOME",
          "INCOME_BEFORE_TAX", "PROFIT_BEFORE_TAX");
        if (incomeTax != null && pretax != null && pretax !== 0) {
          taxRate = incomeTax / pretax;
        }
      }
      // Fall back to a reasonable default of 0 if unknown (no tax data ⇒ NOPAT = EBIT)
      const safeTaxRate = taxRate != null ? Math.min(Math.max(taxRate, 0), 1) : 0;

      const totalDebtP = (stDebtP ?? 0) + (ltDebtP ?? 0);
      const investedCapital = (equityP ?? 0) + totalDebtP - (cash ?? 0) - (shortTermInv ?? 0);

      if (operatingIncomeP != null && equityP != null && investedCapital > 0) {
        const nopat = operatingIncomeP * (1 - safeTaxRate);
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "profitability", metric_name: "ROIC",
          metric_value: nopat / investedCapital, created_at: 0,
        });
        existingProfitability.add(`${fiscalYear}::ROIC`);
      }
    }
  }

  // ── Synthetic TTM cash-flow metrics (align Metrics tab with Statements tab) ──
  // For years that have no annual statement but do have a latest quarter,
  // compute TTM as: prior annual + latest quarter - prior-year same quarter.
  // This prevents TTM labels from showing raw quarter values.
  const annualByYear = new Set<number>();
  const quartersByTypeYear = new Map<string, FinancialStatement[]>();

  for (const statement of statements) {
    const year = Number(statement.fiscal_year);
    if (!Number.isFinite(year)) continue;
    const statementType = String(statement.statement_type ?? "").toLowerCase();
    if (!statementType) continue;

    if (isAnnualStatementForLabels(statement)) {
      annualByYear.add(year);
      continue;
    }

    const key = `${statementType}::${year}`;
    const arr = quartersByTypeYear.get(key) ?? [];
    arr.push(statement);
    quartersByTypeYear.set(key, arr);
  }

  const firstStockId = normalized[0]?.stock_id ?? 0;
  const yearsInMetrics = [...new Set(normalized.map((m) => m.fiscal_year))];

  const getQuarter = (statement: FinancialStatement): number | null => {
    const q = normalizeQuarter(statement.fiscal_quarter);
    if (q != null) return q;
    if (isQuarterlySource(statement.source_file)) {
      return inferQuarterFromDate(String(statement.period_end_date ?? ""));
    }
    return null;
  };

  const pickLatestQuarter = (statementType: string, fiscalYear: number): FinancialStatement | null => {
    const arr = (quartersByTypeYear.get(`${statementType}::${fiscalYear}`) ?? [])
      .filter((statement) => {
        const q = getQuarter(statement);
        return q != null && q >= 1 && q <= 3;
      })
      .sort((a, b) => String(a.period_end_date).localeCompare(String(b.period_end_date)));
    return arr.length ? arr[arr.length - 1] : null;
  };

  const pickAnnual = (statementType: string, fiscalYear: number): FinancialStatement | null => {
    const arr = statements
      .filter((statement) => Number(statement.fiscal_year) === fiscalYear)
      .filter((statement) => String(statement.statement_type ?? "").toLowerCase() === statementType)
      .filter((statement) => isAnnualStatementForLabels(statement))
      .sort((a, b) => String(a.period_end_date).localeCompare(String(b.period_end_date)));
    return arr.length ? arr[arr.length - 1] : null;
  };

  const pickSameQuarter = (statementType: string, fiscalYear: number, quarter: number): FinancialStatement | null => {
    const arr = (quartersByTypeYear.get(`${statementType}::${fiscalYear}`) ?? [])
      .filter((statement) => getQuarter(statement) === quarter)
      .sort((a, b) => String(a.period_end_date).localeCompare(String(b.period_end_date)));
    return arr.length ? arr[arr.length - 1] : null;
  };

  const buildTtmLineMap = (statementType: string, fiscalYear: number): Map<string, number> | null => {
    const latestQuarter = pickLatestQuarter(statementType, fiscalYear);
    if (!latestQuarter) return null;
    const latestQuarterNum = getQuarter(latestQuarter);
    if (latestQuarterNum == null) return null;

    const priorAnnual = pickAnnual(statementType, fiscalYear - 1);
    if (!priorAnnual) return null;

    const priorSameQuarter = pickSameQuarter(statementType, fiscalYear - 1, latestQuarterNum);
    if (!priorSameQuarter) return null;

    const annualMap = new Map<string, number>();
    const priorQuarterMap = new Map<string, number>();
    const latestMap = new Map<string, number>();

    for (const li of priorAnnual.line_items ?? []) {
      annualMap.set(String(li.line_item_code ?? "").toUpperCase(), li.amount ?? 0);
    }
    for (const li of priorSameQuarter.line_items ?? []) {
      priorQuarterMap.set(String(li.line_item_code ?? "").toUpperCase(), li.amount ?? 0);
    }
    for (const li of latestQuarter.line_items ?? []) {
      latestMap.set(String(li.line_item_code ?? "").toUpperCase(), li.amount ?? 0);
    }

    const ttm = new Map<string, number>();
    for (const [code, latestAmount] of latestMap.entries()) {
      const annualAmount = annualMap.get(code) ?? 0;
      const priorAmount = priorQuarterMap.get(code) ?? 0;
      ttm.set(code, annualAmount + latestAmount - priorAmount);
    }
    return ttm;
  };

  const aliasPick = (map: Map<string, number> | null, ...codes: string[]): number | null => {
    if (!map) return null;
    for (const code of codes) {
      const val = map.get(code.toUpperCase());
      if (val != null) return val;
    }
    return null;
  };

  for (const fiscalYear of yearsInMetrics) {
    if (annualByYear.has(fiscalYear)) continue;

    const ttmCashflow = buildTtmLineMap("cashflow", fiscalYear);
    if (!ttmCashflow) continue;

    const latestQuarter = pickLatestQuarter("cashflow", fiscalYear);
    if (!latestQuarter) continue;

    const cfo = aliasPick(ttmCashflow, "CASH_FROM_OPERATIONS", "OPERATING_CASH_FLOW");
    const cfi = aliasPick(ttmCashflow, "CASH_FROM_INVESTING", "INVESTING_CASH_FLOW");
    const cff = aliasPick(ttmCashflow, "CASH_FROM_FINANCING", "FINANCING_CASH_FLOW");
    let fcf = aliasPick(ttmCashflow, "FREE_CASH_FLOW", "UNLEVERED_FREE_CASH_FLOW", "LEVERED_FREE_CASH_FLOW");
    if (fcf == null && cfo != null) {
      const capex = aliasPick(ttmCashflow, "CAPITAL_EXPENDITURES", "CAPEX");
      if (capex != null) fcf = cfo - Math.abs(capex);
    }

    const pushSynthetic = (metricName: string, metricValue: number | null) => {
      if (metricValue == null) return;
      computed.push({
        id: syntheticId--,
        stock_id: firstStockId,
        fiscal_year: fiscalYear,
        fiscal_quarter: 4,
        period_end_date: latestQuarter.period_end_date,
        metric_type: "cashflow",
        metric_name: metricName,
        metric_value: metricValue,
        created_at: Number.MAX_SAFE_INTEGER,
      });
    };

    pushSynthetic("Cash from Operations", cfo);
    pushSynthetic("Cash from Investing", cfi);
    pushSynthetic("Cash from Financing", cff);
    pushSynthetic("Free Cash Flow", fcf);

    if (cfo != null) {
      const ttmIncome = buildTtmLineMap("income", fiscalYear);
      const netIncome = aliasPick(ttmIncome, "NET_INCOME", "NET_INCOME_TO_COMMON");
      if (netIncome != null && netIncome !== 0) {
        pushSynthetic("CFO / Net Income", cfo / netIncome);
      }
    }
  }

  if (computed.length === 0) return normalized;
  return [...normalized, ...computed];
}

 
export const INTERPRETATION_SCALE = [
  // eslint-disable-next-line custom-styles/no-hardcoded-styles
  { min: 85, max: 100, label: "Exceptional investment candidate", color: "#16a34a" },
  // eslint-disable-next-line custom-styles/no-hardcoded-styles
  { min: 70, max: 84, label: "Strong", color: "#22c55e" },
  // eslint-disable-next-line custom-styles/no-hardcoded-styles
  { min: 55, max: 69, label: "Acceptable / neutral", color: "#f59e0b" },
  // eslint-disable-next-line custom-styles/no-hardcoded-styles
  { min: 40, max: 54, label: "Weak", color: "#f97316" },
  // eslint-disable-next-line custom-styles/no-hardcoded-styles
  { min: 0, max: 39, label: "Avoid unless special situation", color: "#ef4444" },
] as const;
