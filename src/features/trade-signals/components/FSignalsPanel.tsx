/**
 * F.Signals Panel - multi-signal fundamental tabs.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useAnalysisStocks, useStockList } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { showErrorAlert } from "@/lib/errorHandling";
import {
  createAnalysisStock,
  getPEQuarterly,
  type AnalysisStock,
  type PEQuarterlyResponse,
  type Quarter,
  type StockListEntry,
} from "@/services/api";

const QUARTERS: readonly Quarter[] = ["q1", "q2", "q3", "q4"] as const;
const Q_LABEL: Record<Quarter, string> = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };
type SignalTabKey = "pe" | "dividendYield";

const fmtPe = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? "-" : v.toFixed(2);

const fmtPct = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
};

export function FSignalsPanel({ colors }: { colors: ThemePalette }) {
  const { t } = useTranslation();
  const [signalTab, setSignalTab] = useState<SignalTabKey>("pe");
  const [selected, setSelected] = useState<AnalysisStock | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const debounced = useDebouncedValue(search);

  const { data: stocksData, isLoading: stocksLoading } = useAnalysisStocks(debounced);
  const stocks = stocksData?.stocks ?? [];

  const peQuery = useQuery({
    queryKey: ["trade-signals", "pe-quarterly", selected?.id],
    queryFn: () => getPEQuarterly(selected!.id),
    enabled: !!selected?.id && signalTab === "pe",
    staleTime: 60_000,
  });

  if (!selected) {
    return (
      <>
        <StockPicker
          colors={colors}
          stocks={stocks}
          loading={stocksLoading}
          search={search}
          onSearch={setSearch}
          onSelect={setSelected}
          onAdd={() => setShowAdd(true)}
          topContent={
            <SignalTabBar
              colors={colors}
              active={signalTab}
              onChange={setSignalTab}
            />
          }
        />
        {showAdd && (
          <AddStockModal
            colors={colors}
            onClose={() => setShowAdd(false)}
            onCreated={(stock) => {
              setShowAdd(false);
              setSelected(stock);
            }}
          />
        )}
      </>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SignalTabBar
        colors={colors}
        active={signalTab}
        onChange={setSignalTab}
      />
      <SelectedHeader colors={colors} stock={selected} onChange={() => setSelected(null)} />

      {signalTab === "pe" && peQuery.isLoading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>
            {t("tradeSignals.loadingPe", "Loading P/E history...")}
          </Text>
        </View>
      )}

      {signalTab === "pe" && peQuery.isError && (
        <ErrorBox
          colors={colors}
          message={t(
            "tradeSignals.peError",
            "Could not load P/E data. The data source may be temporarily unavailable.",
          )}
          onRetry={() => peQuery.refetch()}
        />
      )}

      {signalTab === "pe" && peQuery.data && <PEContent colors={colors} data={peQuery.data} />}
      {signalTab === "dividendYield" && <DividendYieldContent colors={colors} stock={selected} />}
    </ScrollView>
  );
}

function SignalTabBar({
  colors,
  active,
  onChange,
}: {
  colors: ThemePalette;
  active: SignalTabKey;
  onChange: (tab: SignalTabKey) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={[styles.signalTabsWrap, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
      <Pressable
        onPress={() => onChange("pe")}
        style={[
          styles.signalTab,
          {
            backgroundColor: active === "pe" ? colors.accentPrimary + "16" : "transparent",
          },
        ]}
      >
        <FontAwesome name="line-chart" size={12} color={active === "pe" ? colors.accentPrimary : colors.textMuted} />
        <Text style={{ color: active === "pe" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
          {t("tradeSignals.peSignal", "P/E Signal")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange("dividendYield")}
        style={[
          styles.signalTab,
          {
            backgroundColor: active === "dividendYield" ? colors.accentPrimary + "16" : "transparent",
          },
        ]}
      >
        <FontAwesome name="money" size={12} color={active === "dividendYield" ? colors.accentPrimary : colors.textMuted} />
        <Text
          style={{
            color: active === "dividendYield" ? colors.accentPrimary : colors.textSecondary,
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {t("tradeSignals.dividendYieldSignal", "Dividend Yield Signal")}
        </Text>
      </Pressable>
    </View>
  );
}

function AddStockModal({
  colors,
  onClose,
  onCreated,
}: {
  colors: ThemePalette;
  onClose: () => void;
  onCreated: (stock: AnalysisStock) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [market, setMarket] = useState<"kuwait" | "us">("kuwait");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<StockListEntry | null>(null);

  const stockListQ = useStockList(market, true);

  const filteredStocks = useMemo(() => {
    const all = stockListQ.data?.stocks ?? [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return all.slice(0, 60);
    return all
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [stockListQ.data, pickerSearch]);

  const createMut = useMutation({
    mutationFn: () =>
      createAnalysisStock({
        symbol: selectedEntry!.symbol.trim().toUpperCase(),
        company_name: selectedEntry!.name.trim(),
        exchange: market === "kuwait" ? "KSE" : "US",
        currency: market === "kuwait" ? "KWD" : "USD",
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      onCreated({
        id: res.id,
        user_id: 0,
        symbol: selectedEntry!.symbol.trim().toUpperCase(),
        company_name: selectedEntry!.name.trim(),
        exchange: market === "kuwait" ? "KSE" : "US",
        currency: market === "kuwait" ? "KWD" : "USD",
        sector: null,
        industry: null,
        country: null,
        isin: null,
        cik: null,
        description: null,
        website: null,
        outstanding_shares: null,
        created_at: 0,
        updated_at: 0,
      });
    },
    onError: (err: Error) => showErrorAlert("Could not add company", err),
  });

  const canSubmit = !!selectedEntry && !createMut.isPending;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} style={{ flex: 1, justifyContent: "center" }}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
            {t("tradeSignals.addCompany", "Add Company")}
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Market</Text>
          <View style={styles.marketRow}>
            <Pressable
              onPress={() => {
                setMarket("kuwait");
                setSelectedEntry(null);
                setPickerSearch("");
              }}
              style={[
                styles.marketChip,
                {
                  backgroundColor: market === "kuwait" ? colors.accentPrimary + "20" : colors.bgInput,
                  borderColor: market === "kuwait" ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text style={{ color: market === "kuwait" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
                Kuwait (KSE)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMarket("us");
                setSelectedEntry(null);
                setPickerSearch("");
              }}
              style={[
                styles.marketChip,
                {
                  backgroundColor: market === "us" ? colors.accentPrimary + "20" : colors.bgInput,
                  borderColor: market === "us" ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text style={{ color: market === "us" ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
                US
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Search & Select Stock</Text>
          <View style={[styles.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, marginBottom: 8 }]}>
            <FontAwesome name="search" size={12} color={colors.textMuted} />
            <TextInput
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder={market === "kuwait" ? "Search Kuwait stocks..." : "Search US stocks..."}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {pickerSearch.length > 0 && (
              <Pressable onPress={() => setPickerSearch("")} hitSlop={8}>
                <FontAwesome name="times-circle" size={13} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {stockListQ.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          ) : (
            <View style={[styles.pickerList, { borderColor: colors.borderColor }]}>
              <FlatList
                data={filteredStocks}
                keyExtractor={(item) => item.symbol}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => {
                  const active = selectedEntry?.symbol === item.symbol;
                  return (
                    <Pressable
                      onPress={() => setSelectedEntry(item)}
                      style={[
                        styles.pickerRow,
                        {
                          backgroundColor: active
                            ? colors.accentPrimary + "14"
                            : index % 2 === 0
                              ? "transparent"
                              : colors.bgPrimary + "25",
                          borderBottomColor: colors.borderColor + "44",
                        },
                      ]}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", width: 90 }}>
                        {item.symbol}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                        {item.name}
                      </Text>
                      {active && <FontAwesome name="check-circle" size={14} color={colors.accentPrimary} />}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 16, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>No stocks found</Text>
                  </View>
                }
              />
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.bgInput }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 12 }}>
                {t("common.cancel", "Cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => canSubmit && createMut.mutate()}
              style={[
                styles.modalBtn,
                { backgroundColor: canSubmit ? colors.accentPrimary : colors.textMuted + "55" },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                {createMut.isPending ? t("tradeSignals.adding", "Adding...") : t("tradeSignals.add", "Add")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StockPicker({
  colors,
  stocks,
  loading,
  search,
  onSearch,
  onSelect,
  onAdd,
  topContent,
}: {
  colors: ThemePalette;
  stocks: AnalysisStock[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  onSelect: (s: AnalysisStock) => void;
  onAdd: () => void;
  topContent?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const marketLabel = (symbol: string) => (symbol.toUpperCase().endsWith(".KW") ? "KSE" : "US");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.listWrap}>
      {topContent}
      <View style={styles.pickerHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
          {t("tradeSignals.pickStock", "Choose a company")}
        </Text>
        <Pressable onPress={onAdd} style={[styles.addBtn, { backgroundColor: colors.accentPrimary }]}>
          <FontAwesome name="plus" size={11} color="#fff" />
          <Text style={styles.addBtnText}>{t("tradeSignals.add", "Add")}</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.searchBox,
          { backgroundColor: colors.bgInput, borderColor: colors.borderColor },
        ]}
      >
        <FontAwesome name="search" size={13} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder={t("tradeSignals.searchPlaceholder", "Search saved companies...")}
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accentPrimary} />
        </View>
      )}

      {!loading && stocks.length === 0 && (
        <View style={[styles.emptyBox, { borderColor: colors.borderColor }]}>
          <FontAwesome name="inbox" size={28} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, fontWeight: "600", marginTop: 10 }}>
            {t("tradeSignals.noStocks", "No saved companies")}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" }}>
            {t("tradeSignals.noStocksHint", "Add companies from the Fundamental Analysis tab first.")}
          </Text>
        </View>
      )}

      {!loading &&
        stocks.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onSelect(s)}
            style={[styles.stockRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
          >
            <View style={[styles.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
              <Text style={{ color: colors.accentPrimary, fontWeight: "800", fontSize: 13 }}>
                {s.symbol.slice(0, 4)}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}>
                {s.symbol}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                {s.company_name}
              </Text>
              <View style={[styles.stockMetaPill, { backgroundColor: colors.bgInput }]}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>{marketLabel(s.symbol)}</Text>
              </View>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function SelectedHeader({
  colors,
  stock,
  onChange,
}: {
  colors: ThemePalette;
  stock: AnalysisStock;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.selectedRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={[styles.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
        <Text style={{ color: colors.accentPrimary, fontWeight: "800", fontSize: 13 }}>{stock.symbol}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 14 }}>{stock.symbol}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{stock.company_name}</Text>
      </View>
      <Pressable onPress={onChange} style={[styles.changeBtn, { backgroundColor: colors.accentPrimary + "12" }]}>
        <Text style={{ color: colors.accentPrimary, fontSize: 12, fontWeight: "700" }}>
          {t("tradeSignals.change", "Change")}
        </Text>
      </Pressable>
    </View>
  );
}

function PEContent({ colors, data }: { colors: ThemePalette; data: PEQuarterlyResponse }) {
  const { t } = useTranslation();

  const verdictColors = useMemo(() => {
    switch (data.verdict.verdict) {
      case "overvalued":
        return { bg: colors.danger + "15", fg: colors.danger, icon: "arrow-up" as const };
      case "undervalued":
        return { bg: colors.success + "15", fg: colors.success, icon: "arrow-down" as const };
      case "fair":
        return { bg: colors.accentPrimary + "15", fg: colors.accentPrimary, icon: "check" as const };
      default:
        return { bg: colors.bgInput, fg: colors.textMuted, icon: "question" as const };
    }
  }, [colors, data.verdict.verdict]);

  return (
    <>
      <View style={[styles.verdictCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={styles.verdictHeader}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
            {t("tradeSignals.verdictTitle", "VERDICT").toUpperCase()}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {t("tradeSignals.source", "Source")}: {data.source}
          </Text>
        </View>

        <View style={styles.verdictRow}>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t("tradeSignals.currentPe", "Current P/E")}</Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{fmtPe(data.current_pe)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
              {t("tradeSignals.avgFor", "Avg {{q}}", { q: Q_LABEL[data.current_quarter] })}
            </Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{fmtPe(data.compare_quarter_avg)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t("tradeSignals.diff", "Difference")}</Text>
            <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{fmtPct(data.verdict.diffPct)}</Text>
          </View>
        </View>

        <View style={[styles.verdictBadge, { backgroundColor: verdictColors.bg }]}>
          <FontAwesome name={verdictColors.icon} size={14} color={verdictColors.fg} />
          <Text style={{ color: verdictColors.fg, fontWeight: "800", marginLeft: 8, fontSize: 14 }}>
            {t(`tradeSignals.verdict_${data.verdict.verdict}`, data.verdict.verdict).toUpperCase()}
          </Text>
          {data.verdict.scale > 0 && (
            <Text style={{ color: verdictColors.fg, marginLeft: 8, fontSize: 12, fontWeight: "600" }}>
              {" · "}{t(`tradeSignals.scale_${data.verdict.scaleLabel}`, data.verdict.scaleLabel).toUpperCase()}
            </Text>
          )}
        </View>

        <ScaleMeter scale={data.verdict.scale} verdict={data.verdict.verdict} colors={colors} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 18 }]}>{t("tradeSignals.peTable", "P/E Table")}</Text>
      <QuarterTable
        colors={colors}
        rows={data.years.map((y) => ({ year: y, row: data.pe_table[String(y)] }))}
        averages={data.averages}
        formatter={fmtPe}
        showAverage
      />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 18 }]}>{t("tradeSignals.growthTable", "P/E Growth (YoY %)")}</Text>
      <QuarterTable
        colors={colors}
        rows={data.years.map((y) => ({ year: y, row: data.growth_table[String(y)] }))}
        formatter={fmtPct}
        signedColors
      />
    </>
  );
}

function DividendYieldContent({ colors, stock }: { colors: ThemePalette; stock: AnalysisStock }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.placeholderCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={[styles.placeholderIconWrap, { backgroundColor: colors.accentPrimary + "14" }]}>
        <FontAwesome name="money" size={20} color={colors.accentPrimary} />
      </View>
      <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: 16, marginTop: 12 }}>
        {t("tradeSignals.dividendYieldSignal", "Dividend Yield Signal")}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: "center", maxWidth: 420 }}>
        {t(
          "tradeSignals.dividendYieldDesc",
          "Dividend yield history, trend strength, and valuation bands will be shown here.",
        )}
      </Text>
      <View style={[styles.placeholderTickerPill, { backgroundColor: colors.bgInput }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>{stock.symbol}</Text>
      </View>
    </View>
  );
}

function ScaleMeter({
  scale,
  verdict,
  colors,
}: {
  scale: 0 | 1 | 2 | 3 | 4;
  verdict: PEQuarterlyResponse["verdict"]["verdict"];
  colors: ThemePalette;
}) {
  const fg = verdict === "overvalued" ? colors.danger : verdict === "undervalued" ? colors.success : colors.accentPrimary;
  return (
    <View style={styles.scaleRow}>
      {[1, 2, 3, 4].map((lvl) => (
        <View
          key={lvl}
          style={[
            styles.scaleDot,
            { backgroundColor: lvl <= scale ? fg : colors.bgInput, borderColor: colors.borderColor },
          ]}
        />
      ))}
    </View>
  );
}

function QuarterTable({
  colors,
  rows,
  averages,
  formatter,
  showAverage,
  signedColors,
}: {
  colors: ThemePalette;
  rows: { year: number; row: Record<Quarter, number | null> | undefined }[];
  averages?: Record<Quarter, number | null>;
  formatter: (v: number | null | undefined) => string;
  showAverage?: boolean;
  signedColors?: boolean;
}) {
  const { t } = useTranslation();

  const colorFor = (v: number | null | undefined): string | undefined => {
    if (!signedColors || v == null) return undefined;
    if (v > 0) return colors.success;
    if (v < 0) return colors.danger;
    return undefined;
  };

  return (
    <View style={[styles.table, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
      <View style={[styles.tableRow, { backgroundColor: colors.bgInput }]}>
        <Text style={[styles.thYear, { color: colors.textMuted }]}>{t("tradeSignals.year", "Year")}</Text>
        {QUARTERS.map((q) => (
          <Text key={q} style={[styles.thCell, { color: colors.textMuted }]}>{Q_LABEL[q]}</Text>
        ))}
      </View>

      {rows.map(({ year, row }, idx) => (
        <View
          key={year}
          style={[
            styles.tableRow,
            idx < rows.length - 1 && { borderBottomColor: colors.borderColor, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[styles.thYear, { color: colors.textPrimary, fontWeight: "700" }]}>{year}</Text>
          {QUARTERS.map((q) => {
            const v = row?.[q] ?? null;
            return <Text key={q} style={[styles.tdCell, { color: colorFor(v) ?? colors.textPrimary }]}>{formatter(v)}</Text>;
          })}
        </View>
      ))}

      {showAverage && averages && (
        <View
          style={[
            styles.tableRow,
            { backgroundColor: colors.accentPrimary + "08", borderTopColor: colors.borderColor, borderTopWidth: 1 },
          ]}
        >
          <Text style={[styles.thYear, { color: colors.accentPrimary, fontWeight: "800" }]}>{t("tradeSignals.average", "Avg")}</Text>
          {QUARTERS.map((q) => (
            <Text key={q} style={[styles.tdCell, { color: colors.accentPrimary, fontWeight: "700" }]}>{formatter(averages[q])}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function ErrorBox({
  colors,
  message,
  onRetry,
}: {
  colors: ThemePalette;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={[styles.errorBox, { borderColor: colors.danger + "40", backgroundColor: colors.danger + "10" }]}>
      <FontAwesome name="exclamation-triangle" size={20} color={colors.danger} />
      <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13, textAlign: "center" }}>{message}</Text>
      <Pressable onPress={onRetry} style={[styles.retryBtn, { backgroundColor: colors.danger }]}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 80 },
  listWrap: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  signalTabsWrap: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  signalTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },

  loadingBox: { paddingVertical: 36, alignItems: "center" },
  emptyBox: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  },

  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  symbolBadge: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stockMetaPill: {
    alignSelf: "flex-start",
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  selectedRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  changeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },

  placeholderCard: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  placeholderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTickerPill: {
    marginTop: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  verdictCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 6 },
  verdictHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  verdictRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metricCol: { alignItems: "flex-start", flex: 1 },
  metricLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  verdictBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  scaleRow: { flexDirection: "row", marginTop: 12, gap: 6 },
  scaleDot: { flex: 1, height: 6, borderRadius: 3, borderWidth: 1 },

  table: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  tableRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" },
  thYear: { width: 56, fontSize: 12, fontWeight: "700" },
  thCell: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  tdCell: { flex: 1, fontSize: 13, textAlign: "right", fontVariant: ["tabular-nums"] },

  errorBox: { padding: 18, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },

  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 14, borderWidth: 1, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, fontSize: 14 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 2 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  marketRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  marketChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  pickerList: { maxHeight: 220, borderWidth: 1, borderRadius: 10, overflow: "hidden", marginBottom: 12 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1 },
});
