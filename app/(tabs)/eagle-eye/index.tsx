/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Scanner screen
 *
 * Shows all scored stocks sorted by confidence descending.
 * Supports filtering by min confidence, BUY+, and EARLY_BREAKOUT stage.
 * Sortable by confidence or R:R ratio.
 */

import { getRegimeColors, getStageColors } from "@/constants/eagleEyeColors";
import { EE, REGIME_LABELS, getStageLabelShort } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { EagleEyeTopTabs } from "@/components/eagle-eye/EagleEyeTopTabs";
import {
  STOCK_TABLE_COL_WIDTHS,
  StockRow,
  StockRowSkeleton,
  computeRR,
} from "@/components/eagle-eye/StockRow";
import { MLDisclaimerBanner } from "@/components/eagle-eye/MLDisclaimerBanner";
import { useEagleEyeRefresh, useEagleEyeRegime, useEagleEyeScanner, useMLBands, useMLDisplayState, type RatedStock } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useIsFocused } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Filter / sort types ──────────────────────────────────────────────────────
const CONFIDENCE_STEPS = [0, 40, 60, 75] as const;
const HIGH_VOLUME_RVOL_THRESHOLD = 1.5;
const STAGE_FILTER_ORDER = [
  "DORMANT",
  "STEALTH_ACCUMULATION",
  "EARLY_BREAKOUT",
  "MARKUP_TRENDING",
  "ACCELERATION_CLIMAX",
  "DISTRIBUTION_TOPPING",
  "MARKDOWN_DECLINE",
  "CAPITULATION_EXHAUSTION",
] as const;
type SortField = "conf" | "rr";
type SortDir = "asc" | "desc";
type StageFilter = (typeof STAGE_FILTER_ORDER)[number];

function getUpdatedAgo(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function EagleEyeScannerScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const isTableView = Platform.OS === "web";
  const rowHeight = isTableView ? 54 : 72;

  const [minConfidence, setMinConfidence] = useState(0);
  const [search, setSearch] = useState("");
  const [buyRatingOnly, setBuyRatingOnly] = useState(false);
  const [sellRatingOnly, setSellRatingOnly] = useState(false);
  const [highVolumeOnly, setHighVolumeOnly] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("conf");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Lazy load: don't fetch until the user actually taps into this tab
  const [hasFocusedOnce, setHasFocusedOnce] = useState(isFocused);
  useEffect(() => {
    if (isFocused) {
      setHasFocusedOnce(true);
    }
  }, [isFocused]);
  const fetchEnabled = hasFocusedOnce || isFocused;

  // No min_confidence sent to the server — full universe fetched once and
  // cached for 10 min.  Confidence filtering happens in the useMemo below
  // so chip presses are instant with no extra network calls.
  const { data, isLoading, isRefetching, refetch, isError, dataUpdatedAt } =
    useEagleEyeScanner(undefined, fetchEnabled);

  const regimeEnabled = fetchEnabled && !!data && !isLoading && !isError;
  const { data: regimeData } = useEagleEyeRegime(regimeEnabled);
  const { data: mlBandsData } = useMLBands(fetchEnabled);
  const { data: mlDisplayState } = useMLDisplayState(fetchEnabled);
  const eeRefresh = useEagleEyeRefresh();
  const [runStatus, setRunStatus] = useState<"idle" | "ok" | "err">("idle");
  const runStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRunEagleEye = useCallback(async () => {
    if (eeRefresh.isPending) return;
    if (runStatusTimer.current) clearTimeout(runStatusTimer.current);
    setRunStatus("idle");
    try {
      await eeRefresh.mutateAsync({ tickers: [] });
      setRunStatus("ok");
    } catch {
      setRunStatus("err");
    }
    runStatusTimer.current = setTimeout(() => setRunStatus("idle"), 5000);
  }, [eeRefresh]);

  const stocks: RatedStock[] = useMemo(() => {
    // Build ML band lookup map (ticker → band item)
    const mlMap: Record<string, { band: string | null; color: string | null; emoji: string | null; short_label: string | null; as_of?: string | null }> = {};
    if (mlBandsData?.enabled && mlBandsData.bands) {
      for (const b of mlBandsData.bands) {
        if (b.ticker) {
          mlMap[b.ticker] = b;
        }
      }
    }

    let list = (data?.stocks ?? []).map((s) => ({
      ...s,
      ml_band: mlMap[s.ticker] ?? null,
    }));
    // Confidence filter — client-side so chip changes never trigger a new API call
    if (minConfidence > 0) {
      list = list.filter((s) => s.confidence >= minConfidence);
    }
    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.ticker.toUpperCase().includes(q) || s.name_en.toUpperCase().includes(q)
      );
    }
    if (buyRatingOnly) {
      list = list.filter(
        (s) => s.rating === "BUY" || s.rating === "STRONG_BUY"
      );
    }
    if (sellRatingOnly) {
      list = list.filter(
        (s) => s.rating === "SELL" || s.rating === "STRONG_SELL"
      );
    }
    if (highVolumeOnly) {
      list = list.filter((s) => {
        const vc = s.volume_context;
        return !!vc && vc.is_volume_confirmed && vc.relative_volume >= HIGH_VOLUME_RVOL_THRESHOLD;
      });
    }
    if (stageFilter) {
      list = list.filter((s) => s.stage === stageFilter);
    }
    // sort
    list = [...list].sort((a, b) => {
      let diff: number;
      if (sortBy === "conf") {
        diff = b.confidence - a.confidence;
      } else {
        const rrA = computeRR(a) ?? -Infinity;
        const rrB = computeRR(b) ?? -Infinity;
        diff = rrB - rrA;
      }
      return sortDir === "asc" ? -diff : diff;
    });
    return list;
  }, [
    data,
    minConfidence,
    search,
    buyRatingOnly,
    sellRatingOnly,
    highVolumeOnly,
    stageFilter,
    sortBy,
    sortDir,
    mlBandsData,
  ]);

  const onRefresh = useCallback(() => refetch(), [refetch]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(field);
        setSortDir("desc");
      }
    },
    [sortBy]
  );

  const regime = regimeData?.regime ?? "";
  const regimeColors = getRegimeColors(regime, colors);
  const regimeLabel = REGIME_LABELS[regime] ?? regime;
  const updatedAgo = getUpdatedAgo(dataUpdatedAt ?? 0);

  const renderItem = useCallback(
    ({ item, index }: { item: RatedStock; index: number }) => (
      <StockRow
        item={item}
        isFirst={index === 0}
        variant={isTableView ? "table" : "default"}
      />
    ),
    [isTableView]
  );
  const keyExtractor = useCallback((item: RatedStock) => item.ticker, []);

  const isWarmingUp = data?.status === "warming_up";

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <>
          {Array.from({ length: 10 }).map((_, i) => (
            <StockRowSkeleton
              key={i}
              variant={isTableView ? "table" : "default"}
            />
          ))}
        </>
      );
    }
    if (isWarmingUp) {
      return (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={[styles.emptyText, { color: colors.textPrimary, marginTop: 16 }]}>
            {EE.warmingUp}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 8, fontSize: 13 }]}>
            {EE.warmingUpSub}
          </Text>
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.centred}>
          <FontAwesome name="exclamation-triangle" size={28} color={colors.danger} />
          <Text style={[styles.emptyText, { color: colors.textMuted, marginTop: 12 }]}>
            {EE.errorLoading}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={[styles.retryText, { color: colors.bgPrimary }]}>{EE.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.centred}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{EE.noStocks}</Text>
      </View>
    );
  };

  const renderFilterChips = () => (
    <>
      {CONFIDENCE_STEPS.map((step) => {
        const active = minConfidence === step;
        return (
          <Pressable
            key={step}
            onPress={() => setMinConfidence(step)}
            style={[
              styles.filterChip,
              {
                backgroundColor: active ? colors.accentPrimary : colors.bgCard,
                borderColor: active ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: active ? colors.bgPrimary : colors.textPrimary },
              ]}
            >
              {step === 0 ? "All" : `${step}%+`}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => {
          setBuyRatingOnly((v) => !v);
          setSellRatingOnly(false);
        }}
        style={[
          styles.filterChip,
          {
            backgroundColor: buyRatingOnly ? colors.success : colors.bgCard,
            borderColor: buyRatingOnly ? colors.success : colors.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: buyRatingOnly ? colors.bgPrimary : colors.textPrimary },
          ]}
        >
          BUY RATING
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setSellRatingOnly((v) => !v);
          setBuyRatingOnly(false);
        }}
        style={[
          styles.filterChip,
          {
            backgroundColor: sellRatingOnly ? colors.danger : colors.bgCard,
            borderColor: sellRatingOnly ? colors.danger : colors.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: sellRatingOnly ? colors.bgPrimary : colors.textPrimary },
          ]}
        >
          SELL RATING
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setHighVolumeOnly((v) => !v)}
        style={[
          styles.filterChip,
          {
            backgroundColor: highVolumeOnly ? colors.accentSecondary : colors.bgCard,
            borderColor: highVolumeOnly ? colors.accentSecondary : colors.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: highVolumeOnly ? colors.bgPrimary : colors.textPrimary },
          ]}
        >
          HIGH VOL
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setStageFilter(null)}
        style={[
          styles.filterChip,
          {
            backgroundColor: stageFilter == null ? colors.accentPrimary : colors.bgCard,
            borderColor: stageFilter == null ? colors.accentPrimary : colors.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.filterChipText,
            { color: stageFilter == null ? colors.bgPrimary : colors.textPrimary },
          ]}
        >
          ALL STAGES
        </Text>
      </Pressable>

      {STAGE_FILTER_ORDER.map((stage) => {
        const active = stageFilter === stage;
        const stageColors = getStageColors(stage, colors);

        return (
          <Pressable
            key={stage}
            onPress={() =>
              setStageFilter((prev) => (prev === stage ? null : stage))
            }
            style={[
              styles.filterChip,
              {
                backgroundColor: stageColors.bg,
                borderColor: stageColors.dot,
                borderWidth: active ? 1.5 : 1.25,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: stageColors.text },
              ]}
            >
              {getStageLabelShort(stage)}
            </Text>
          </Pressable>
        );
      })}
    </>
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bgPrimary, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {EE.screenTitle}
            </Text>
            {updatedAgo ? (
              <Text style={[styles.updatedText, { color: colors.textMuted }]}>
                {`Updated ${updatedAgo}`}
              </Text>
            ) : (
              <Text style={[styles.updatedText, { color: colors.textMuted }]}>
                {EE.screenSubtitle}
              </Text>
            )}
          </View>

          <View style={styles.headerRight}>
            {regime ? (
              <View
                style={[
                  styles.regimeBadge,
                  { backgroundColor: regimeColors.bg, borderColor: regimeColors.border },
                ]}
              >
                <Text style={[styles.regimeText, { color: regimeColors.text }]}>
                  {regimeLabel}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.countBadge, { color: colors.textMuted }]}>
              {stocks.length} stocks
            </Text>

            <Pressable
              onPress={handleRunEagleEye}
              disabled={eeRefresh.isPending}
              style={[
                styles.eeRunBtn,
                {
                  backgroundColor:
                    runStatus === "ok"
                      ? colors.success
                      : runStatus === "err"
                      ? colors.danger
                      : colors.accentPrimary,
                  opacity: eeRefresh.isPending ? 0.6 : 1,
                },
              ]}
            >
              {eeRefresh.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.eeRunBtnText}>
                  {runStatus === "ok"
                    ? "\u2713 Running..."
                    : runStatus === "err"
                    ? "\u2717 Failed"
                    : "\u25b6 Run"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <EagleEyeTopTabs />

      {/* ML Experimental Disclaimer Banner */}
      {mlBandsData?.enabled ? (
        <MLDisclaimerBanner
          autoDisabled={mlDisplayState?.auto_disabled ?? false}
          disabledReason={mlDisplayState?.disabled_reason}
        />
      ) : mlDisplayState?.auto_disabled ? (
        <MLDisclaimerBanner autoDisabled disabledReason={mlDisplayState.disabled_reason} />
      ) : null}

      {/* Search bar */}
      <View
        style={[
          styles.searchRow,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        <View
          style={[
            styles.searchInput,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <FontAwesome name="search" size={13} color={colors.textMuted} />
          <TextInput
            style={[styles.searchText, { color: colors.textPrimary }]}
            placeholder="Search ticker or name..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <FontAwesome name="times-circle" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <View
        style={[
          styles.filterBarWrap,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
      >
        {Platform.OS === "web" ? (
          <View style={styles.filterBarContentWeb}>{renderFilterChips()}</View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
            contentContainerStyle={styles.filterBarContent}
          >
            {renderFilterChips()}
          </ScrollView>
        )}
      </View>

      {/* Sortable column header */}
      <View
        style={[
          styles.colHeader,
          { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor },
        ]}
      >
        {isTableView ? (
          <>
            <Text
              style={[
                styles.colHeaderCell,
                { color: colors.textMuted, width: STOCK_TABLE_COL_WIDTHS.rating },
              ]}
            >
              Rating
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                { color: colors.textMuted, width: STOCK_TABLE_COL_WIDTHS.ticker },
              ]}
            >
              Ticker
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                { color: colors.textMuted, width: STOCK_TABLE_COL_WIDTHS.stage },
              ]}
            >
              Stage
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                { color: colors.textMuted, width: STOCK_TABLE_COL_WIDTHS.volume },
              ]}
            >
              Volume
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                {
                  color: colors.textMuted,
                  width: STOCK_TABLE_COL_WIDTHS.entry,
                  textAlign: "right",
                },
              ]}
            >
              Entry
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                {
                  color: colors.textMuted,
                  width: STOCK_TABLE_COL_WIDTHS.tp1,
                  textAlign: "right",
                },
              ]}
            >
              TP1
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                {
                  color: colors.textMuted,
                  width: STOCK_TABLE_COL_WIDTHS.bvps,
                  textAlign: "right",
                },
              ]}
            >
              BVPS
            </Text>
            <Text
              style={[
                styles.colHeaderCell,
                {
                  color: colors.textMuted,
                  width: STOCK_TABLE_COL_WIDTHS.pe,
                  textAlign: "right",
                },
              ]}
            >
              P/E
            </Text>
            <Pressable
              onPress={() => toggleSort("rr")}
              style={[styles.colHeaderBtn, styles.colHeaderSortBtn, { width: STOCK_TABLE_COL_WIDTHS.rr }]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "rr" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`R:R${sortBy === "rr" ? (sortDir === "desc" ? " ▼" : " ▲") : ""}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("conf")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.confidence },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "conf" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`Conf${sortBy === "conf" ? (sortDir === "desc" ? " ▼" : " ▲") : ""}`}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.colHeaderCell, { color: colors.textMuted, width: 68 }]}>
              RATING
            </Text>
            <Text style={[styles.colHeaderCell, { color: colors.textMuted, flex: 1 }]}>
              STOCK · STAGE
            </Text>
            <Pressable
              onPress={() => toggleSort("rr")}
              style={styles.colHeaderBtn}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: sortBy === "rr" ? colors.accentPrimary : colors.textMuted },
                ]}
              >
                {`R:R${sortBy === "rr" ? (sortDir === "desc" ? " ▼" : " ▲") : ""}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("conf")}
              style={styles.colHeaderBtn}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "conf" ? colors.accentPrimary : colors.textMuted,
                    width: 72,
                    textAlign: "right",
                  },
                ]}
              >
                {`CONF${sortBy === "conf" ? (sortDir === "desc" ? " ▼" : " ▲") : ""}`}
              </Text>
            </Pressable>
            {mlBandsData?.enabled ? (
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: colors.textMuted, width: 32, textAlign: "center", marginLeft: 4 },
                ]}
              >
                {EE.mlColumnHeader}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* List */}
      <FlatList
        data={stocks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + UITokens.spacing.lg },
          stocks.length === 0 && styles.listEmpty,
        ]}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        getItemLayout={(_data, index) => ({
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  updatedText: { fontSize: 11, marginTop: 1 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  regimeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1.5,
  },
  regimeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  countBadge: { fontSize: 11, fontVariant: ["tabular-nums"] },
  searchRow: {
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: UITokens.spacing.sm,
    borderWidth: 1,
    borderRadius: UITokens.radius.md,
    paddingHorizontal: UITokens.spacing.sm + 4,
    paddingVertical: UITokens.spacing.sm,
    height: 38,
  },
  searchText: { flex: 1, fontSize: 14 },
  filterBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    justifyContent: "center",
  },
  filterBar: {
    flexGrow: 0,
  },
  filterBarContent: {
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: 8,
    paddingRight: UITokens.spacing.md,
    gap: 6,
    alignItems: "center",
    minHeight: 52,
  },
  filterBarContentWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: 8,
    minHeight: 52,
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1.25,
    minHeight: Platform.OS === "web" ? 34 : UITokens.filter.chipHeight,
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipText: {
    fontSize: UITokens.filter.chipFontSize,
    fontWeight: UITokens.filter.chipFontWeight,
    letterSpacing: 0.25,
    lineHeight: Platform.OS === "web" ? 16 : undefined,
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeaderCell: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  colHeaderBtn: { paddingHorizontal: 2 },
  colHeaderSortBtn: { alignItems: "flex-end" },
  listContent: { flexGrow: 1 },
  listEmpty: { flex: 1 },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: UITokens.spacing.xl,
    gap: 8,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: UITokens.radius.md,
  },
  retryText: { fontWeight: "600", fontSize: 14 },
  eeRunBtn: {
    borderRadius: UITokens.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    minHeight: 28,
  },
  eeRunBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});