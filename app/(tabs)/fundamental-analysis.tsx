/**
 * Fundamental Analysis — stock profiles, financial statements,
 * metrics & ratios, growth analysis, scoring, and valuation models.
 *
 * Premium UI with CFA-grade financial analysis tools.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useAnalysisStocks,
  useStatements,
  useStockMetrics,
  useValuations,
} from "@/hooks/queries";
import { useStockList } from "@/hooks/queries";

import {
  createAnalysisStock,
  updateAnalysisStock,
  deleteAnalysisStock,
  calculateMetrics,
  runGrahamValuation,
  runDCFValuation,
  runDDMValuation,
  runMultiplesValuation,
  updateLineItem,
  fetchStatementsOnline,
  AnalysisStock,
  FinancialStatement,
  StockMetric,
  StockListEntry,
} from "@/services/api";
import type { LatestPreferredStatementPeriod } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { showErrorAlert } from "@/lib/errorHandling";
import { exportCSV, exportExcel, exportPDF, type TableData } from "@/lib/exportAnalysis";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { GrowthPanel as FundamentalGrowthPanel } from "@/src/features/fundamental-analysis/components/GrowthPanel";
import { ScorePanel as FundamentalScorePanel } from "@/src/features/fundamental-analysis/components/ScorePanel";
import { ValuationsPanel as FundamentalValuationsPanel } from "@/src/features/fundamental-analysis/components/ValuationsPanel";
import {
  buildHistoricalMetrics as buildFeatureHistoricalMetrics,
  buildMetricYearLabels as buildFeatureMetricYearLabels,
  enrichMetricsWithFallbacks,
  formatLineItemValue as formatFeatureLineItemValue,
  formatMetricValue as formatFeatureMetricValue,
} from "@/src/features/fundamental-analysis/utils";
import type { ThemePalette } from "@/constants/theme";

/* ────────────────────────────────────────────────────────────────── */
/*  TYPE + CONSTANTS                                                 */
/* ────────────────────────────────────────────────────────────────── */

type SubTab = "stocks" | "statements" | "comparison" | "metrics" | "growth" | "score" | "valuations";

const SUB_TABS: { key: SubTab; label: string; icon: React.ComponentProps<typeof FontAwesome>["name"] }[] = [
  { key: "stocks",      label: "Stocks",      icon: "th-list" },
  { key: "statements",  label: "Statements",  icon: "file-text-o" },
  { key: "comparison",  label: "Compare",     icon: "columns" },
  { key: "metrics",     label: "Metrics",     icon: "bar-chart" },
  { key: "growth",      label: "Growth",      icon: "line-chart" },
  { key: "score",       label: "Score",       icon: "star" },
  { key: "valuations",  label: "Valuations",  icon: "calculator" },
];

const STMNT_TYPES = ["income", "balance", "cashflow", "equity"] as const;
const EXPORT_MENU_WIDTH = 160;
const EXPORT_MENU_OFFSET = 4;
const EXPORT_MENU_MARGIN = 16;
const EXPORT_MENU_FALLBACK_TOP = 60;

const STMNT_META: Record<string, { label: string; icon: React.ComponentProps<typeof FontAwesome>["name"]; color: string }> = {
  income:   { label: "Income",        icon: "money",         color: "#10b981" },
  balance:  { label: "Balance Sheet", icon: "balance-scale",  color: "#6366f1" },
  cashflow: { label: "Cash Flow",     icon: "exchange",      color: "#3b82f6" },
  equity:   { label: "Equity",        icon: "users",         color: "#ec4899" },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ComponentProps<typeof FontAwesome>["name"]; color: string }> = {
  profitability: { label: "Profitability",        icon: "trophy",        color: "#10b981" },
  liquidity:     { label: "Liquidity",            icon: "tint",          color: "#3b82f6" },
  leverage:      { label: "Capital Structure",    icon: "building",      color: "#f59e0b" },
  efficiency:    { label: "Efficiency",           icon: "bolt",          color: "#8b5cf6" },
  valuation:     { label: "Valuation (Per-Share)", icon: "diamond",       color: "#ec4899" },
  cashflow:      { label: "Cash Flow",            icon: "money",         color: "#06b6d4" },
  growth:        { label: "Growth Rates",         icon: "line-chart",    color: "#f97316" },
};

type StatementPeriodView = "annual" | "quarter";
type ComparePeriodView = "annual" | "quarter" | "ttm";

type StatementDisplaySelection = {
  rows: FinancialStatement[];
  ttmPeriodEndDate: string | null;
};

type StatementLineItem = FinancialStatement["line_items"][number];

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

function inferQuarterFromDate(periodEndDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodEndDate.slice(0, 10));
  if (!m) return null;
  const month = Number(m[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return Math.ceil(month / 3);
}

function isAnnualStatement(statement: FinancialStatement): boolean {
  const quarter = normalizeQuarter(statement.fiscal_quarter);
  if (quarter === 4) return true;
  if (quarter != null) return false;
  if (isQuarterlySource(statement.source_file)) return false;
  // Unknown quarter defaults to annual to keep fiscal-year rows visible.
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
  // TTM aggregation is only meaningful for flow statements.
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

function selectStatementsForDisplay(
  statements: FinancialStatement[],
  latestPreferred: LatestPreferredStatementPeriod | null | undefined,
  periodView: StatementPeriodView,
): StatementDisplaySelection {
  if (statements.length === 0) return { rows: statements, ttmPeriodEndDate: null };

  const normalized = statements
    .map((statement) => ({ ...statement, fiscal_quarter: normalizeQuarter(statement.fiscal_quarter) }))
    .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  // Annual rows can be non-December for non-calendar fiscal year-ends.
  const annualHistory = normalized.filter((statement) => isAnnualStatement(statement));
  // Quarter view should keep only quarter cadence rows.
  const quarterlyHistory = normalized.filter((statement) => isQuarterlyStatement(statement));

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
      return { rows: quarterlyHistory, ttmPeriodEndDate: null };
    }
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  const ttmStatement = buildSyntheticTtmStatement(
    latestQuarter,
    annualHistory,
    quarterlyHistory,
  );
  const annualTtmColumn = ttmStatement ?? latestQuarter;

  const combined = [
    ...annualHistory,
    ...(annualTtmColumn ? [annualTtmColumn] : []),
  ].sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

  const deduped = new Map<number, FinancialStatement>();
  for (const statement of combined) {
    deduped.set(statement.id, statement);
  }
  const rows = [...deduped.values()];

  if (rows.length === 0) {
    return { rows: normalized, ttmPeriodEndDate: null };
  }

  return {
    rows,
    ttmPeriodEndDate: annualTtmColumn?.period_end_date ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────── */
/*  REUSABLE MICRO-COMPONENTS                                        */
/* ────────────────────────────────────────────────────────────────── */

/** Pill-shaped filter chip */
function Chip({
  label, active, onPress, colors, icon,
}: { label: string; active: boolean; onPress: () => void; colors: ThemePalette; icon?: React.ComponentProps<typeof FontAwesome>["name"] }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        st.chip,
        {
          backgroundColor: active ? colors.accentPrimary : colors.bgCard,
          borderColor: active ? colors.accentPrimary : colors.borderColor,
        },
      ]}
    >
      {icon && <FontAwesome name={icon} size={11} color={active ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />}
      <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Professional segmented tab bar for statement types */
function StatementTabBar({
  value, onChange, colors, showAll,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  colors: ThemePalette;
  showAll?: boolean;
}) {
  const tabs = useMemo(
    () => showAll
      ? [{ key: undefined as string | undefined, label: "All", icon: "th-list" as const, color: colors.accentPrimary }, ...STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] }))]
      : STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] })),
    [showAll, colors.accentPrimary],
  );

  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: colors.bgPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingHorizontal: 8,
      paddingTop: 4,
    }}>
      {tabs.map((t) => {
        const active = value === t.key;
        const tColor = active ? t.color : colors.textMuted;
        return (
          <Pressable
            key={t.key ?? "_all"}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 4,
              borderBottomWidth: 2.5,
              borderBottomColor: active ? t.color : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: active ? t.color + "18" : "transparent",
              alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <FontAwesome name={t.icon} size={14} color={tColor} />
            </View>
            <Text style={{
              fontSize: 10,
              fontWeight: active ? "800" : "600",
              color: tColor,
              textAlign: "center",
              letterSpacing: 0.2,
            }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Compact export button with dropdown (Excel / CSV / PDF) */
function ExportBar({
  onExport, colors, disabled,
}: { onExport: (fmt: "xlsx" | "csv" | "pdf") => Promise<void>; colors: ThemePalette; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const isMountedRef = useRef(true);
  const off = disabled || busy != null;

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handle = useCallback(async (fmt: "xlsx" | "csv" | "pdf") => {
    setOpen(false);
    setBusy(fmt);
    try { await onExport(fmt); }
    catch (e) { Alert.alert("Export Failed", e instanceof Error ? e.message : "Unknown error"); }
    setBusy(null);
  }, [onExport]);

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, w, h) => {
        if (!isMountedRef.current) return;
        setMenuPos({
          left: Math.max(EXPORT_MENU_MARGIN, x + w - EXPORT_MENU_WIDTH),
          top: y + h + EXPORT_MENU_OFFSET,
        });
        setOpen(true);
      });
      return;
    }
    setOpen(true);
  }, []);

  const items: { fmt: "xlsx" | "csv" | "pdf"; icon: React.ComponentProps<typeof FontAwesome>["name"]; label: string; color: string }[] = [
    { fmt: "xlsx", icon: "file-excel-o", label: "Excel (.xlsx)", color: colors.success },
    { fmt: "csv",  icon: "file-text-o",  label: "CSV (.csv)",    color: colors.accentPrimary },
    { fmt: "pdf",  icon: "file-pdf-o",   label: "PDF (.pdf)",    color: "#ef4444" },
  ];

  const dropdown = (
    <View style={[st.exportDropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      {items.map(({ fmt, icon, label, color }) => (
        <Pressable
          key={fmt}
          accessibilityRole="button"
          accessibilityLabel={`Export as ${label}`}
          onPress={() => handle(fmt)}
          style={({ pressed }) => ([st.exportDropItem, pressed && { backgroundColor: color + "12" }])}
        >
          <FontAwesome name={icon} size={12} color={color} style={{ width: 18, textAlign: "center" }} />
          <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: "600", marginLeft: 8 }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
  const dropdownPositionStyle = menuPos
    ? { position: "absolute" as const, top: menuPos.top, left: menuPos.left }
    : { position: "absolute" as const, top: EXPORT_MENU_FALLBACK_TOP, right: EXPORT_MENU_MARGIN };

  return (
    <View ref={triggerRef} style={{ zIndex: 50 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Export"
        accessibilityState={{ disabled: off, expanded: open, busy: !!busy }}
        onPress={openMenu}
        disabled={off}
        style={({ pressed }) => ([
          st.exportTrigger,
          { borderColor: colors.borderColor, backgroundColor: pressed ? colors.accentPrimary + "12" : "transparent", opacity: off ? 0.4 : 1 },
        ])}
      >
        {busy ? (
          <ActivityIndicator size={11} color={colors.accentPrimary} />
        ) : (
          <>
            <FontAwesome name="download" size={11} color={colors.accentPrimary} />
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accentPrimary, marginLeft: 4 }}>Export</Text>
            <FontAwesome name={open ? "chevron-up" : "chevron-down"} size={7} color={colors.textMuted} style={{ marginLeft: 3 }} />
          </>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View style={dropdownPositionStyle}>
            {dropdown}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Section header with icon + optional badge count */
function SectionHeader({
  title, icon, iconColor, badge, colors, style,
}: { title: string; icon?: React.ComponentProps<typeof FontAwesome>["name"]; iconColor?: string; badge?: number; colors: ThemePalette; style?: any }) {
  return (
    <View style={[st.sectionHeader, style]}>
      {icon && (
        <View style={[st.sectionIcon, { backgroundColor: (iconColor ?? colors.accentPrimary) + "18" }]}>
          <FontAwesome name={icon} size={12} color={iconColor ?? colors.accentPrimary} />
        </View>
      )}
      <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge != null && badge > 0 && (
        <View style={[st.badge, { backgroundColor: colors.accentPrimary + "20" }]}>
          <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

/** Premium card container with shadow */
function Card({ colors, children, style, noPadding }: { colors: ThemePalette; children: React.ReactNode; style?: any; noPadding?: boolean }) {
  return (
    <View style={[
      st.card,
      {
        backgroundColor: colors.bgCard,
        borderColor: colors.borderColor,
        shadowColor: colors.cardShadowColor,
      },
      noPadding && { paddingHorizontal: 0, paddingVertical: 0 },
      style,
    ]}>
      {children}
    </View>
  );
}

/** Labeled text input with floating label effect */
function LabeledInput({
  label, value, onChangeText, colors, keyboardType, placeholder, autoCapitalize, flex,
}: {
  label: string; value: string; onChangeText: (v: string) => void; colors: ThemePalette;
  keyboardType?: "numeric" | "default"; placeholder?: string; autoCapitalize?: "characters" | "none"; flex?: number;
}) {
  return (
    <View style={[{ flex: flex ?? undefined, marginBottom: 10 }]}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <TextInput
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textMuted + "80"}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[st.input, {
          color: colors.textPrimary,
          borderColor: colors.borderColor,
          backgroundColor: colors.bgInput,
        }]}
      />
    </View>
  );
}

/** Action button */
function ActionButton({
  label, onPress, colors, variant = "primary", disabled, loading, icon, flex,
}: {
  label: string; onPress: () => void; colors: ThemePalette;
  variant?: "primary" | "success" | "secondary" | "danger"; disabled?: boolean; loading?: boolean;
  icon?: React.ComponentProps<typeof FontAwesome>["name"]; flex?: number;
}) {
  const bgMap = { primary: colors.accentPrimary, success: colors.success, secondary: colors.bgCard, danger: colors.danger };
  const textMap = { primary: "#fff", success: "#fff", secondary: colors.textPrimary, danger: "#fff" };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[st.actionBtn, {
        backgroundColor: bgMap[variant],
        opacity: disabled ? 0.5 : 1,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: colors.borderColor,
        flex: flex,
      }]}
    >
      {loading ? (
        <Text style={[st.actionBtnText, { color: textMap[variant] }]}>...</Text>
      ) : (
        <>
          {icon && <FontAwesome name={icon} size={13} color={textMap[variant]} style={{ marginRight: 6 }} />}
          <Text style={[st.actionBtnText, { color: textMap[variant] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Animated fade-in wrapper */
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  MAIN SCREEN                                                      */
/* ────────────────────────────────────────────────────────────────── */

export default function FundamentalAnalysisScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<SubTab>("stocks");
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>("");
  const [autoFetch, setAutoFetch] = useState(false);

  const handleSelectStock = useCallback((stock: AnalysisStock) => {
    setAutoFetch(false);
    setSelectedStockId(stock.id);
    setSelectedStockSymbol(stock.symbol);
    setTab("statements");
  }, []);

  const handleSelectNewStock = useCallback((stock: AnalysisStock) => {
    setSelectedStockId(stock.id);
    setSelectedStockSymbol(stock.symbol);
    setTab("statements");
    setAutoFetch(true);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedStockId(null);
    setSelectedStockSymbol("");
    setTab("stocks");
  }, []);

  return (
    <View style={[st.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[st.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={{ flex: 1 }}>
          <View style={[st.rowCenter, { gap: 10 }]}>
            {selectedStockId && (
              <Pressable onPress={handleBack} hitSlop={12} style={st.headerBack}>
                <FontAwesome name="chevron-left" size={14} color={colors.accentPrimary} />
              </Pressable>
            )}
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>
              {selectedStockId ? selectedStockSymbol : "Fundamental Analysis"}
            </Text>
            {selectedStockId && (
              <View style={[st.headerBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                <FontAwesome name="flask" size={10} color={colors.accentPrimary} />
              </View>
            )}
          </View>
          {!selectedStockId && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              CFA-grade stock analysis & valuation
            </Text>
          )}
        </View>
      </View>

      {/* ── Tab row ────────────────────────────────────────── */}
      <View style={[st.tabContainer, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {SUB_TABS.map((t) => {
            const disabled = t.key !== "stocks" && !selectedStockId;
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => !disabled && setTab(t.key)}
                style={[
                  st.tabBtn,
                  active && [st.tabBtnActive, { backgroundColor: colors.accentPrimary + "12" }],
                  disabled && { opacity: 0.35 },
                ]}
              >
                <FontAwesome
                  name={t.icon}
                  size={12}
                  color={active ? colors.accentPrimary : colors.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={{
                  color: active ? colors.accentPrimary : colors.textSecondary,
                  fontWeight: active ? "700" : "500",
                  fontSize: 12,
                }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ────────────────────────────────────────── */}
      {tab === "stocks" && <StocksPanel colors={colors} isDesktop={isDesktop} onSelect={handleSelectStock} onAdd={handleSelectNewStock} />}
      {tab === "statements" && selectedStockId && <StatementsPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} autoFetch={autoFetch} onAutoFetchDone={() => setAutoFetch(false)} />}
      {tab === "comparison" && selectedStockId && <ComparisonPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />}
      {tab === "metrics" && selectedStockId && <MetricsPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />}
      {tab === "growth" && selectedStockId && <FundamentalGrowthPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />}
      {tab === "score" && selectedStockId && <FundamentalScorePanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />}
      {tab === "valuations" && selectedStockId && <FundamentalValuationsPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  STOCKS PANEL                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

function StocksPanel({
  colors, isDesktop, onSelect, onAdd,
}: { colors: ThemePalette; isDesktop: boolean; onSelect: (stock: AnalysisStock) => void; onAdd?: (stock: AnalysisStock) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [showAdd, setShowAdd] = useState(false);
  const [editStock, setEditStock] = useState<AnalysisStock | null>(null);

  const { data, isLoading, refetch, isFetching } = useAnalysisStocks(debouncedSearch);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAnalysisStock(id),
    onSuccess: (_data, deletedId) => {
      // Immediately remove from every cached page of the list so it
      // disappears without waiting for a background refetch.
      queryClient.setQueriesData<{ stocks: AnalysisStock[]; count: number }>(
        { queryKey: ["analysis-stocks"] },
        (old) =>
          old
            ? {
                ...old,
                stocks: old.stocks.filter((s) => s.id !== deletedId),
                count: Math.max(0, (old.count ?? 0) - 1),
              }
            : old,
      );
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
    },
    onError: (err) => showErrorAlert("Delete Failed", err),
  });

  const stocks = data?.stocks ?? [];

  const handleDelete = (stock: AnalysisStock) => {
    const msg = `Delete ${stock.symbol} and all related data?`;
    if (Platform.OS === "web") {
      if (confirm(msg)) deleteMut.mutate(stock.id);
    } else {
      Alert.alert("Delete Stock", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(stock.id) },
      ]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search + Add */}
      <View style={[st.searchRow, { borderBottomColor: colors.borderColor }]}>
        <View style={[st.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={13} color={colors.textMuted} />
          <TextInput
            placeholder="Search by symbol or name..."
            placeholderTextColor={colors.textMuted + "90"}
            value={search}
            onChangeText={setSearch}
            style={[st.searchInput, { color: colors.textPrimary }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <FontAwesome name="times-circle" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: colors.accentPrimary }]}>
          <FontAwesome name="plus" size={12} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", marginLeft: 6 }}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlashList
          data={stocks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={index * 40}>
              <Pressable onPress={() => onSelect(item)}>
                <Card colors={colors} style={st.rowCenter}>
                  {/* Symbol badge */}
                  <View style={[st.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }}>
                      {item.symbol.slice(0, 3)}
                    </Text>
                  </View>
                  {/* Info */}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{item.symbol}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
                      {item.company_name}
                    </Text>
                    <View style={[st.rowCenter, { gap: 6, marginTop: 4 }]}>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{item.exchange}</Text>
                      </View>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{item.currency}</Text>
                      </View>
                      {item.sector && (
                        <View style={[st.tagPill, { backgroundColor: colors.accentPrimary + "10" }]}>
                          <Text style={{ color: colors.accentPrimary, fontSize: 10, fontWeight: "600" }}>{item.sector}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {/* Actions */}
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable onPress={() => setEditStock(item)} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.accentPrimary + "12" }]}>
                        <FontAwesome name="pencil" size={12} color={colors.accentPrimary} />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(item)} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.danger + "12" }]}>
                        <FontAwesome name="trash-o" size={12} color={colors.danger} />
                      </Pressable>
                    </View>
                    <FontAwesome name="chevron-right" size={11} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            </FadeIn>
          )}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: colors.accentPrimary + "10" }]}>
                <FontAwesome name="flask" size={32} color={colors.accentPrimary} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No stocks yet</Text>
              <Text style={[st.emptySubtitle, { color: colors.textMuted, textAlign: "center" }]}>
                Add your first stock profile to begin{"\n"}fundamental analysis
              </Text>
              <Pressable onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: colors.accentPrimary, marginTop: 20, paddingHorizontal: 24 }]}>
                <FontAwesome name="plus" size={12} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", marginLeft: 8 }}>Add Stock</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {showAdd && <StockFormModal colors={colors} onClose={() => setShowAdd(false)} onAdd={onAdd} />}
      {editStock && <StockFormModal stock={editStock} colors={colors} onClose={() => setEditStock(null)} />}
    </View>
  );
}

/* ── Stock Form Modal (unified Add/Edit) ──────────────────────────── */

function StockFormModal({ stock, colors, onClose, onAdd }: { stock?: AnalysisStock; colors: ThemePalette; onClose: () => void; onAdd?: (stock: AnalysisStock) => void }) {
  const isEdit = !!stock;
  const queryClient = useQueryClient();
  const [symbol, setSymbol] = useState(stock?.symbol ?? "");
  const [companyName, setCompanyName] = useState(stock?.company_name ?? "");
  const [exchange, setExchange] = useState(stock?.exchange ?? "KSE");
  const [currency, setCurrency] = useState(stock?.currency ?? "KWD");
  const [sector, setSector] = useState(stock?.sector ?? "");
  const [industry, setIndustry] = useState(stock?.industry ?? "");
  const [outstandingShares, setOutstandingShares] = useState(
    stock?.outstanding_shares != null ? String(stock.outstanding_shares) : ""
  );

  // Stock picker state (Add mode only)
  const [market, setMarket] = useState<"kuwait" | "us">("kuwait");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<StockListEntry | null>(null);

  // Fetch cached stock list
  const stockListQ = useStockList(market, !isEdit);

  const filteredStocks = useMemo(() => {
    const all = stockListQ.data?.stocks ?? [];
    if (!pickerSearch.trim()) return all.slice(0, 50); // show first 50 by default
    const q = pickerSearch.toLowerCase();
    return all.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [stockListQ.data, pickerSearch]);

  const handlePickStock = (entry: StockListEntry) => {
    setSelectedEntry(entry);
    setSymbol(entry.symbol);
    setCompanyName(entry.name);
    setExchange(market === "kuwait" ? "KSE" : "US");
    setCurrency(market === "kuwait" ? "KWD" : "USD");
    setPickerSearch("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateAnalysisStock(stock!.id, {
            company_name: companyName.trim(),
            exchange, currency,
            sector: sector || undefined,
            industry: industry || undefined,
            outstanding_shares: outstandingShares ? parseFloat(outstandingShares) : undefined,
          })
        : createAnalysisStock({
            symbol: symbol.trim().toUpperCase(),
            company_name: companyName.trim(),
            exchange, currency,
            sector: sector || undefined,
          }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      if (!isEdit && onAdd && data && 'id' in data) {
        const now = Math.floor(Date.now() / 1000);
        const newStock: AnalysisStock = {
          id: (data as any).id || 0,
          user_id: 0,
          symbol: (data as any).symbol || "",
          company_name: companyName.trim(),
          exchange, currency,
          sector: sector || null,
          industry: industry || null,
          country: null, isin: null, cik: null,
          description: null, website: null,
          outstanding_shares: outstandingShares ? parseFloat(outstandingShares) : null,
          created_at: now,
          updated_at: now,
        };
        onClose();
        onAdd(newStock);
      } else {
        onClose();
      }
    },
  });

  const canSubmit = companyName.trim().length > 0 && (isEdit || symbol.trim().length > 0);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.modalOverlay} onPress={onClose}>
        <Pressable style={[st.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, maxHeight: "85%" }]} onPress={() => {}}>
          {/* Title row */}
          <View style={[st.rowBetween, { marginBottom: 16 }]}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
              {isEdit ? `Edit ${stock!.symbol}` : "Add Analysis Stock"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={[st.iconBtn, { backgroundColor: colors.bgInput }]}>
              <FontAwesome name="times" size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Stock Picker (Add mode) ── */}
            {!isEdit && !selectedEntry && (
              <View style={{ marginBottom: 14 }}>
                {/* Market toggle */}
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 }}>SELECT MARKET</Text>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  <Chip label="Kuwait (KSE)" active={market === "kuwait"} onPress={() => setMarket("kuwait")} colors={colors} icon="globe" />
                  <Chip label="US Stocks" active={market === "us"} onPress={() => setMarket("us")} colors={colors} icon="usd" />
                </View>

                {/* Search */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>SEARCH & SELECT STOCK *</Text>
                <View style={[st.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, marginBottom: 8 }]}>
                  <FontAwesome name="search" size={12} color={colors.textMuted} />
                  <TextInput
                    placeholder={`Search ${market === "kuwait" ? "KSE" : "US"} stocks by symbol or name...`}
                    placeholderTextColor={colors.textMuted + "80"}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                    autoFocus
                    style={[st.searchInput, { color: colors.textPrimary, fontSize: 13 }]}
                  />
                  {pickerSearch.length > 0 && (
                    <Pressable onPress={() => setPickerSearch("")} hitSlop={8}>
                      <FontAwesome name="times-circle" size={13} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>

                {/* Results */}
                {stockListQ.isLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading stock list...</Text>
                  </View>
                ) : (
                  <View style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 10, overflow: "hidden" }}>
                    <FlatList
                      data={filteredStocks}
                      keyExtractor={(item) => item.symbol}
                      keyboardShouldPersistTaps="handled"
                      initialNumToRender={15}
                      maxToRenderPerBatch={10}
                      renderItem={({ item, index }) => (
                        <Pressable
                          onPress={() => handlePickStock(item)}
                          style={[st.pickerRow, {
                            backgroundColor: index % 2 === 0 ? "transparent" : colors.bgPrimary + "40",
                            borderBottomWidth: 1,
                            borderBottomColor: colors.borderColor + "40",
                          }]}
                        >
                          <View style={[st.pickerSymbolBadge, { backgroundColor: colors.accentPrimary + "12" }]}>
                            <Text style={{ color: colors.accentPrimary, fontSize: 10, fontWeight: "800" }}>
                              {item.symbol.slice(0, 4)}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{item.symbol}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{item.name}</Text>
                          </View>
                          <FontAwesome name="plus-circle" size={16} color={colors.accentPrimary} />
                        </Pressable>
                      )}
                      ListEmptyComponent={
                        <View style={{ padding: 20, alignItems: "center" }}>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {pickerSearch ? "No stocks match your search" : "Type to search"}
                          </Text>
                        </View>
                      }
                    />
                  </View>
                )}

                {/* Count badge */}
                {stockListQ.data && (
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6, textAlign: "right" }}>
                    {stockListQ.data.count} stocks in {market === "kuwait" ? "KSE" : "US"} list
                  </Text>
                )}
              </View>
            )}

            {/* ── Selected stock confirmation (Add mode) ── */}
            {!isEdit && selectedEntry && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 }}>SELECTED STOCK</Text>
                <View style={[st.selectedStockCard, { backgroundColor: colors.accentPrimary + "08", borderColor: colors.accentPrimary + "25" }]}>
                  <View style={[st.symbolBadge, { backgroundColor: colors.accentPrimary + "15", width: 40, height: 40, borderRadius: 12 }]}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "800" }}>
                      {selectedEntry.symbol.slice(0, 3)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{symbol}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{companyName}</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{exchange}</Text>
                      </View>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{currency}</Text>
                      </View>
                    </View>
                  </View>
                  <Pressable onPress={() => { setSelectedEntry(null); setSymbol(""); setCompanyName(""); }} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.bgInput }]}>
                    <FontAwesome name="exchange" size={11} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Editable fields (always show for Edit, show after selection for Add) ── */}
            {(isEdit || selectedEntry) && (
              <>
                {selectedEntry && (
                  <LabeledInput label="COMPANY NAME" value={companyName} onChangeText={setCompanyName} colors={colors} />
                )}
                {isEdit && (
                  <LabeledInput label="COMPANY NAME *" value={companyName} onChangeText={setCompanyName} colors={colors} />
                )}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <LabeledInput label="EXCHANGE" value={exchange} onChangeText={setExchange} colors={colors} flex={1} />
                  <LabeledInput label="CURRENCY" value={currency} onChangeText={setCurrency} colors={colors} flex={1} />
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <LabeledInput label="SECTOR" value={sector} onChangeText={setSector} colors={colors} flex={1} />
                  <LabeledInput label="INDUSTRY" value={industry} onChangeText={setIndustry} colors={colors} flex={1} />
                </View>

                {isEdit && (
                  <LabeledInput label="OUTSTANDING SHARES" value={outstandingShares} onChangeText={setOutstandingShares} colors={colors} keyboardType="numeric" />
                )}
              </>
            )}

            {mutation.isError && (
              <View style={[st.errorBanner, { backgroundColor: colors.danger + "12" }]}>
                <FontAwesome name="exclamation-circle" size={12} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 12, marginLeft: 6, flex: 1 }}>
                  {(mutation.error as any)?.response?.data?.detail ?? "Something went wrong."}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <ActionButton label="Cancel" onPress={onClose} colors={colors} variant="secondary" flex={1} />
              <ActionButton
                label={mutation.isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Stock")}
                onPress={() => mutation.mutate()}
                colors={colors}
                variant="primary"
                disabled={!canSubmit}
                loading={mutation.isPending}
                icon={isEdit ? "check" : "plus"}
                flex={1}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function StatementsPanel({ stockId, colors, isDesktop, autoFetch, onAutoFetchDone }: { stockId: number; colors: ThemePalette; isDesktop: boolean; autoFetch?: boolean; onAutoFetchDone?: () => void }) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string | undefined>("income");
  const [periodView, setPeriodView] = useState<StatementPeriodView>("annual");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  // ── Online fetch state ────────────────────────────────────────────
  const [fetchingOnline, setFetchingOnline] = useState(false);
  const [onlineResult, setOnlineResult] = useState<string | null>(null);

  const handleFetchOnline = useCallback(async () => {
    setFetchingOnline(true);
    setOnlineResult(null);
    try {
      const res = await fetchStatementsOnline(stockId);
      setOnlineResult(res.message);
      queryClient.invalidateQueries({ queryKey: ["analysis-statements"] });
      await refetch();
    } catch (err: unknown) {
      setOnlineResult("Error: " + (err instanceof Error ? err.message : "Failed to fetch statements"));
    } finally {
      setFetchingOnline(false);
      onAutoFetchDone?.();
    }
  }, [stockId, queryClient, refetch, onAutoFetchDone]);

  // Auto-trigger fetch when navigating here from a newly added stock
  useEffect(() => {
    if (autoFetch && !fetchingOnline) {
      handleFetchOnline();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch]);
  const statements = data?.statements ?? [];
  const latestPreferred = data?.latest_preferred ?? null;
  const selection = useMemo(
    () => selectStatementsForDisplay(statements, latestPreferred, periodView),
    [statements, latestPreferred, periodView],
  );

  return (
    <View style={{ flex: 1 }}>
      {/* ── Fetch Section ──────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgCard,
      }}>
        <View style={[st.rowBetween, { gap: 12 }]}> 
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
              Financial Statements
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              Tap Get Statements to fetch the latest data.
            </Text>
          </View>
          <ActionButton
            label={fetchingOnline ? "Fetching..." : "Get Statements"}
            onPress={handleFetchOnline}
            colors={colors}
            variant="secondary"
            icon="globe"
            disabled={fetchingOnline}
            loading={fetchingOnline}
          />
        </View>

        {onlineResult && (() => {
          const isError = onlineResult.startsWith("Error");
          return (
            <View style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: isError ? colors.danger + "15" : colors.success + "15",
            }}>
              <FontAwesome
                name={isError ? "exclamation-circle" : "check-circle"}
                size={13}
                color={isError ? colors.danger : colors.success}
              />
              <Text style={{ flex: 1, fontSize: 11, color: isError ? colors.danger : colors.success }}>
                {onlineResult}
              </Text>
              <Pressable onPress={() => setOnlineResult(null)} hitSlop={8}>
                <FontAwesome name="times" size={12} color={colors.textMuted} />
              </Pressable>
            </View>
          );
        })()}
      </View>

      {/* Period view filter */}
      <View style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgPrimary,
      }}>
        <Chip
          label="Annual + TTM"
          active={periodView === "annual"}
          onPress={() => setPeriodView("annual")}
          colors={colors}
          icon="calendar"
        />
        <Chip
          label="All Quarters"
          active={periodView === "quarter"}
          onPress={() => setPeriodView("quarter")}
          colors={colors}
          icon="bar-chart"
        />
      </View>

      {/* Type filter tabs */}
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} showAll={false} />

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <StatementsTable
          statements={selection.rows}
          colors={colors}
          isDesktop={isDesktop}
          isFetching={isFetching}
          onRefresh={refetch}
          periodView={periodView}
          ttmPeriodEndDate={selection.ttmPeriodEndDate}
        />
      )}
    </View>
  );
}

/** Table view of financial statements — years left-to-right, line items as rows */
function StatementsTable({
  statements, colors, isDesktop, isFetching, onRefresh, periodView = "annual", ttmPeriodEndDate = null,
}: {
  statements: FinancialStatement[];
  colors: ThemePalette;
  isDesktop: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  periodView?: StatementPeriodView;
  ttmPeriodEndDate?: string | null;
}) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null); // "itemId"
  const [editValue, setEditValue] = useState("");

  const updateMut = useMutation({
    mutationFn: ({ itemId, amount }: { itemId: number; amount: number }) => updateLineItem(itemId, amount),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements"] }); setEditingKey(null); },
    onError: (err) => showErrorAlert("Update Failed", err),
  });

  // Build columns (periods sorted by date)
  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((statement) => {
        const q = normalizeQuarter(statement.fiscal_quarter) ?? inferQuarterFromDate(statement.period_end_date);
        const isTtmPeriod = periodView === "annual"
          && ttmPeriodEndDate != null
          && statement.period_end_date === ttmPeriodEndDate
          && q != null;
        return {
        label: isTtmPeriod ? "TTM" : `FY${statement.fiscal_year}${q != null ? ` Q${q}` : ""}`,
        period: statement.period_end_date,
        items: Object.fromEntries(
          (statement.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total, edited: li.manually_edited }])
        ),
      };
      }),
  [statements, periodView, ttmPeriodEndDate]);

  // Build unified row list preserving order from first statement that has each code
  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of statements) {
      for (const li of (s.line_items ?? []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
        if (!seen.has(li.line_item_code)) {
          seen.add(li.line_item_code);
          codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total });
        }
      }
    }
    return codes;
  }, [statements]);

  if (periods.length === 0) {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: colors.accentSecondary + "10" }]}>
          <FontAwesome name="file-text-o" size={32} color={colors.accentSecondary} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No statements</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Tap Get Statements to load available statements.</Text>
      </View>
    );
  }

  const COL_NAME_W = isDesktop ? 200 : 160;
  const COL_VAL_W = isDesktop ? 120 : 105;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 80 }}>
        <View>
          {/* ── Header row ── */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 8,
            borderBottomWidth: 2,
            borderBottomColor: colors.accentPrimary,
            backgroundColor: colors.bgCard,
          }}>
            <Text style={{ width: COL_NAME_W, fontSize: 12, fontWeight: "800", color: colors.textPrimary }} numberOfLines={1}>
              Line Item
            </Text>
            {periods.map((p) => (
              <Text key={p.period} style={{ width: COL_VAL_W, textAlign: "right", fontSize: 12, fontWeight: "800", color: colors.textPrimary }}>
                {p.label}
              </Text>
            ))}
          </View>

          {/* ── Data rows ── */}
          {allCodes.map((item, rowIdx) => (
            <View
              key={item.code}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 8,
                backgroundColor: item.isTotal
                  ? colors.bgInput + "60"
                  : rowIdx % 2 === 0
                  ? "transparent"
                  : colors.bgPrimary + "30",
                borderTopWidth: item.isTotal ? 1 : 0,
                borderTopColor: colors.borderColor,
              }}
            >
              {/* Row label */}
              <Text
                numberOfLines={1}
                style={{
                  width: COL_NAME_W,
                  fontSize: 12,
                  fontWeight: item.isTotal ? "700" : "400",
                  color: item.isTotal ? colors.textPrimary : colors.textSecondary,
                  paddingRight: 8,
                }}
              >
                {item.name}
              </Text>

              {/* Value cells */}
              {periods.map((p) => {
                const cell = p.items[item.code];
                const val = cell?.amount;
                const cellKey = cell ? String(cell.id) : null;
                const isEditing = editingKey != null && cellKey === editingKey;

                return (
                  <View key={p.period} style={{ width: COL_VAL_W, alignItems: "flex-end", justifyContent: "center" }}>
                    {isEditing ? (
                      <View style={[st.rowCenter, { gap: 3 }]}>
                        <TextInput
                          value={editValue}
                          onChangeText={setEditValue}
                          keyboardType="numeric"
                          autoFocus
                          style={{
                            width: COL_VAL_W - 40,
                            height: 26,
                            borderWidth: 1,
                            borderRadius: 6,
                            borderColor: colors.accentPrimary,
                            color: colors.textPrimary,
                            backgroundColor: colors.bgCard,
                            fontSize: 11,
                            paddingHorizontal: 6,
                            textAlign: "right",
                            fontVariant: ["tabular-nums"],
                          }}
                          onSubmitEditing={() => {
                            const num = parseFloat(editValue);
                            if (!isNaN(num) && cellKey) updateMut.mutate({ itemId: parseInt(cellKey), amount: num });
                          }}
                        />
                        <Pressable onPress={() => { const n = parseFloat(editValue); if (!isNaN(n) && cellKey) updateMut.mutate({ itemId: parseInt(cellKey), amount: n }); }} hitSlop={6}>
                          <FontAwesome name="check" size={12} color={colors.success} />
                        </Pressable>
                        <Pressable onPress={() => setEditingKey(null)} hitSlop={6}>
                          <FontAwesome name="times" size={12} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          if (cellKey) { setEditingKey(cellKey); setEditValue(String(val)); }
                        }}
                        style={st.rowCenter}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontWeight: item.isTotal ? "700" : "500",
                          color: val != null && val < 0 ? colors.danger : (item.isTotal ? colors.textPrimary : colors.textSecondary),
                          fontVariant: ["tabular-nums"],
                          textAlign: "right",
                        }}>
                          {val != null ? formatFeatureLineItemValue(item.name, val) : "-"}
                        </Text>
                        {cell?.edited && (
                          <FontAwesome name="pencil" size={8} color={colors.accentPrimary} style={{ marginLeft: 3, opacity: 0.6 }} />
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  COMPARISON PANEL — Multi-Period Side-by-Side                      */
/* ═══════════════════════════════════════════════════════════════════ */

function ComparisonPanel({ stockId, stockSymbol, colors, isDesktop: _isDesktop }: { stockId: number; stockSymbol: string; colors: ThemePalette; isDesktop: boolean }) {
  const [typeFilter, setTypeFilter] = useState<string>("income");
  const [periodView, setPeriodView] = useState<ComparePeriodView>("ttm");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  const statements = data?.statements ?? [];
  const latestPreferred = data?.latest_preferred ?? null;

  const comparisonSelection = useMemo<StatementDisplaySelection>(() => {
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
    const annualTtmColumn = ttmStatement ?? latestQuarter;

    const combined = [
      ...annualHistory,
      ...(annualTtmColumn ? [annualTtmColumn] : []),
    ].sort((a, b) => a.period_end_date.localeCompare(b.period_end_date));

    const deduped = new Map<string, FinancialStatement>();
    for (const statement of combined) {
      deduped.set(statement.period_end_date, statement);
    }
    const rows = [...deduped.values()];

    if (rows.length === 0) return { rows: normalized, ttmPeriodEndDate: null };

    return {
      rows,
      ttmPeriodEndDate: annualTtmColumn?.period_end_date ?? null,
    };
  }, [statements, latestPreferred, periodView]);

  const comparisonStatements = comparisonSelection.rows;
  const ttmPeriodEndDate = comparisonSelection.ttmPeriodEndDate;

  const periods = useMemo(() =>
    [...comparisonStatements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((st) => {
        const q = normalizeQuarter(st.fiscal_quarter);
        const isTtmPeriod = periodView === "ttm"
          && ttmPeriodEndDate != null
          && st.period_end_date === ttmPeriodEndDate
          && q != null;
        const label = isTtmPeriod
          ? "TTM"
          : periodView === "quarter"
            ? `FY${st.fiscal_year}${q != null ? ` Q${q}` : ""}`
            : `FY${st.fiscal_year}`;
        return {
        label,
        period: st.period_end_date,
        items: Object.fromEntries(
          (st.line_items ?? []).map((li) => [li.line_item_code, { amount: li.amount, name: li.line_item_name, isTotal: li.is_total }])
        ),
      };
      }),
  [comparisonStatements, periodView, ttmPeriodEndDate]);

  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of comparisonStatements) {
      for (const li of s.line_items ?? []) {
        if (!seen.has(li.line_item_code)) { seen.add(li.line_item_code); codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total }); }
      }
    }
    return codes;
  }, [comparisonStatements]);

  const exportTables = useCallback((): TableData[] => {
    const headers = ["Line Item"];
    for (let i = 0; i < periods.length; i++) {
      headers.push(periods[i].label);
      if (i > 0) headers.push("YoY %");
    }
    const rows = allCodes.map((item) => {
      const row: (string | number | null)[] = [item.name];
      for (let i = 0; i < periods.length; i++) {
        const val = periods[i].items[item.code]?.amount;
        row.push(val != null ? val : null);
        if (i > 0) {
          const prevVal = periods[i - 1].items[item.code]?.amount;
          const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
          row.push(yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : null);
        }
      }
      return row;
    });
    const typeName = STMNT_META[typeFilter]?.label ?? typeFilter;
    return [{ title: `${typeName} — Period Comparison`, headers, rows }];
  }, [periods, allCodes, typeFilter]);

  return (
    <View style={{ flex: 1 }}>
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} />
      <View style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgPrimary,
      }}>
        <Chip
          label="Annual"
          active={periodView === "annual"}
          onPress={() => setPeriodView("annual")}
          colors={colors}
          icon="calendar"
        />
        <Chip
          label="All Quarters"
          active={periodView === "quarter"}
          onPress={() => setPeriodView("quarter")}
          colors={colors}
          icon="bar-chart"
        />
        <Chip
          label="Annual + TTM"
          active={periodView === "ttm"}
          onPress={() => setPeriodView("ttm")}
          colors={colors}
          icon="line-chart"
        />
      </View>

      {isLoading ? (
        <LoadingScreen />
      ) : periods.length < 2 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="columns" size={32} color={colors.warning} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Need 2+ periods</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Use Get Statements to load multiple periods for this view.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}>
          <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Comparison");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Comparison");
                else await exportPDF(t, stockSymbol, "Comparison");
              }}
              colors={colors}
              disabled={periods.length < 2}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 80 }}>
            <View>
              {/* Header row */}
              <View style={[st.compHeaderRow, { borderBottomColor: colors.borderColor }]}>
                <Text style={[st.compCellName, { color: colors.textPrimary, fontWeight: "800" }]}>Line Item</Text>
                {periods.map((p, i) => (
                  <React.Fragment key={p.period}>
                    <Text style={[st.compCellVal, { color: colors.textPrimary, fontWeight: "800" }]}>{p.label}</Text>
                    {i > 0 && <Text style={[st.compCellYoy, { color: colors.accentPrimary, fontWeight: "700" }]}>YoY %</Text>}
                  </React.Fragment>
                ))}
              </View>

              {/* Data rows */}
              {allCodes.map((item, rowIdx) => {
                const isTotal = item.isTotal;
                return (
                  <View
                    key={item.code}
                    style={[
                      st.compRow,
                      { backgroundColor: isTotal ? colors.bgInput + "50" : (rowIdx % 2 === 0 ? "transparent" : colors.bgPrimary + "30") },
                      isTotal && { borderTopWidth: 1, borderTopColor: colors.borderColor },
                    ]}
                  >
                    <Text numberOfLines={1} style={[st.compCellName, { color: isTotal ? colors.textPrimary : colors.textSecondary, fontWeight: isTotal ? "700" : "400" }]}>
                      {item.name}
                    </Text>
                    {periods.map((p, i) => {
                      const val = p.items[item.code]?.amount;
                      const prevVal = i > 0 ? periods[i - 1].items[item.code]?.amount : undefined;
                      const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
                      return (
                        <React.Fragment key={p.period}>
                          <Text style={[st.compCellVal, {
                            color: val != null && val < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
                            fontWeight: isTotal ? "700" : "500",
                          }]}>
                            {val != null ? formatFeatureLineItemValue(item.name, val) : "–"}
                          </Text>
                          {i > 0 && (
                            <Text style={[st.compCellYoy, {
                              color: yoy == null ? colors.textMuted : yoy >= 0 ? colors.success : colors.danger,
                              fontWeight: "600",
                            }]}>
                              {yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : "–"}
                            </Text>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  METRICS PANEL                                                     */
/* ═══════════════════════════════════════════════════════════════════ */

function MetricsPanel({ stockId, stockSymbol, colors, isDesktop }: { stockId: number; stockSymbol: string; colors: ThemePalette; isDesktop: boolean }) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"historical" | "grouped">("historical");
  const [calcAllRunning, setCalcAllRunning] = useState(false);

  const stmtQ = useStatements(stockId);
  const periods = useMemo(() => {
    const seen = new Set<string>();
    return (stmtQ.data?.statements ?? [])
      .filter((s) => { if (seen.has(s.period_end_date)) return false; seen.add(s.period_end_date); return true; })
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({ period_end_date: s.period_end_date, fiscal_year: s.fiscal_year, fiscal_quarter: s.fiscal_quarter }));
  }, [stmtQ.data]);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useStockMetrics(stockId);

  const calcMut = useMutation({
    mutationFn: (p: { period_end_date: string; fiscal_year: number; fiscal_quarter?: number }) => calculateMetrics(stockId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] }),
  });

  const handleCalculateAll = async () => {
    if (periods.length === 0) return;
    setCalcAllRunning(true);
    for (const p of periods) {
      try {
        await calculateMetrics(stockId, { period_end_date: p.period_end_date, fiscal_year: p.fiscal_year, fiscal_quarter: p.fiscal_quarter ?? undefined });
      } catch (err: unknown) {
        if (__DEV__) console.warn("calculateMetrics failed for period", p.period_end_date, err);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] });
    setCalcAllRunning(false);
  };

  const statements = stmtQ.data?.statements ?? [];
  const allMetrics = useMemo(
    () => enrichMetricsWithFallbacks(data?.metrics ?? [], statements),
    [data?.metrics, statements],
  );
  const grouped = useMemo(() => {
    const next: Record<string, StockMetric[]> = {};
    for (const metric of allMetrics) {
      if (!next[metric.metric_type]) next[metric.metric_type] = [];
      next[metric.metric_type].push(metric);
    }
    return next;
  }, [allMetrics]);
  const categories = Object.keys(grouped);
  const historicalCategories = useMemo(() => buildFeatureHistoricalMetrics(allMetrics, statements), [allMetrics, statements]);
  const metricYearLabels = useMemo(() => {
    const years = [...new Set(allMetrics.map((m) => m.fiscal_year))].sort((a, b) => a - b);
    return buildFeatureMetricYearLabels(years, statements);
  }, [allMetrics, statements]);
  const periodChipLabels = useMemo(() => {
    const latestPeriodByYear = new Map<number, string>();
    for (const p of periods) {
      const current = latestPeriodByYear.get(p.fiscal_year);
      if (!current || p.period_end_date > current) {
        latestPeriodByYear.set(p.fiscal_year, p.period_end_date);
      }
    }

    const labels: Record<string, string> = {};
    for (const p of periods) {
      const q = normalizeQuarter(p.fiscal_quarter);
      const yearLabel = metricYearLabels[p.fiscal_year] ?? `FY${p.fiscal_year}`;
      const isTtmYear = yearLabel.startsWith("TTM ");
      const isLatestInYear = latestPeriodByYear.get(p.fiscal_year) === p.period_end_date;
      labels[p.period_end_date] = isTtmYear && isLatestInYear
        ? yearLabel
        : `FY${p.fiscal_year}${q != null ? ` Q${q}` : ""}`;
    }
    return labels;
  }, [periods, metricYearLabels]);

  const exportTables = useCallback((): TableData[] => {
    return Object.entries(historicalCategories).map(([cat, { metricNames, yearData, years }]) => {
      const catLabel = CATEGORY_LABELS[cat]?.label ?? cat;
      return {
        title: catLabel,
        headers: ["Metric", ...years.map((yr) => metricYearLabels[yr] ?? `FY${yr}`)],
        rows: metricNames.map((name) => [
          name,
          ...years.map((yr) => {
            const val = yearData[yr]?.[name];
            return val != null ? formatFeatureMetricValue(name, val) : null;
          }),
        ]),
      };
    });
  }, [historicalCategories, metricYearLabels]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {/* Calculate section */}
      <FadeIn>
        <Card colors={colors} style={{ marginBottom: 16 }}>
          <SectionHeader title="Calculate Metrics" icon="cogs" iconColor={colors.accentSecondary} colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 }}>
            Select a period or calculate all at once from retrieved statements.
          </Text>

          {periods.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {periods.map((p) => (
                <Chip
                  key={p.period_end_date}
                  label={periodChipLabels[p.period_end_date] ?? `FY${p.fiscal_year}`}
                  active={selectedPeriod === p.period_end_date}
                  onPress={() => setSelectedPeriod(p.period_end_date)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton
              label={calcMut.isPending ? "Calculating..." : "Calculate Selected"}
              onPress={() => {
                const p = periods.find((x) => x.period_end_date === selectedPeriod);
                if (p) calcMut.mutate({ period_end_date: p.period_end_date, fiscal_year: p.fiscal_year, fiscal_quarter: p.fiscal_quarter ?? undefined });
              }}
              colors={colors}
              variant="primary"
              disabled={!selectedPeriod}
              loading={calcMut.isPending}
              icon="calculator"
              flex={1}
            />
            <ActionButton
              label={calcAllRunning ? "Running..." : "Calculate All"}
              onPress={handleCalculateAll}
              colors={colors}
              variant="success"
              disabled={periods.length === 0}
              loading={calcAllRunning}
              icon="refresh"
              flex={1}
            />
          </View>
        </Card>
      </FadeIn>

      {isLoading ? (
        <LoadingScreen />
      ) : categories.length === 0 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.accentPrimary + "10" }]}>
            <FontAwesome name="bar-chart" size={32} color={colors.accentPrimary} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No metrics yet</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted, textAlign: "center" }]}>
            Get statements and calculate metrics above.
          </Text>
        </View>
      ) : (
        <>
          {/* View toggle */}
          <View style={{ flexDirection: "row", marginBottom: 14, gap: 8, alignItems: "center" }}>
            <Chip label="Historical Table" active={viewMode === "historical"} onPress={() => setViewMode("historical")} colors={colors} icon="table" />
            <Chip label="Grouped List" active={viewMode === "grouped"} onPress={() => setViewMode("grouped")} colors={colors} icon="list-ul" />
            <View style={{ flex: 1 }} />
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Metrics");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Metrics");
                else await exportPDF(t, stockSymbol, "Metrics");
              }}
              colors={colors}
            />
          </View>

          {viewMode === "historical" ? (
            Object.entries(historicalCategories).map(([cat, { metricNames, yearData, years }], idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 60}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} badge={metricNames.length} colors={colors} />
                  <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: 16 }}>
                    <Card colors={colors} noPadding>
                      {/* Header */}
                      <View style={[st.metricTableHeader, { borderBottomColor: colors.borderColor }]}>
                        <Text style={[st.metricTableNameCell, { color: colors.textPrimary, fontWeight: "800" }]}>Metric</Text>
                        {years.map((yr) => (
                          <Text key={yr} style={[st.metricTableValCell, { color: colors.textPrimary, fontWeight: "800" }]}>{metricYearLabels[yr] ?? `FY${yr}`}</Text>
                        ))}
                      </View>
                      {/* Rows */}
                      {metricNames.map((name, ri) => (
                        <View key={name} style={[st.metricTableRow, { backgroundColor: ri % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
                          <Text numberOfLines={1} style={[st.metricTableNameCell, { color: colors.textSecondary }]}>{name}</Text>
                          {years.map((yr) => {
                            const val = yearData[yr]?.[name];
                            return (
                              <Text key={yr} style={[st.metricTableValCell, {
                                color: val != null ? colors.textPrimary : colors.textMuted,
                                fontWeight: val != null ? "600" : "400",
                              }]}>
                                {val != null ? formatFeatureMetricValue(name, val) : "–"}
                              </Text>
                            );
                          })}
                        </View>
                      ))}
                    </Card>
                  </ScrollView>
                </FadeIn>
              );
            })
          ) : (
            categories.map((cat, idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 50}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} colors={colors} />
                  <Card colors={colors} style={{ marginBottom: 14 }}>
                    {grouped[cat].map((m: StockMetric, mi: number) => (
                      <View key={m.id} style={[st.metricRow, mi < grouped[cat].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40" }]}>
                        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>{m.metric_name}</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                          {formatFeatureMetricValue(m.metric_name, m.metric_value)}
                        </Text>
                        <View style={[st.tagPill, { backgroundColor: colors.bgInput, marginLeft: 8 }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: "600" }}>{m.period_end_date}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  VALUATIONS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function ValuationsPanel({ stockId, stockSymbol, colors, isDesktop }: { stockId: number; stockSymbol: string; colors: ThemePalette; isDesktop: boolean }) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<"graham" | "dcf" | "ddm" | "multiples">("graham");

  const [eps, setEps] = useState("");
  const [bvps, setBvps] = useState("");
  const [fcf, setFcf] = useState("");
  const [g1, setG1] = useState("0.10");
  const [g2, setG2] = useState("0.05");
  const [dr, setDr] = useState("0.10");
  const [shares, setShares] = useState("1");
  const [div, setDiv] = useState("");
  const [divGr, setDivGr] = useState("0.05");
  const [rr, setRr] = useState("0.10");
  const [mv, setMv] = useState("");
  const [pm, setPm] = useState("");

  const { data, isLoading, refetch, isFetching } = useValuations(stockId);

  const grahamMut = useMutation({
    mutationFn: () => runGrahamValuation(
      stockId,
      ({ eps: parseFloat(eps), book_value_per_share: parseFloat(bvps) } as unknown) as Parameters<typeof runGrahamValuation>[1],
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const dcfMut = useMutation({
    mutationFn: () => runDCFValuation(stockId, {
      fcf: parseFloat(fcf), growth_rate_stage1: parseFloat(g1), growth_rate_stage2: parseFloat(g2),
      discount_rate: parseFloat(dr), shares_outstanding: parseFloat(shares) || 1,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const ddmMut = useMutation({
    mutationFn: () => runDDMValuation(stockId, { last_dividend: parseFloat(div), growth_rate: parseFloat(divGr), required_return: parseFloat(rr) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const multMut = useMutation({
    mutationFn: () => runMultiplesValuation(stockId, { metric_value: parseFloat(mv), peer_multiple: parseFloat(pm), shares_outstanding: parseFloat(shares) || 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });

  const valuations = data?.valuations ?? [];

  const exportTables = useCallback((): TableData[] => {
    if (valuations.length === 0) return [];
    return [{
      title: "Valuation History",
      headers: ["Model", "Date", "Intrinsic Value", "Parameters"],
      rows: valuations.map((v) => [
        v.model_type.toUpperCase(),
        v.valuation_date,
        v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A",
        v.parameters ? Object.entries(v.parameters).map(([k, val]) => `${k}: ${typeof val === "number" ? val.toFixed(4) : val}`).join("; ") : "",
      ]),
    }];
  }, [valuations]);

  const MODEL_INFO: Record<string, { title: string; formula: string; icon: React.ComponentProps<typeof FontAwesome>["name"] }> = {
    graham:    { title: "Graham Number", formula: "V = √(22.5 × EPS × BVPS)", icon: "university" },
    dcf:       { title: "Two-Stage DCF", formula: "Gordon Growth Terminal Value", icon: "sitemap" },
    ddm:       { title: "Dividend Discount", formula: "Gordon Growth Model", icon: "money" },
    multiples: { title: "Comparable Multiples", formula: "e.g., P/E × EPS", icon: "balance-scale" },
  };

  const info = MODEL_INFO[model];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      <FadeIn>
        <SectionHeader title="Run Valuation" icon="calculator" iconColor={colors.accentTertiary} colors={colors} />

        {/* Model selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(["graham", "dcf", "ddm", "multiples"] as const).map((m) => (
            <Chip key={m} label={m === "multiples" ? "MULTIPLES" : m.toUpperCase()} active={model === m} onPress={() => setModel(m)} colors={colors}
              icon={MODEL_INFO[m].icon} />
          ))}
        </ScrollView>

        <Card colors={colors}>
          {/* Model header */}
          <View style={[st.rowCenter, { marginBottom: 12 }]}>
            <View style={[st.sectionIcon, { backgroundColor: colors.accentTertiary + "18" }]}>
              <FontAwesome name={info.icon} size={12} color={colors.accentTertiary} />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{info.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{info.formula}</Text>
            </View>
          </View>

          {model === "graham" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="EPS" value={eps} onChangeText={setEps} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="BOOK VALUE / SHARE" value={bvps} onChangeText={setBvps} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={grahamMut.isPending ? "Calculating..." : "Calculate Graham"} onPress={() => grahamMut.mutate()}
                colors={colors} disabled={!eps || !bvps} loading={grahamMut.isPending} icon="play" />
            </>
          )}

          {model === "dcf" && (
            <>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <LabeledInput label="FCF" value={fcf} onChangeText={setFcf} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 1 GROWTH" value={g1} onChangeText={setG1} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 2 GROWTH" value={g2} onChangeText={setG2} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="DISCOUNT RATE" value={dr} onChangeText={setDr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={dcfMut.isPending ? "Calculating..." : "Calculate DCF"} onPress={() => dcfMut.mutate()}
                colors={colors} disabled={!fcf} loading={dcfMut.isPending} icon="play" />
            </>
          )}

          {model === "ddm" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="LAST DIVIDEND" value={div} onChangeText={setDiv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="GROWTH RATE" value={divGr} onChangeText={setDivGr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="REQ. RETURN" value={rr} onChangeText={setRr} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={ddmMut.isPending ? "Calculating..." : "Calculate DDM"} onPress={() => ddmMut.mutate()}
                colors={colors} disabled={!div} loading={ddmMut.isPending} icon="play" />
            </>
          )}

          {model === "multiples" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="METRIC VALUE" value={mv} onChangeText={setMv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="PEER MULTIPLE" value={pm} onChangeText={setPm} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={multMut.isPending ? "Calculating..." : "Calculate Multiples"} onPress={() => multMut.mutate()}
                colors={colors} disabled={!mv || !pm} loading={multMut.isPending} icon="play" />
            </>
          )}
        </Card>
      </FadeIn>

      {/* Valuation history */}
      {valuations.length > 0 && (
        <FadeIn delay={100}>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
            <View style={{ flex: 1 }}>
              <SectionHeader title="Valuation History" icon="history" iconColor={colors.accentSecondary} badge={valuations.length} colors={colors} />
            </View>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Valuations");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Valuations");
                else await exportPDF(t, stockSymbol, "Valuations");
              }}
              colors={colors}
            />
          </View>

          {valuations.map((v, idx) => (
            <FadeIn key={v.id} delay={idx * 40}>
              <Card colors={colors} style={{ marginBottom: 10 }}>
                <View style={st.rowCenter}>
                  {/* Model icon */}
                  <View style={[st.sectionIcon, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <FontAwesome name={MODEL_INFO[v.model_type]?.icon ?? "calculator"} size={12} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{v.model_type}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{v.valuation_date}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{
                      color: v.intrinsic_value != null ? colors.accentPrimary : colors.textMuted,
                      fontSize: 20,
                      fontWeight: "800",
                      fontVariant: ["tabular-nums"],
                    }}>
                      {v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Intrinsic Value</Text>
                  </View>
                </View>

                {v.parameters && Object.keys(v.parameters).length > 0 && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8 }}>
                    {Object.entries(v.parameters).map(([k, val]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                          {typeof val === "number" ? val.toFixed(4) : String(val)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </FadeIn>
          ))}
        </FadeIn>
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  STYLES                                                            */
/* ═══════════════════════════════════════════════════════════════════ */

const st = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Tabs */
  tabContainer: { borderBottomWidth: 1 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 8,
    marginVertical: 4,
  },
  tabBtnActive: {
    borderRadius: 8,
  },

  /* Search */
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },

  /* Chips */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },

  /* Cards */
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },

  /* Stock list */
  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 80 },
  symbolBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Sections */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  /* Statements */
  stmtHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stmtIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    width: 90,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  /* Comparison */
  compHeaderRow: {
    flexDirection: "row",
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 2,
  },
  compRow: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  compCellName: { width: 170, fontSize: 12, paddingRight: 8 },
  compCellVal: { width: 100, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },
  compCellYoy: { width: 72, textAlign: "right", fontSize: 11, fontVariant: ["tabular-nums"] },

  /* Metrics */
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  metricTableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  metricTableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  metricTableNameCell: { width: 150, fontSize: 12 },
  metricTableValCell: { width: 90, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },

  /* Growth */
  growthRow: { paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  growthBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  growthBarFill: { height: 6, borderRadius: 3, borderWidth: 1 },

  /* Score */
  scoreRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreRingInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreNum: { fontSize: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreBarTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  scoreBarFill: { height: 8, borderRadius: 4 },
  scoreHistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scoreHistCell: { fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] },

  /* Empty states */
  empty: { alignItems: "center", paddingVertical: 60, gap: 4 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "92%",
    maxWidth: 460,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },

  /* Form */
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  exportTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  exportOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingTop: 32,
    zIndex: 99,
  },
  exportDropdown: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    minWidth: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  exportDropItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },

  /* Stock picker */
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerSymbolBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedStockCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  /* Reusable layout */
  rowCenter: { flexDirection: "row" as const, alignItems: "center" as const },
  rowBetween: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },

  /* Empty-state typography */
  emptyTitle: { fontSize: 16, fontWeight: "700" as const, marginTop: 16 },
  emptySubtitle: { fontSize: 13, marginTop: 4 },

  /* Field label */
  fieldLabel: { fontSize: 11, fontWeight: "600" as const, marginBottom: 4, letterSpacing: 0.5 },
});
