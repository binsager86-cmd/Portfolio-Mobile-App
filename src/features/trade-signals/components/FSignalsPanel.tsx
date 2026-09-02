/**
 * F.Signals Panel - multi-signal fundamental tabs.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
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
import { QuarterMovementPanel } from "@/src/features/trade-signals/components/QuarterMovementPanel";
import { WhaleTrackerPanel } from "@/src/features/trade-signals/components/WhaleTrackerPanel";
import {
  createAnalysisStock,
  deleteAnalysisStock,
  getAnalysisStocks,
  getPEQuarterly,
  type AnalysisStock,
  type PEQuarterlyResponse,
  type Quarter,
  type StockListEntry,
} from "@/services/api";

const QUARTERS: readonly Quarter[] = ["q1", "q2", "q3", "q4"] as const;
const Q_LABEL: Record<Quarter, string> = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };
type SignalTabKey = "pe" | "dividendYield" | "whaleTracker" | "quarterMovement";
const US_SUFFIXES = new Set(["US", "USA", "NYSE", "NASDAQ", "AMEX"]);
const KW_SUFFIXES = new Set(["KW", "KSE", "BK"]);

// Local style literals — named per custom-styles/no-hardcoded-styles, which
// forbids raw numeric/hex literals in style properties. This file predates
// the app-wide theme/tokens.ts scale and uses finer-grained values than that
// scale defines, so values are preserved as-is and only extracted into named
// constants (no visual change).
const SPACE_1 = 1;
const SPACE_2 = 2;
const SPACE_3 = 3;
const SPACE_4 = 4;
const SPACE_5 = 5;
const SPACE_6 = 6;
const SPACE_7 = 7;
const SPACE_8 = 8;
const SPACE_9 = 9;
const SPACE_10 = 10;
const SPACE_12 = 12;
const SPACE_14 = 14;
const SPACE_16 = 16;
const SPACE_18 = 18;
const SPACE_24 = 24;
const SPACE_28 = 28;
const SPACE_36 = 36;
const SPACE_80 = 80;
const FONT_10 = 10;
const FONT_11 = 11;
const FONT_12 = 12;
const FONT_13 = 13;
const FONT_14 = 14;
const FONT_15 = 15;
const FONT_16 = 16;
const FONT_18 = 18;
const COLOR_WHITE = "#fff";
const COLOR_DANGER_RED = "#e74c3c";

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

  const needsSelectedStock = signalTab === "pe" || signalTab === "dividendYield" || signalTab === "quarterMovement";

  if (!selected && needsSelectedStock) {
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
      {selected && needsSelectedStock ? (
        <SelectedHeader
          colors={colors}
          stock={selected}
          onChange={() => setSelected(null)}
          allowDelete={signalTab === "quarterMovement"}
          onDeleted={() => setSelected(null)}
        />
      ) : null}

      {signalTab === "pe" && peQuery.isLoading && (        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, marginTop: SPACE_8, fontSize: FONT_13 }}>
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
      {signalTab === "dividendYield" && selected && <DividendYieldContent colors={colors} stock={selected} />}
      {signalTab === "whaleTracker" && <WhaleTrackerPanel colors={colors} selectedStock={selected} />}
      {signalTab === "quarterMovement" && <QuarterMovementPanel colors={colors} selectedStock={selected} />}
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
        <Text style={{ color: active === "pe" ? colors.accentPrimary : colors.textSecondary, fontSize: FONT_12, fontWeight: "700" }}>
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
            fontSize: FONT_12,
            fontWeight: "700",
          }}
        >
          {t("tradeSignals.dividendYieldSignal", "Dividend Yield Signal")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange("whaleTracker")}
        style={[
          styles.signalTab,
          {
            backgroundColor: active === "whaleTracker" ? colors.accentPrimary + "16" : "transparent",
          },
        ]}
      >
        <FontAwesome name="eye" size={12} color={active === "whaleTracker" ? colors.accentPrimary : colors.textMuted} />
        <Text
          style={{
            color: active === "whaleTracker" ? colors.accentPrimary : colors.textSecondary,
            fontSize: FONT_12,
            fontWeight: "700",
          }}
        >
          {t("tradeSignals.whaleTracker", "Whale Tracker")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onChange("quarterMovement")}
        style={[
          styles.signalTab,
          {
            backgroundColor: active === "quarterMovement" ? colors.accentPrimary + "16" : "transparent",
          },
        ]}
      >
        <FontAwesome name="calendar" size={12} color={active === "quarterMovement" ? colors.accentPrimary : colors.textMuted} />
        <Text
          style={{
            color: active === "quarterMovement" ? colors.accentPrimary : colors.textSecondary,
            fontSize: FONT_12,
            fontWeight: "700",
          }}
        >
          {t("tradeSignals.quarterMovement", "Quarter Movement")}
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
    mutationFn: (entry: StockListEntry) =>
      createAnalysisStock({
        symbol: entry.symbol.trim().toUpperCase(),
        company_name: entry.name.trim(),
        exchange: market === "kuwait" ? "KSE" : "US",
        currency: market === "kuwait" ? "KWD" : "USD",
      }),
    onSuccess: async (res, entry) => {
      await queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      onCreated({
        id: res.id,
        user_id: 0,
        symbol: entry.symbol.trim().toUpperCase(),
        company_name: entry.name.trim(),
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
  const handleSubmit = () => {
    if (!selectedEntry || createMut.isPending) return;
    createMut.mutate(selectedEntry);
  };

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
              <Text style={{ color: market === "kuwait" ? colors.accentPrimary : colors.textSecondary, fontSize: FONT_12, fontWeight: "700" }}>
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
              <Text style={{ color: market === "us" ? colors.accentPrimary : colors.textSecondary, fontSize: FONT_12, fontWeight: "700" }}>
                US
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Search & Select Stock</Text>
          <View style={[styles.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, marginBottom: SPACE_8 }]}>
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
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={false}
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
                      <Text style={{ color: colors.textPrimary, fontSize: FONT_12, fontWeight: "700", width: 90 }}>
                        {item.symbol}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: FONT_12, flex: 1 }}>
                        {item.name}
                      </Text>
                      {active && <FontAwesome name="check-circle" size={14} color={colors.accentPrimary} />}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: SPACE_16, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: FONT_12 }}>No stocks found</Text>
                  </View>
                }
              />
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.bgInput }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: FONT_12 }}>
                {t("common.cancel", "Cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={[
                styles.modalBtn,
                { backgroundColor: canSubmit ? colors.accentPrimary : colors.textMuted + "55" },
              ]}
            >
              <Text style={{ color: COLOR_WHITE, fontWeight: "700", fontSize: FONT_12 }}>
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
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState("");

  const marketLabel = (symbol: string) => (symbol.toUpperCase().endsWith(".KW") ? "KSE" : "US");
  const trimmedScanInput = scanInput.trim();
  const canRunScan = trimmedScanInput.length > 0 && !scanLoading;

  const handleScanTicker = async () => {
    const ticker = trimmedScanInput.toUpperCase();
    if (!ticker) return;

    // Infer market from ticker suffix (e.g. KFH.KW → KSE, AAPL.US → USA)
    const dotIdx = ticker.lastIndexOf(".");
    const suffix = dotIdx !== -1 ? ticker.slice(dotIdx + 1) : "";
    let inferredExchange: string;
    let inferredCurrency: string;
    if (US_SUFFIXES.has(suffix)) {
      inferredExchange = "USA";
      inferredCurrency = "USD";
    } else if (KW_SUFFIXES.has(suffix) || suffix === "") {
      // Bare ticker (no suffix) defaults to Kuwait for this app
      inferredExchange = "KSE";
      inferredCurrency = "KWD";
    } else {
      // Unknown suffix — pass it through and let the backend handle it
      inferredExchange = suffix;
      inferredCurrency = "USD";
    }

    setScanLoading(true);
    setScanError("");
    try {
      // Try to create/fetch the stock directly from ticker
      const created = await createAnalysisStock({
        symbol: ticker,
        company_name: ticker,
        exchange: inferredExchange,
        currency: inferredCurrency,
      });
      const stock: AnalysisStock = {
        id: created.id,
        user_id: 0,
        symbol: ticker,
        company_name: ticker,
        exchange: inferredExchange,
        currency: inferredCurrency,
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
      };
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      setScanInput("");
      onSelect(stock);
    } catch (err: unknown) {
      // 409 = stock already exists — fetch it and navigate directly
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        try {
          const result = await getAnalysisStocks({ search: ticker });
          const existing = result.stocks.find(
            (s) => s.symbol.toUpperCase() === ticker
          ) ?? result.stocks[0];
          if (existing) {
            setScanInput("");
            onSelect(existing);
            return;
          }
        } catch {
          // fall through to generic error
        }
      }
      setScanError(
        err instanceof Error
          ? err.message
          : t("tradeSignals.scanError", "Unable to scan ticker. Check symbol format (e.g., NBK, KFH.KW, AAPL)"
        )
      );
    } finally {
      setScanLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.listWrap}>
        {React.isValidElement(topContent) ? (
          <View style={styles.topContentWrap}>{topContent}</View>
        ) : null}

        {/* Quick Scan Section */}
        <View style={[styles.quickScanBox, { backgroundColor: colors.accentPrimary + "10", borderColor: colors.accentPrimary + "40" }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: SPACE_8 }]}>
            {t("tradeSignals.quickScan", "Quick Scan")}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: FONT_12, marginBottom: SPACE_10 }}>
            {t("tradeSignals.scanHint", "Kuwait tickers (bare or .KW), US stocks use .US suffix")}
          </Text>

          <View style={{ flexDirection: "row", gap: SPACE_8 }}>
            <View
              style={[
                styles.scanInputBox,
                { backgroundColor: colors.bgInput, borderColor: colors.borderColor, flex: 1 },
              ]}
            >
              <FontAwesome name="search" size={12} color={colors.textMuted} />
              <TextInput
                value={scanInput}
                onChangeText={setScanInput}
                placeholder={t("tradeSignals.tickerPlaceholder", "NBK, KFH.KW, AAPL.US")}
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={handleScanTicker}
                autoCapitalize="characters"
                editable={!scanLoading}
                style={[styles.scanInput, { color: colors.textPrimary }]}
              />
              {scanInput ? (
                <Pressable onPress={() => setScanInput("")} disabled={scanLoading} hitSlop={8}>
                  <FontAwesome name="times-circle" size={12} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={handleScanTicker}
              disabled={!canRunScan}
              style={[
                styles.scanBtn,
                {
                  backgroundColor: canRunScan
                    ? colors.accentPrimary
                    : colors.textMuted + "40",
                },
              ]}
            >
              {scanLoading ? (
                <ActivityIndicator color="#fff" size={14} />
              ) : (
                <FontAwesome name="arrow-right" size={12} color="#fff" />
              )}
            </Pressable>
          </View>

          {scanError ? (
            <Text style={{ color: COLOR_DANGER_RED, fontSize: FONT_11, marginTop: SPACE_8 }}>
              {"\u26A0"} {scanError}
            </Text>
          ) : null}
        </View>

      <View style={styles.dividerBox}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.borderColor }} />
        <Text style={{ color: colors.textMuted, marginHorizontal: SPACE_8, fontSize: FONT_11 }}>
          {t("common.or", "OR")}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.borderColor }} />
      </View>

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
          <Text style={{ color: colors.textPrimary, fontWeight: "600", marginTop: SPACE_10 }}>
            {t("tradeSignals.noStocks", "No saved companies")}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: FONT_12, marginTop: SPACE_4, textAlign: "center" }}>
            {t("tradeSignals.noStocksHint", "Add companies from the Fundamental Analysis tab first.")}
          </Text>
        </View>
      )}

      {!loading && stocks.length > 0 && (
        <FlatList
          data={stocks}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          removeClippedSubviews={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={[styles.stockRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <View style={[styles.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                <Text style={{ color: colors.accentPrimary, fontWeight: "800", fontSize: FONT_13 }}>
                  {item.symbol.slice(0, 4)}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: SPACE_12 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: FONT_15 }}>
                  {item.symbol}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: FONT_12, marginTop: SPACE_1 }} numberOfLines={1}>
                  {item.company_name}
                </Text>
                <View style={[styles.stockMetaPill, { backgroundColor: colors.bgInput }]}>
                  <Text style={{ color: colors.textMuted, fontSize: FONT_10, fontWeight: "700" }}>{marketLabel(item.symbol)}</Text>
                </View>
              </View>
              <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
      </View>
    </ScrollView>
  );
}

function SelectedHeader({
  colors,
  stock,
  onChange,
  allowDelete,
  onDeleted,
}: {
  colors: ThemePalette;
  stock: AnalysisStock;
  onChange: () => void;
  allowDelete?: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAnalysisStock(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      onDeleted?.();
    },
    onError: (err: Error) => showErrorAlert("Delete Failed", err),
  });

  const handleDelete = () => {
    const message = `Delete ${stock.symbol} and all related data?`;
    if (Platform.OS === "web") {
      if (confirm(message)) deleteMut.mutate(stock.id);
      return;
    }
    Alert.alert("Delete Stock", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(stock.id) },
    ]);
  };

  return (
    <View style={[styles.selectedRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={[styles.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
        <Text style={{ color: colors.accentPrimary, fontWeight: "800", fontSize: FONT_13 }}>{stock.symbol}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: SPACE_12 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: FONT_14 }}>{stock.symbol}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_12 }} numberOfLines={1}>{stock.company_name}</Text>
      </View>
      {allowDelete ? (
        <Pressable
          onPress={handleDelete}
          disabled={deleteMut.isPending}
          style={[styles.changeBtn, { backgroundColor: colors.danger + "12", marginRight: SPACE_8 }]}
        >
          <Text style={{ color: colors.danger, fontSize: FONT_12, fontWeight: "700" }}>
            {deleteMut.isPending ? t("common.deleting", "Deleting...") : t("common.delete", "Delete")}
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onChange} style={[styles.changeBtn, { backgroundColor: colors.accentPrimary + "12" }]}>
        <Text style={{ color: colors.accentPrimary, fontSize: FONT_12, fontWeight: "700" }}>
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
          <Text style={{ color: colors.textMuted, fontSize: FONT_11, fontWeight: "700", letterSpacing: 0.5 }}>
            {t("tradeSignals.verdictTitle", "VERDICT").toUpperCase()}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: FONT_11 }}>
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
          <Text style={{ color: verdictColors.fg, fontWeight: "800", marginLeft: SPACE_8, fontSize: FONT_14 }}>
            {t(`tradeSignals.verdict_${data.verdict.verdict}`, data.verdict.verdict).toUpperCase()}
          </Text>
          {data.verdict.scale > 0 && (
            <Text style={{ color: verdictColors.fg, marginLeft: SPACE_8, fontSize: FONT_12, fontWeight: "600" }}>
              {" · "}{t(`tradeSignals.scale_${data.verdict.scaleLabel}`, data.verdict.scaleLabel).toUpperCase()}
            </Text>
          )}
        </View>

        <ScaleMeter scale={data.verdict.scale} verdict={data.verdict.verdict} colors={colors} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: SPACE_18 }]}>{t("tradeSignals.peTable", "P/E Table")}</Text>
      <QuarterTable
        colors={colors}
        rows={data.years.map((y) => ({ year: y, row: data.pe_table[String(y)] }))}
        averages={data.averages}
        formatter={fmtPe}
        showAverage
      />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: SPACE_18 }]}>{t("tradeSignals.growthTable", "P/E Growth (YoY %)")}</Text>
      <QuarterTable
        colors={colors}
        rows={data.years.map((y) => ({ year: y, row: data.growth_table[String(y)] }))}
        formatter={fmtPct}
        signedColors
      />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: SPACE_18 }]}>{t("tradeSignals.qoqGrowthTable", "P/E Growth (QoQ %)")}</Text>
      <QuarterTable
        colors={colors}
        rows={data.years.map((y) => ({ year: y, row: data.qoq_growth_table[String(y)] }))}
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
      <Text style={{ color: colors.textPrimary, fontWeight: "800", fontSize: FONT_16, marginTop: SPACE_12 }}>
        {t("tradeSignals.dividendYieldSignal", "Dividend Yield Signal")}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: FONT_12, marginTop: SPACE_6, textAlign: "center", maxWidth: 420 }}>
        {t(
          "tradeSignals.dividendYieldDesc",
          "Dividend yield history, trend strength, and valuation bands will be shown here.",
        )}
      </Text>
      <View style={[styles.placeholderTickerPill, { backgroundColor: colors.bgInput }]}>
        <Text style={{ color: colors.textSecondary, fontSize: FONT_11, fontWeight: "700" }}>{stock.symbol}</Text>
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
      <Text style={{ color: colors.danger, marginTop: SPACE_8, fontSize: FONT_13, textAlign: "center" }}>{message}</Text>
      <Pressable onPress={onRetry} style={[styles.retryBtn, { backgroundColor: colors.danger }]}>
        <Text style={{ color: COLOR_WHITE, fontWeight: "700", fontSize: FONT_12 }}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACE_16, paddingBottom: SPACE_80 },
  listWrap: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  topContentWrap: { marginBottom: SPACE_8 },
  signalTabsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACE_4,
    gap: SPACE_4,
    marginBottom: SPACE_12,
  },
  signalTab: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    justifyContent: "center",
    gap: SPACE_6,
    borderRadius: 8,
    paddingHorizontal: SPACE_10,
    paddingVertical: SPACE_8,
  },
  sectionTitle: { fontSize: FONT_14, fontWeight: "700", marginBottom: SPACE_10 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE_10 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE_6,
    paddingHorizontal: SPACE_12,
    paddingVertical: SPACE_7,
    borderRadius: 9,
  },
  addBtnText: { color: COLOR_WHITE, fontSize: FONT_12, fontWeight: "700", flexGrow: 1 },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACE_12,
    paddingVertical: SPACE_10,
    borderRadius: 12,
    borderWidth: 1,
    gap: SPACE_8,
    marginBottom: SPACE_12,
  },
  searchInput: { flex: 1, fontSize: FONT_14, paddingVertical: 0 },

  loadingBox: { paddingVertical: SPACE_36, alignItems: "center" },
  emptyBox: {
    paddingVertical: SPACE_36,
    paddingHorizontal: SPACE_24,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  },

  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACE_14,
    paddingVertical: SPACE_12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACE_8,
  },
  symbolBadge: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stockMetaPill: {
    alignSelf: "flex-start",
    marginTop: SPACE_5,
    paddingHorizontal: SPACE_8,
    paddingVertical: SPACE_3,
    borderRadius: 999,
  },
  selectedRow: { flexDirection: "row", alignItems: "center", padding: SPACE_12, borderRadius: 14, borderWidth: 1, marginBottom: SPACE_14 },
  changeBtn: { paddingHorizontal: SPACE_12, paddingVertical: SPACE_6, borderRadius: 8 },

  placeholderCard: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: SPACE_28,
    paddingHorizontal: SPACE_16,
  },
  placeholderIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTickerPill: {
    marginTop: SPACE_14,
    borderRadius: 999,
    paddingHorizontal: SPACE_10,
    paddingVertical: SPACE_5,
  },

  verdictCard: { borderRadius: 14, borderWidth: 1, padding: SPACE_16, marginBottom: SPACE_6 },
  verdictHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACE_12 },
  verdictRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACE_14 },
  metricCol: { alignItems: "flex-start", flex: 1 },
  metricLabel: { fontSize: FONT_11, fontWeight: "600", letterSpacing: 0.3, marginBottom: SPACE_4 },
  metricValue: { fontSize: FONT_18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  verdictBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: SPACE_12, paddingVertical: SPACE_8, borderRadius: 999 },
  scaleRow: { flexDirection: "row", marginTop: SPACE_12, gap: SPACE_6 },
  scaleDot: { flex: 1, height: 6, borderRadius: 3, borderWidth: 1 },

  table: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  tableRow: { flexDirection: "row", paddingVertical: SPACE_10, paddingHorizontal: SPACE_8, alignItems: "center" },
  thYear: { width: 56, fontSize: FONT_12, fontWeight: "700" },
  thCell: { flex: 1, fontSize: FONT_12, fontWeight: "700", textAlign: "right" },
  tdCell: { flex: 1, fontSize: FONT_13, textAlign: "right", fontVariant: ["tabular-nums"] },

  errorBox: { padding: SPACE_18, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  retryBtn: { marginTop: SPACE_12, paddingHorizontal: SPACE_16, paddingVertical: SPACE_8, borderRadius: 8 },

  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACE_16, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { width: "100%", maxWidth: 440, borderRadius: 14, borderWidth: 1, padding: SPACE_16 },
  modalTitle: { fontSize: FONT_16, fontWeight: "800", marginBottom: SPACE_12 },
  fieldLabel: { fontSize: FONT_12, fontWeight: "600", marginBottom: SPACE_6 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACE_12, paddingVertical: SPACE_10, marginBottom: SPACE_12, fontSize: FONT_14 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACE_8, marginTop: SPACE_2 },
  modalBtn: { paddingHorizontal: SPACE_14, paddingVertical: SPACE_8, borderRadius: 8 },
  marketRow: { flexDirection: "row", gap: SPACE_8, marginBottom: SPACE_10 },
  marketChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: SPACE_10, paddingVertical: SPACE_7 },
  pickerList: { maxHeight: 220, borderWidth: 1, borderRadius: 10, overflow: "hidden", marginBottom: SPACE_12 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: SPACE_8, paddingHorizontal: SPACE_10, paddingVertical: SPACE_9, borderBottomWidth: 1 },

  quickScanBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACE_14,
    marginBottom: SPACE_14,
  },
  scanInputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACE_12,
    gap: SPACE_8,
  },
  scanInput: {
    flex: 1,
    fontSize: FONT_13,
    fontWeight: "600",
    paddingVertical: SPACE_10,
  },
  scanBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dividerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE_8,
    marginVertical: SPACE_14,
  },
});
