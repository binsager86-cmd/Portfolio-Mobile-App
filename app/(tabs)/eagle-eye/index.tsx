/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Scanner screen
 *
 * Shows all scored stocks sorted by confidence descending.
 * Supports filtering by confidence, rating, status, volume context, and stage.
 * Sortable by clicking any table column header.
 */

import { getRegimeColors, getStageColors } from "@/constants/eagleEyeColors";
import { EE, REGIME_LABELS, getStageLabelShort } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { exportEagleEyeScannerReport } from "@/lib/exportEagleEyeScannerReport";
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
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

const CONFIDENCE_STEPS = [0, 40, 60, 75] as const;
const STAGE_FILTER_ORDER = [
  "ACCUMULATION",
  "EARLY_MARKUP",
  "MARKUP",
  "DISTRIBUTION",
  "MARKDOWN",
  "NEUTRAL_AMBIGUOUS",
  "INSUFFICIENT_HISTORY",
  "INACTIVE_OR_DELISTED",
] as const;
const STATUS_FILTER_ORDER = ["WATCHLIST", "NEUTRAL", "HOLD"] as const;
const HIGH_VOLUME_RVOL_THRESHOLD = 1.5;

const RATING_SORT_WEIGHT: Record<string, number> = {
  STRONG_BUY: 5,
  BUY: 4,
  WATCHLIST: 3.5,
  HOLD: 3,
  NEUTRAL: 2.75,
  REDUCE: 2.5,
  SELL: 2,
  AVOID: 1.5,
  STRONG_SELL: 1,
  INSUFFICIENT_DATA: 0,
};

const STAGE_SORT_WEIGHT: Record<string, number> = {
  ACCUMULATION: 8,
  EARLY_MARKUP: 7,
  MARKUP: 6,
  DISTRIBUTION: 5,
  MARKDOWN: 4,
  NEUTRAL_AMBIGUOUS: 3,
  INSUFFICIENT_HISTORY: 2,
  INACTIVE_OR_DELISTED: 1,
  EARLY_BREAKOUT: 7,
  MARKUP_TRENDING: 6,
  DISTRIBUTION_TOPPING: 5,
  MARKDOWN_DECLINE: 4,
  DORMANT: 3,
  DATA_ISSUE: 0,
};

type SortField =
  | "rating"
  | "ticker"
  | "stage"
  | "volume"
  | "conf"
  | "rr"
  | "price"
  | "entry"
  | "tp1"
  | "bvps"
  | "pe";
type SortDir = "asc" | "desc";
type StageFilter = (typeof STAGE_FILTER_ORDER)[number];
type StatusFilter = (typeof STATUS_FILTER_ORDER)[number];
type LoadingMode = "idle" | "loading" | "refresh" | "warming_up";
type ScannerListItem = { kind: "col_header" } | { kind: "stock"; stock: RatedStock };

const SORT_LABEL_BY_FIELD: Record<SortField, string> = {
  rating: "Rating",
  ticker: "Ticker",
  stage: "Stage",
  volume: "Volume",
  conf: "Confidence",
  rr: "Risk/Reward",
  price: "Current Price",
  entry: "Entry",
  tp1: "TP1",
  bvps: "BVPS",
  pe: "P/E",
};

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

  const [minConfidence, setMinConfidence] = useState(0);
  const [search, setSearch] = useState("");
  const [buyRatingOnly, setBuyRatingOnly] = useState(false);
  const [sellRatingOnly, setSellRatingOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [highVolumeOnly, setHighVolumeOnly] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("conf");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const isTableView = Platform.OS === "web";

  // Always enable scanner queries to avoid missed focus events in production.
  const fetchEnabled = true;

  const { data, isLoading, isRefetching, refetch, isError, dataUpdatedAt } =
    useEagleEyeScanner(undefined, fetchEnabled);
  const isWarmingUp = data?.status === "warming_up";

  const loadingMode: LoadingMode = useMemo(() => {
    if (isWarmingUp) return "warming_up";
    if (isLoading) return "loading";
    if (isRefetching) return "refresh";
    return "idle";
  }, [isWarmingUp, isLoading, isRefetching]);

  const backendProgressPercent =
    typeof data?.progress_percent === "number" && Number.isFinite(data.progress_percent)
      ? Math.max(0, Math.min(100, Math.round(data.progress_percent)))
      : null;
  const backendProgressCurrent =
    typeof data?.progress_current === "number" && Number.isFinite(data.progress_current)
      ? Math.max(0, Math.round(data.progress_current))
      : null;
  const backendProgressTotal =
    typeof data?.progress_total === "number" && Number.isFinite(data.progress_total)
      ? Math.max(0, Math.round(data.progress_total))
      : null;
  const hasDeterminateProgress =
    loadingMode === "warming_up" && backendProgressPercent !== null;

  const loadingLabel =
    loadingMode === "warming_up"
      ? data?.progress_message?.trim() || "Building market intelligence"
      : loadingMode === "refresh"
      ? "Refreshing scanner data"
      : "Loading scanner";

  const loadingSubLabel =
    loadingMode === "warming_up" && backendProgressCurrent !== null && backendProgressTotal
      ? `${backendProgressCurrent}/${backendProgressTotal} items processed`
      : loadingMode === "warming_up"
      ? "Waiting for backend progress"
      : loadingMode === "refresh"
      ? "Syncing latest scanner snapshot"
      : "Fetching scanner snapshot";

  const [loadingPercent, setLoadingPercent] = useState(0);
  const [showLoadingBanner, setShowLoadingBanner] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loadingMode === "idle") {
      return;
    }

    setShowLoadingBanner(true);

    if (loadingMode === "warming_up") {
      setLoadingPercent(Math.max(0, Math.min(99, backendProgressPercent ?? 0)));
      return;
    }

    setLoadingPercent(loadingMode === "refresh" ? 70 : 35);
  }, [loadingMode, backendProgressPercent]);

  useEffect(() => {
    if (loadingMode !== "idle") return;
    if (!showLoadingBanner) return;

    setLoadingPercent(100);
    const timeoutId = setTimeout(() => {
      setShowLoadingBanner(false);
      setLoadingPercent(0);
    }, 480);

    return () => clearTimeout(timeoutId);
  }, [loadingMode, showLoadingBanner]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: loadingPercent,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [loadingPercent, progressAnim]);

  const loadingProgressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const loadingPercentLabel = hasDeterminateProgress ? `${loadingPercent}%` : "...";

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

  useEffect(() => {
    return () => {
      if (runStatusTimer.current) {
        clearTimeout(runStatusTimer.current);
        runStatusTimer.current = null;
      }
    };
  }, []);

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
        (s) =>
          s.rating === "SELL"
          || s.rating === "STRONG_SELL"
          || s.rating === "REDUCE"
          || s.rating === "AVOID"
      );
    }
    if (statusFilter) {
      list = list.filter(
        (s) => String(s.rating ?? "").toUpperCase() === statusFilter
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
      const numberOrNegInf = (value: number | null | undefined) =>
        Number.isFinite(value) ? (value as number) : -Infinity;

      const ratingWeight = (value: string | null | undefined) =>
        RATING_SORT_WEIGHT[String(value || "").toUpperCase()] ?? 0;

      const stageWeight = (value: string | null | undefined) =>
        STAGE_SORT_WEIGHT[String(value || "").toUpperCase()] ?? 0;

      const relVolume = (stock: RatedStock) =>
        numberOrNegInf(stock.volume_context?.relative_volume ?? null);

      let diff: number;
      if (sortBy === "rating") {
        diff = ratingWeight(b.rating) - ratingWeight(a.rating);
      } else if (sortBy === "ticker") {
        diff = b.ticker.localeCompare(a.ticker);
      } else if (sortBy === "stage") {
        diff = stageWeight(b.stage) - stageWeight(a.stage);
      } else if (sortBy === "volume") {
        diff = relVolume(b) - relVolume(a);
      } else if (sortBy === "conf") {
        diff = b.confidence - a.confidence;
      } else if (sortBy === "rr") {
        const rrA = computeRR(a) ?? -Infinity;
        const rrB = computeRR(b) ?? -Infinity;
        diff = rrB - rrA;
      } else if (sortBy === "price") {
        diff = numberOrNegInf(b.last_price) - numberOrNegInf(a.last_price);
      } else if (sortBy === "entry") {
        diff = numberOrNegInf(b.entry_primary) - numberOrNegInf(a.entry_primary);
      } else if (sortBy === "tp1") {
        diff = numberOrNegInf(b.tp1) - numberOrNegInf(a.tp1);
      } else if (sortBy === "bvps") {
        diff = numberOrNegInf(b.book_value_per_share) - numberOrNegInf(a.book_value_per_share);
      } else {
        diff = numberOrNegInf(b.pe_ratio) - numberOrNegInf(a.pe_ratio);
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
    statusFilter,
    highVolumeOnly,
    stageFilter,
    sortBy,
    sortDir,
    mlBandsData,
  ]);

  const listData = useMemo<ScannerListItem[]>(() => {
    if (stocks.length === 0) {
      return [];
    }
    return [{ kind: "col_header" }, ...stocks.map((stock) => ({ kind: "stock" as const, stock }))];
  }, [stocks]);

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

  const handleExportScanner = useCallback(async () => {
    try {
      const ratingFilter = buyRatingOnly
        ? "BUY RATING"
        : sellRatingOnly
        ? "SELL RATING"
        : "All";
      const statusFilterLabel = statusFilter ?? "All";
      const stageFilterLabel = stageFilter ? getStageLabelShort(stageFilter) : "All";

      await exportEagleEyeScannerReport({
        rows: stocks.map((stock) => ({
          ticker: stock.ticker,
          nameEn: stock.name_en,
          sector: stock.sector,
          stage: getStageLabelShort(stock.stage),
          rating: stock.rating ?? "",
          confidence: Number.isFinite(stock.confidence) ? stock.confidence : 0,
          lastPrice: stock.last_price ?? null,
          entryPrimary: stock.entry_primary ?? null,
          tp1: stock.tp1 ?? null,
          bookValuePerShare: stock.book_value_per_share ?? null,
          peRatio: stock.pe_ratio ?? null,
          rrRatio: computeRR(stock),
          relativeVolume: stock.volume_context?.relative_volume ?? null,
          volumeConfirmed: stock.volume_context?.is_volume_confirmed ?? false,
          computedAt: stock.computed_at ?? null,
        })),
        filters: {
          search,
          minConfidence,
          ratingFilter,
          statusFilter: statusFilterLabel,
          stageFilter: stageFilterLabel,
          highVolumeOnly,
        },
        summary: {
          visibleRows: stocks.length,
          totalRows: data?.stocks?.length ?? stocks.length,
          sortColumn: SORT_LABEL_BY_FIELD[sortBy],
          sortDirection: sortDir,
        },
      });
    } catch (error) {
      console.error("Failed to export scanner report", error);
      Alert.alert("Export failed", "Could not generate the scanner report.");
    }
  }, [
    buyRatingOnly,
    sellRatingOnly,
    stocks,
    search,
    minConfidence,
    statusFilter,
    stageFilter,
    highVolumeOnly,
    data?.stocks,
    sortBy,
    sortDir,
  ]);

  const sortArrow = useCallback(
    (field: SortField) =>
      sortBy === field ? (sortDir === "desc" ? " ▼" : " ▲") : "",
    [sortBy, sortDir]
  );

  const hasActiveFilters =
    search.trim().length > 0
    || minConfidence > 0
    || buyRatingOnly
    || sellRatingOnly
    || statusFilter != null
    || highVolumeOnly
    || stageFilter != null;

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setMinConfidence(0);
    setBuyRatingOnly(false);
    setSellRatingOnly(false);
    setStatusFilter(null);
    setHighVolumeOnly(false);
    setStageFilter(null);
  }, []);

  const renderColumnHeader = useCallback(
    () => (
      <View
        style={[
          styles.colHeader,
          { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor },
        ]}
      >
        {isTableView ? (
          <>
            <Pressable
              onPress={() => toggleSort("rating")}
              style={[styles.colHeaderBtn, { width: STOCK_TABLE_COL_WIDTHS.rating }]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: sortBy === "rating" ? colors.accentPrimary : colors.textMuted },
                ]}
              >
                {`Rating${sortArrow("rating")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("ticker")}
              style={[styles.colHeaderBtn, { width: STOCK_TABLE_COL_WIDTHS.ticker }]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: sortBy === "ticker" ? colors.accentPrimary : colors.textMuted },
                ]}
              >
                {`Ticker${sortArrow("ticker")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("stage")}
              style={[styles.colHeaderBtn, { width: STOCK_TABLE_COL_WIDTHS.stage }]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: sortBy === "stage" ? colors.accentPrimary : colors.textMuted },
                ]}
              >
                {`Stage${sortArrow("stage")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("volume")}
              style={[styles.colHeaderBtn, { width: STOCK_TABLE_COL_WIDTHS.volume }]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  { color: sortBy === "volume" ? colors.accentPrimary : colors.textMuted },
                ]}
              >
                {`Volume${sortArrow("volume")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("price")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.current },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "price" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`Current${sortArrow("price")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("entry")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.entry },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "entry" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`Entry${sortArrow("entry")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("tp1")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.tp1 },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "tp1" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`TP1${sortArrow("tp1")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("bvps")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.bvps },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "bvps" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`BVPS${sortArrow("bvps")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleSort("pe")}
              style={[
                styles.colHeaderBtn,
                styles.colHeaderSortBtn,
                { width: STOCK_TABLE_COL_WIDTHS.pe },
              ]}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.colHeaderCell,
                  {
                    color: sortBy === "pe" ? colors.accentPrimary : colors.textMuted,
                    textAlign: "right",
                  },
                ]}
              >
                {`P/E${sortArrow("pe")}`}
              </Text>
            </Pressable>
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
                {`R:R${sortArrow("rr")}`}
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
                {`Conf${sortArrow("conf")}`}
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
    ),
    [
      colors.accentPrimary,
      colors.bgSecondary,
      colors.borderColor,
      colors.textMuted,
      isTableView,
      mlBandsData?.enabled,
      sortArrow,
      sortBy,
      sortDir,
      toggleSort,
    ]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ScannerListItem; index: number }) => {
      if (item.kind === "col_header") {
        return renderColumnHeader();
      }
      return (
        <StockRow
          item={item.stock}
          isFirst={index === 1}
          variant={isTableView ? "table" : "default"}
        />
      );
    },
    [isTableView, renderColumnHeader]
  );

  const keyExtractor = useCallback(
    (item: ScannerListItem) =>
      item.kind === "col_header" ? "__scanner_column_header__" : item.stock.ticker,
    []
  );

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
          setStatusFilter(null);
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
          setStatusFilter(null);
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

      {STATUS_FILTER_ORDER.map((status) => {
        const active = statusFilter === status;
        const activeColor =
          status === "WATCHLIST"
            ? colors.accentSecondary
            : status === "HOLD"
            ? colors.warning
            : colors.textMuted;

        return (
          <Pressable
            key={status}
            onPress={() => {
              setStatusFilter((prev) => (prev === status ? null : status));
              setBuyRatingOnly(false);
              setSellRatingOnly(false);
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor: active ? activeColor : colors.bgCard,
                borderColor: active ? activeColor : colors.borderColor,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: active ? colors.bgPrimary : colors.textPrimary },
              ]}
            >
              {status}
            </Text>
          </Pressable>
        );
      })}

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

      {showLoadingBanner ? (
        <View
          style={[
            styles.loadingBanner,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <View style={styles.loadingBannerRow}>
            <View style={styles.loadingTitleRow}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <View style={styles.loadingTextWrap}>
                <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                  {loadingLabel}
                </Text>
                <Text style={[styles.loadingSubTitle, { color: colors.textMuted }]}>
                  {loadingSubLabel}
                </Text>
              </View>
            </View>
            <Text style={[styles.loadingPercent, { color: colors.accentPrimary }]}>
              {loadingPercentLabel}
            </Text>
          </View>

          <View style={[styles.loadingTrack, { backgroundColor: colors.bgSecondary }]}>
            <Animated.View
              style={[
                styles.loadingFill,
                {
                  backgroundColor: colors.accentPrimary,
                  width: loadingProgressWidth,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.tableCard,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
        ]}
      >
        <FlatList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          // ListHeaderComponent occupies index 0; keep only the data column header sticky.
          stickyHeaderIndices={listData.length > 0 ? [1] : undefined}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={
            <>
              <EagleEyeTopTabs />

              {mlBandsData?.enabled ? (
                <MLDisclaimerBanner
                  autoDisabled={mlDisplayState?.auto_disabled ?? false}
                  disabledReason={mlDisplayState?.disabled_reason}
                />
              ) : mlDisplayState?.auto_disabled ? (
                <MLDisclaimerBanner autoDisabled disabledReason={mlDisplayState.disabled_reason} />
              ) : null}

              <View style={styles.tableTopSection}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeaderRow}>
                    <View style={styles.previewHeaderCopy}>
                      <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>SCANNER TABLE</Text>
                      <Text style={[styles.previewSubtitle, { color: colors.textMuted }]}>
                        {`${stocks.length} records • sorted by ${SORT_LABEL_BY_FIELD[sortBy]} (${sortDir.toUpperCase()})`}
                      </Text>
                    </View>

                    <Pressable
                      testID="export-eagle-eye-scanner"
                      onPress={handleExportScanner}
                      style={[
                        styles.exportButton,
                        {
                          backgroundColor: colors.accentPrimary + "18",
                          borderColor: colors.accentPrimary + "55",
                          opacity: stocks.length ? 1 : 0.5,
                        },
                      ]}
                      disabled={!stocks.length}
                    >
                      <FontAwesome name="file-excel-o" size={14} color={colors.accentPrimary} />
                      <Text style={[styles.exportButtonText, { color: colors.accentPrimary }]}>Export Excel</Text>
                    </Pressable>
                  </View>
                </View>

                <View
                  style={[
                    styles.filterPanel,
                    { backgroundColor: colors.accentPrimary + "08", borderColor: colors.borderColor },
                  ]}
                >
                  <View style={styles.filterPanelHeader}>
                    <View>
                      <Text style={[styles.filterPanelTitle, { color: colors.textPrimary }]}>FILTER SCANNER</Text>
                      <Text style={[styles.filterPanelSubtitle, { color: colors.textMuted }]}>Find stocks by ticker, confidence, rating, status, volume, and stage.</Text>
                    </View>
                    {hasActiveFilters ? (
                      <Pressable
                        onPress={handleClearFilters}
                        style={[
                          styles.clearFiltersButton,
                          { borderColor: colors.borderColor, backgroundColor: colors.bgPrimary },
                        ]}
                      >
                        <FontAwesome name="times" size={12} color={colors.textMuted} />
                        <Text style={[styles.clearFiltersButtonText, { color: colors.textSecondary }]}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.searchRow}>
                    <View
                      style={[
                        styles.searchInput,
                        { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor },
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

                  <View style={styles.filterBarWrap}>
                    {Platform.OS === "web" ? (
                      <View style={styles.filterBarContentWeb}>{renderFilterChips()}</View>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.filterBar}
                        nestedScrollEnabled
                        directionalLockEnabled
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.filterBarContent}
                      >
                        {renderFilterChips()}
                      </ScrollView>
                    )}
                  </View>
                </View>
              </View>
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
              colors={[colors.accentPrimary]}
            />
          }
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + UITokens.spacing.lg },
            stocks.length === 0 && styles.listEmpty,
          ]}
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
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
  tableCard: {
    flex: 1,
    marginHorizontal: UITokens.spacing.md,
    marginBottom: UITokens.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  loadingBanner: {
    marginHorizontal: UITokens.spacing.md,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  loadingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  loadingTextWrap: {
    flexShrink: 1,
  },
  loadingTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  loadingSubTitle: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: "500",
  },
  loadingPercent: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
    minWidth: 42,
    textAlign: "right",
  },
  loadingTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  loadingFill: {
    height: "100%",
    borderRadius: 999,
  },
  tableTopSection: {
    gap: 0,
  },
  previewHeader: {
    paddingHorizontal: UITokens.spacing.md,
    paddingTop: UITokens.spacing.sm + 2,
    paddingBottom: UITokens.spacing.sm,
    gap: 2,
  },
  previewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  previewHeaderCopy: {
    flexGrow: 1,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  previewSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterPanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: UITokens.spacing.md,
    marginBottom: 10,
    gap: 10,
  },
  filterPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  filterPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  filterPanelSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 3,
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: UITokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearFiltersButtonText: {
    fontSize: 11,
    fontWeight: "700",
  },
  searchRow: {
    marginBottom: 2,
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
    minHeight: 52,
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
    zIndex: 8,
    elevation: 4,
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