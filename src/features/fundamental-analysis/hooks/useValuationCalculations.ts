/**
 * useValuationCalculations — Manages valuation form state, mutations,
 * pre-flight validation, auto-population from defaults, and last result tracking.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useStatements, useValuationDefaults } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import {
    runDCFValuation,
    runDDMValuation,
    runGrahamValuation,
    runMultiplesValuation,
  type FinancialStatement,
    type ValuationRunResult,
} from "@/services/api";

/** Strip commas so users can type "1,234,567" and parseFloat works. */
const stripCommas = (s: string) => s.replace(/,/g, "");

const pickLineAmount = (statement: FinancialStatement | null, codes: string[]): number | null => {
  if (!statement) return null;
  const codeSet = new Set(codes.map((c) => c.toUpperCase()));
  for (const li of statement.line_items ?? []) {
    if (codeSet.has(li.line_item_code.toUpperCase()) && li.amount != null) {
      return li.amount;
    }
  }
  return null;
};

const normalizeRate = (raw: number | null): number | null => {
  if (raw == null || !Number.isFinite(raw)) return null;
  const abs = Math.abs(raw);
  const normalized = abs > 1 && abs <= 100 ? abs / 100 : abs;
  return Math.min(Math.max(normalized, 0), 1);
};

const latestAnnualByType = (
  statements: FinancialStatement[],
  type: "income" | "balance" | "cashflow" | "equity",
): FinancialStatement | null => {
  const aliases: Record<"income" | "balance" | "cashflow" | "equity", string[]> = {
    income: ["income", "income_statement"],
    balance: ["balance", "balance_sheet"],
    cashflow: ["cashflow", "cash_flow"],
    equity: ["equity", "statement_of_equity"],
  };
  const accepted = new Set(aliases[type]);
  const annual = statements
    .filter((s) => accepted.has(s.statement_type) && s.fiscal_quarter == null)
    .sort((a, b) => {
      if (b.fiscal_year !== a.fiscal_year) return b.fiscal_year - a.fiscal_year;
      return (b.period_end_date ?? "").localeCompare(a.period_end_date ?? "");
    });
  return annual[0] ?? null;
};

const deriveWaccInputsFromStatements = (statements: FinancialStatement[]) => {
  const income = latestAnnualByType(statements, "income");
  const balance = latestAnnualByType(statements, "balance");

  const interestExpense = pickLineAmount(income, [
    "INTEREST_EXPENSE",
    "INTERESTEXPENSE",
    "INTERESTEXPENSERE",
    "FINANCE_COSTS",
    "FINANCE_COST",
    "FINANCE_EXPENSE",
    "INTEREST_AND_FINANCE_COSTS",
    "INTEREST_EXPENSE_NET",
    "NET_INTEREST_EXPENSE",
    "NETINTERESTEXPENSERE",
  ]);

  const totalDebtDirect = pickLineAmount(balance, [
    "TOTAL_DEBT",
    "DEBT",
    "TOTAL_BORROWINGS",
    "BORROWINGS",
  ]);

  const shortTermDebt = pickLineAmount(balance, [
    "SHORT_TERM_DEBT",
    "CURRENT_DEBT",
    "SHORT_TERM_BORROWINGS",
    "CURRENT_PORTION_OF_LONG_TERM_DEBT",
    "CURRENT_BORROWINGS",
    "NOTES_PAYABLE",
    "BANK_OVERDRAFT",
    "BANK_OVERDRAFTS",
  ]);

  const longTermDebt = pickLineAmount(balance, [
    "LONG_TERM_DEBT",
    "NON_CURRENT_DEBT",
    "LONG_TERM_BORROWINGS",
    "BONDS_PAYABLE",
    "NON_CURRENT_BORROWINGS",
    "LONG_TERM_LOANS",
  ]);

  const totalDebt = totalDebtDirect ?? ((shortTermDebt ?? 0) + (longTermDebt ?? 0));

  const effectiveTaxRate = normalizeRate(
    pickLineAmount(income, ["EFFECTIVE_TAX_RATE", "EFFECTIVE_INCOME_TAX_RATE", "TAXRATE"]),
  );

  const incomeTaxExpense = pickLineAmount(income, [
    "INCOME_TAX_EXPENSE",
    "PROVISION_FOR_INCOME_TAXES",
    "TAX_EXPENSE",
    "INCOME_TAX",
  ]);
  const preTaxIncome = pickLineAmount(income, [
    "PRETAX_INCOME",
    "INCOME_BEFORE_TAX",
    "PROFIT_BEFORE_TAX",
    "EARNINGS_BEFORE_TAX",
  ]);

  const computedTaxRate =
    effectiveTaxRate ??
    (incomeTaxExpense != null && preTaxIncome != null && Math.abs(preTaxIncome) > 0
      ? Math.min(Math.max(Math.abs(incomeTaxExpense) / Math.abs(preTaxIncome), 0), 1)
      : null);

  const computedCostOfDebt =
    interestExpense != null && totalDebt > 0
      ? Math.min(Math.max(Math.abs(interestExpense) / totalDebt, 0), 1)
      : null;

  return {
    costOfDebt: computedCostOfDebt,
    taxRate: computedTaxRate,
  };
};

const deriveLatestSharesFromStatements = (statements: FinancialStatement[]): number | null => {
  const normalizeToken = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalizeQuarter = (raw: unknown): number | null => {
    if (raw == null) return null;
    const q = Number(raw);
    if (!Number.isFinite(q)) return null;
    const qi = Math.trunc(q);
    return qi >= 1 && qi <= 4 ? qi : null;
  };
  const isQuarterlySource = (sourceFile: string | null | undefined): boolean =>
    typeof sourceFile === "string" && sourceFile.toLowerCase().includes("p=quarterly");
  const isAnnualStatement = (s: FinancialStatement): boolean => {
    const q = normalizeQuarter(s.fiscal_quarter);
    if (q === 4) return true;
    if (q != null) return false;
    return !isQuarterlySource(s.source_file);
  };

  const isShareCandidate = (codeRaw: string): boolean => {
    const code = normalizeToken(codeRaw);
    if (!code.includes("SHARE")) return false;
    // Exclude per-share ratios and unrelated share terms.
    if (code.includes("PERSHARE") || code.startsWith("EPS") || code.includes("PAYOUTRATIO")) return false;
    // Prefer outstanding/common/filing/diluted/basic style fields.
    return (
      code.includes("OUTSTANDING")
      || code.includes("TOTALCOMMON")
      || code.includes("FILINGDATE")
      || code.includes("DILUTED")
      || code.includes("BASIC")
      || code === "SHARES"
    );
  };

  const codePriority = (codeRaw: string): number => {
    const code = normalizeToken(codeRaw);
    // Prefer directly reported outstanding/diluted/basic share rows first.
    if (code.includes("OUTSTANDING") && code.includes("SHARE") && !code.includes("FILINGDATE") && !code.includes("TOTALCOMMON")) return 9;
    if (code.includes("DILUTED") && code.includes("SHARE")) return 8;
    if (code.includes("BASIC") && code.includes("SHARE")) return 7;
    // Use filing/common variants as fallback if direct outstanding rows are absent.
    if (code.includes("FILINGDATE") && code.includes("SHARE")) return 6;
    if (code.includes("TOTALCOMMON") && code.includes("SHARE")) return 5;
    return 1;
  };

  const getAmountByCode = (statement: FinancialStatement | null, codeRaw: string): number | null => {
    if (!statement) return null;
    const target = normalizeToken(codeRaw);
    for (const li of statement.line_items ?? []) {
      if (normalizeToken(li.line_item_code) === target && li.amount != null) {
        return li.amount;
      }
    }
    return null;
  };

  const incomeStatements = statements
    .filter((s) => {
      const st = normalizeToken(s.statement_type ?? "");
      return st === "INCOME" || st === "INCOMESTATEMENT";
    })
    .map((s) => ({ ...s, fiscal_quarter: normalizeQuarter(s.fiscal_quarter) }));

  const annualIncome = incomeStatements
    .filter((s) => isAnnualStatement(s))
    .sort((a, b) => (b.period_end_date ?? "").localeCompare(a.period_end_date ?? ""));

  const quarterlyIncome = incomeStatements
    .filter((s) => !isAnnualStatement(s) && s.fiscal_quarter != null)
    .sort((a, b) => {
      const dateCmp = (b.period_end_date ?? "").localeCompare(a.period_end_date ?? "");
      if (dateCmp !== 0) return dateCmp;
      if (b.fiscal_year !== a.fiscal_year) return b.fiscal_year - a.fiscal_year;
      return (b.fiscal_quarter ?? 0) - (a.fiscal_quarter ?? 0);
    });

  const latestIncomeQuarter = quarterlyIncome[0] ?? null;

  if (latestIncomeQuarter && latestIncomeQuarter.fiscal_quarter != null) {
    const priorAnnual = annualIncome.find(
      (s) => s.fiscal_year === latestIncomeQuarter.fiscal_year - 1,
    ) ?? null;

    const priorSameQuarter = quarterlyIncome.find(
      (s) => s.fiscal_year === latestIncomeQuarter.fiscal_year - 1
        && normalizeQuarter(s.fiscal_quarter) === latestIncomeQuarter.fiscal_quarter,
    ) ?? null;

    if (priorAnnual && priorSameQuarter) {
      const ttmCandidates: Array<{ value: number; priority: number }> = [];
      for (const li of latestIncomeQuarter.line_items ?? []) {
        if (!isShareCandidate(li.line_item_code) || li.amount == null) continue;
        const annualAmt = getAmountByCode(priorAnnual, li.line_item_code);
        const priorQAmt = getAmountByCode(priorSameQuarter, li.line_item_code);
        if (annualAmt == null || priorQAmt == null) continue;
        const ttmValue = annualAmt + li.amount - priorQAmt;
        if (!Number.isFinite(ttmValue) || ttmValue <= 0) continue;
        ttmCandidates.push({ value: ttmValue, priority: codePriority(li.line_item_code) });
      }
      if (ttmCandidates.length > 0) {
        ttmCandidates.sort((a, b) => b.priority - a.priority);
        return ttmCandidates[0].value;
      }
    }
  }

  const candidates: Array<{
    periodEndDate: string;
    amount: number;
    fiscalYear: number;
    fiscalQuarter: number | null;
    priority: number;
  }> = [];

  for (const s of statements) {
    for (const li of s.line_items ?? []) {
      if (!isShareCandidate(li.line_item_code)) continue;
      if (li.amount == null || li.amount <= 0) continue;
      candidates.push({
        periodEndDate: s.period_end_date,
        amount: li.amount,
        fiscalYear: s.fiscal_year,
        fiscalQuarter: s.fiscal_quarter,
        priority: codePriority(li.line_item_code),
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const dateCmp = b.periodEndDate.localeCompare(a.periodEndDate);
    if (dateCmp !== 0) return dateCmp;
    const quarterScoreA = a.fiscalQuarter == null ? 0 : 1;
    const quarterScoreB = b.fiscalQuarter == null ? 0 : 1;
    if (quarterScoreA !== quarterScoreB) return quarterScoreB - quarterScoreA;
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.fiscalYear !== a.fiscalYear) return b.fiscalYear - a.fiscalYear;
    return (b.fiscalQuarter ?? 0) - (a.fiscalQuarter ?? 0);
  });

  return candidates[0].amount;
};

export type ValuationModel = "graham" | "dcf" | "ddm" | "multiples";

export function useValuationCalculations(stockId: number) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<ValuationModel>("graham");

  // ── Auto-fetched defaults ───────────────────────────────────────
  const defaults = useValuationDefaults(stockId);
  const stmtQ = useStatements(stockId);
  const populated = useRef<number | null>(null);

  // ── Form state ──────────────────────────────────────────────────
  const [eps, setEps] = useState("");
  const [grahamGrowth, setGrahamGrowth] = useState("");
  const [corpYield, setCorpYield] = useState("4.4");
  const [marginOfSafety, setMarginOfSafety] = useState("25");
  const [currentPrice, setCurrentPrice] = useState("");
  // Per-model MoS (editable in result cards, persisted in state)
  const [mosGraham, setMosGraham] = useState("15");
  const [mosDcf, setMosDcf] = useState("15");
  const [mosDdm, setMosDdm] = useState("15");
  const [mosMult, setMosMult] = useState("15");
  const [fcf, setFcf] = useState("");
  const [g1, setG1] = useState("10");
  const [g2, setG2] = useState("5");
  const [dr, setDr] = useState("10");
  const [tg, setTg] = useState("2.5");
  const [shares, setShares] = useState("1");
  const [s1, setS1] = useState("5");
  const [s2, setS2] = useState("5");
  const [cash, setCash] = useState("0");
  const [debt, setDebt] = useState("0");
  const [div, setDiv] = useState("");
  const [divGr, setDivGr] = useState("5");
  const [rr, setRr] = useState("10");
  const [mv, setMv] = useState("");
  const [pm, setPm] = useState("");
  const [multipleType, setMultipleType] = useState("P/E");
  const [useWacc, setUseWacc] = useState(false);
  const [waccRf, setWaccRf] = useState(""); // risk-free rate override (in %)
  const [waccKd, setWaccKd] = useState(""); // cost of debt override (in %)
  const [waccTax, setWaccTax] = useState(""); // tax rate override (in %)

  const statementWaccInputs = useMemo(() => {
    const statements = stmtQ.data?.statements ?? [];
    return deriveWaccInputsFromStatements(statements);
  }, [stmtQ.data]);

  const latestSharesFromStatements = useMemo(() => {
    const statements = stmtQ.data?.statements ?? [];
    return deriveLatestSharesFromStatements(statements);
  }, [stmtQ.data]);

  // ── Derived WACC (recalculated when user edits Rf or Tax Rate) ──
  // CFA WACC: WACC = (E/V) × Ke + (D/V) × Kd × (1 − T)
  // where Ke = Rf + β × ERP  (CAPM)
  const waccComputed = useMemo(() => {
    const d = defaults.data;
    if (!d) return null;
    const rfOverride = parseFloat(waccRf);
    const rf = !isNaN(rfOverride) ? rfOverride / 100 : d.wacc_risk_free_rate;
    if (rf == null || d.wacc_beta == null || d.wacc_equity_risk_premium == null) return null;
    // CAPM: Cost of Equity
    const ke = rf + d.wacc_beta * d.wacc_equity_risk_premium;
    // Normalize weights to ensure E/V + D/V = 1
    const rawWeq = d.wacc_weight_equity ?? 1;
    const rawWdt = d.wacc_weight_debt ?? 0;
    const wSum = rawWeq + rawWdt;
    const weq = wSum > 0 ? rawWeq / wSum : 1;
    const wdt = wSum > 0 ? rawWdt / wSum : 0;
    const kdOverride = parseFloat(waccKd);
    const kd = !isNaN(kdOverride)
      ? kdOverride / 100
      : (d.wacc_cost_of_debt ?? statementWaccInputs.costOfDebt ?? 0);
    // Tax rate: user override > backend value > 0
    const taxOverride = parseFloat(waccTax);
    const tax = !isNaN(taxOverride)
      ? taxOverride / 100
      : (d.wacc_tax_rate ?? statementWaccInputs.taxRate ?? 0);
    const wacc = (weq * ke) + (wdt * kd * (1 - tax));
    return { rf, ke, kd, wacc, weq, wdt, tax };
  }, [defaults.data, statementWaccInputs.costOfDebt, statementWaccInputs.taxRate, waccKd, waccRf, waccTax]);

  // ── Last calculation result ─────────────────────────────────────
  const [lastResult, setLastResult] = useState<ValuationRunResult | null>(null);

  // ── Auto-populate from defaults when they load ──────────────────
  useEffect(() => {
    if (!defaults.data || populated.current === stockId) return;
    populated.current = stockId;
    const d = defaults.data;
    if (d.eps != null) setEps(d.eps.toFixed(3));
    else setEps("");
    // Graham-specific defaults
    if (d.graham_growth_cagr != null) setGrahamGrowth(String(d.graham_growth_cagr));
    else setGrahamGrowth("");
    if (d.bond_yield != null) setCorpYield(String(d.bond_yield));
    else setCorpYield("4.4");
    if (d.current_price != null) setCurrentPrice(String(d.current_price));
    else setCurrentPrice("");
    if (d.fcf != null) setFcf(String(d.fcf));
    else setFcf("");
    if (latestSharesFromStatements == null && d.shares_outstanding != null && d.shares_outstanding > 0) {
      setShares(d.shares_outstanding.toLocaleString("en-US", { maximumFractionDigits: 0 }));
    } else if (latestSharesFromStatements == null) {
      setShares("1");
    }
    if (d.dividends_per_share != null) setDiv(String(d.dividends_per_share));
    else setDiv("");
    if (d.avg_dividend_growth != null) setDivGr(String(Math.round(d.avg_dividend_growth * 10000) / 100));
    else setDivGr("5");
    if (d.revenue_growth != null) setG1(String(Math.round(d.revenue_growth * 10000) / 100));
    else setG1("10");
    if (d.total_cash != null) setCash(String(d.total_cash));
    else setCash("0");
    if (d.total_debt != null) setDebt(String(d.total_debt));
    else setDebt("0");
    // EPS as default metric value for multiples
    if (d.eps != null) setMv(d.eps.toFixed(3));
    else setMv("");
    // WACC risk-free rate
    if (d.wacc_risk_free_rate != null) setWaccRf((d.wacc_risk_free_rate * 100).toFixed(2));
    else setWaccRf("");
    // WACC cost of debt
    if (d.wacc_cost_of_debt != null) setWaccKd((d.wacc_cost_of_debt * 100).toFixed(2));
    else setWaccKd("");
    // WACC tax rate
    if (d.wacc_tax_rate != null) setWaccTax((d.wacc_tax_rate * 100).toFixed(2));
    else setWaccTax("");
  }, [defaults.data, latestSharesFromStatements, stockId]);

  // If backend defaults miss Kd/Tax, auto-fill from uploaded statements once.
  useEffect(() => {
    if (waccKd || defaults.data?.wacc_cost_of_debt != null) return;
    if (statementWaccInputs.costOfDebt != null) {
      setWaccKd((statementWaccInputs.costOfDebt * 100).toFixed(2));
    }
  }, [defaults.data?.wacc_cost_of_debt, statementWaccInputs.costOfDebt, waccKd]);

  useEffect(() => {
    if (waccTax || defaults.data?.wacc_tax_rate != null) return;
    if (statementWaccInputs.taxRate != null) {
      setWaccTax((statementWaccInputs.taxRate * 100).toFixed(2));
    }
  }, [defaults.data?.wacc_tax_rate, statementWaccInputs.taxRate, waccTax]);

  // ── Shares: prefer latest TTM/quarterly statement value over annual ──
  useEffect(() => {
    if (latestSharesFromStatements != null) {
      setShares(latestSharesFromStatements.toLocaleString("en-US", { maximumFractionDigits: 0 }));
    }
  }, [latestSharesFromStatements]);

  // ── Override FCF with Unlevered FCF from cash flow statements ──
  // DCF (enterprise value approach) requires UFCF = FCFF, not levered FCF.
  // This runs after defaults populate and overrides with UFCF when available.
  const ufcfPopulated = useRef<number | null>(null);
  useEffect(() => {
    if (ufcfPopulated.current === stockId) return;
    const stmts = stmtQ.data?.statements ?? [];
    if (stmts.length === 0) return;
    const UFCF_CODES = ["UNLEVERED_FREE_CASH_FLOW", "UNLEVERED_FCF"];
    const upperCodes = new Set(UFCF_CODES.map((c) => c.toUpperCase()));
    let best: { year: number; amount: number } | null = null;
    for (const s of stmts) {
      if (s.fiscal_quarter != null) continue;
      if (s.statement_type !== "cashflow") continue;
      for (const li of s.line_items ?? []) {
        if (upperCodes.has(li.line_item_code.toUpperCase()) && li.amount != null) {
          if (!best || s.fiscal_year > best.year) {
            best = { year: s.fiscal_year, amount: li.amount };
          }
        }
      }
    }
    if (best) {
      ufcfPopulated.current = stockId;
      setFcf(best.amount.toLocaleString("en-US", { maximumFractionDigits: 0 }));
    }
  }, [stmtQ.data, stockId]);

  const onSuccess = (result: ValuationRunResult) => {
    setLastResult(result);
    queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] });
  };
  const onError = (err: Error) => showErrorAlert("Valuation Failed", err);

  // ── Mutations ───────────────────────────────────────────────────
  const grahamMut = useMutation({
    mutationFn: () => {
      const cp = parseFloat(currentPrice);
      return runGrahamValuation(stockId, {
        eps: parseFloat(eps),
        growth_rate: parseFloat(grahamGrowth) || 0,
        corporate_yield: parseFloat(corpYield) || 4.4,
        margin_of_safety: parseFloat(marginOfSafety) || 25,
        current_price: !isNaN(cp) && cp > 0 ? cp : null,
      });
    },
    onSuccess, onError,
  });
  const dcfMut = useMutation({
    mutationFn: () => {
      const d = defaults.data;
      const effectiveDr = useWacc && waccComputed
        ? waccComputed.wacc
        : parseFloat(dr) / 100;
      const payload: Parameters<typeof runDCFValuation>[1] = {
        fcf: parseFloat(stripCommas(fcf)), growth_rate_stage1: parseFloat(g1) / 100, growth_rate_stage2: parseFloat(g2) / 100,
        discount_rate: effectiveDr, shares_outstanding: parseFloat(stripCommas(shares)) || 1,
        terminal_growth: parseFloat(tg) / 100 || 0.025,
        stage1_years: parseInt(s1) || 5, stage2_years: parseInt(s2) || 5,
        cash: parseFloat(stripCommas(cash)) || 0, debt: parseFloat(stripCommas(debt)) || 0,
      };
      if (useWacc && waccComputed && d) {
        payload.wacc_used = true;
        payload.wacc_risk_free_rate = waccComputed.rf;
        payload.wacc_beta = d.wacc_beta ?? undefined;
        payload.wacc_equity_risk_premium = d.wacc_equity_risk_premium ?? undefined;
        payload.wacc_cost_of_equity = waccComputed.ke;
        payload.wacc_cost_of_debt = waccComputed.kd;
        payload.wacc_tax_rate = waccComputed.tax;
        payload.wacc_weight_equity = d.wacc_weight_equity ?? undefined;
        payload.wacc_weight_debt = d.wacc_weight_debt ?? undefined;
      }
      return runDCFValuation(stockId, payload);
    },
    onSuccess, onError,
  });
  const ddmMut = useMutation({
    mutationFn: () => runDDMValuation(stockId, {
      last_dividend: parseFloat(div), growth_rate: parseFloat(divGr) / 100, required_return: parseFloat(rr) / 100,
    }),
    onSuccess, onError,
  });
  const multMut = useMutation({
    mutationFn: (params?: { metric_value: number; peer_multiple: number; multiple_type: string }) => {
      const p = params ?? {
        metric_value: parseFloat(stripCommas(mv)),
        peer_multiple: parseFloat(stripCommas(pm)),
        multiple_type: multipleType,
      };
      return runMultiplesValuation(stockId, {
        metric_value: p.metric_value, peer_multiple: p.peer_multiple,
        multiple_type: p.multiple_type,
        shares_outstanding: 1,
      });
    },
    onSuccess, onError,
  });

  // ── Pre-flight validation ───────────────────────────────────────
  const valError = useMemo((): string | null => {
    if (model === "graham") {
      const e = parseFloat(eps);
      if (eps && isNaN(e)) return "EPS must be a valid number.";
      if (eps && e <= 0) return "EPS must be positive for Graham formula.";
    }
    if (model === "dcf") {
      const drN = parseFloat(dr), tgN = parseFloat(tg), sharesN = parseFloat(stripCommas(shares));
      if (fcf && isNaN(parseFloat(stripCommas(fcf)))) return "FCF must be a valid number.";
      if (dr && tg && !isNaN(drN) && !isNaN(tgN) && Math.abs(drN - tgN) < 0.001)
        return "Discount Rate equals Perpetual Growth — causes division by zero.";
      if (dr && !isNaN(drN) && drN <= 0) return "Discount Rate must be positive.";
      if (shares && !isNaN(sharesN) && sharesN <= 0) return "Shares outstanding must be positive.";
      if (dr && tg && !isNaN(drN) && !isNaN(tgN) && tgN >= drN)
        return "Perpetual Growth must be less than Discount Rate for DCF convergence.";
    }
    if (model === "ddm") {
      const rrN = parseFloat(rr), grN = parseFloat(divGr);
      if (div && isNaN(parseFloat(div))) return "Dividend must be a valid number.";
      if (rr && !isNaN(rrN) && rrN <= 0) return "Required Return must be positive.";
      if (rr && divGr && !isNaN(rrN) && !isNaN(grN) && Math.abs(rrN - grN) < 0.001)
        return "Required Return equals Growth Rate — causes division by zero.";
      if (rr && divGr && !isNaN(rrN) && !isNaN(grN) && grN >= rrN)
        return "Growth Rate must be less than Required Return for DDM convergence.";
    }
    if (model === "multiples") {
      const sharesN = parseFloat(stripCommas(shares));
      if (mv && isNaN(parseFloat(stripCommas(mv)))) return "Metric Value must be a valid number.";
      if (pm && isNaN(parseFloat(stripCommas(pm)))) return "Peer Multiple must be a valid number.";
      if (shares && !isNaN(sharesN) && sharesN <= 0) return "Shares must be positive.";
    }
    return null;
  }, [model, eps, fcf, g1, g2, dr, tg, shares, div, divGr, rr, mv, pm]);

  return {
    model, setModel,
    eps, setEps, currentPrice, setCurrentPrice,
    grahamGrowth, setGrahamGrowth, corpYield, setCorpYield, marginOfSafety, setMarginOfSafety,
    fcf, setFcf,
    g1, setG1, g2, setG2, dr, setDr, tg, setTg,
    s1, setS1, s2, setS2,
    shares, setShares, cash, setCash, debt, setDebt,
    div, setDiv, divGr, setDivGr, rr, setRr,
    mv, setMv, pm, setPm, multipleType, setMultipleType,
    useWacc, setUseWacc,
    waccRf, setWaccRf, waccKd, setWaccKd, waccTax, setWaccTax, waccComputed,
    statementWaccInputs,
    grahamMut, dcfMut, ddmMut, multMut,
    valError, lastResult,
    mosGraham, setMosGraham, mosDcf, setMosDcf, mosDdm, setMosDdm, mosMult, setMosMult,
    defaults: defaults.data ?? null,
    defaultsLoading: defaults.isLoading,
  };
}
