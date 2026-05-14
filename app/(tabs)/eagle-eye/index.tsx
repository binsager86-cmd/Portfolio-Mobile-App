/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Scanner screen
 *
 * Shows all scored stocks sorted by confidence descending.
 * Supports filtering by min confidence, BUY+, and EARLY_BREAKOUT stage.
 * Sortable by confidence or R:R ratio.
 */

import { getRegimeColors } from "@/constants/eagleEyeColors";
import { EE, REGIME_LABELS } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { StockRow, StockRowSkeleton, computeRR } from "@/components/eagle-eye/StockRow";
import { useEagleEyeRegime, useEagleEyeScanner, type RatedStock } from "@/hooks/useEagleEye";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
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
type SortField = "conf" | "rr";
type SortDir = "asc" | "desc";

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
  const [buyOnly, setBuyOnly] = useState(false);
  const [breakoutOnly, setBreakoutOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("conf");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isRefetching, refetch, isError, dataUpdatedAt } =
    useEagleEyeScanner({
      min_confidence: minConfidence > 0 ? minConfidence : undefined,
    });

  const { data: regimeData } = useEagleEyeRegime();

  const stocks: RatedStock[] = useMemo(() => {
    let list = data?.stocks ?? [];
    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.ticker.toUpperCase().includes(q) || s.name_en.toUpperCase().includes(q)
      );
    }
    if (buyOnly) {
      list = list.filter(
        (s) => s.rating === "BUY" || s.rating === "STRONG_BUY"
      );
    }
    if (breakoutOnly) {
      list = list.filter((s) => s.stage === "EARLY_BREAKOUT");
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
  }, [data, search, buyOnly, breakoutOnly, sortBy, sortDir]);

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
      <StockRow item={item} isFirst={index === 0} />
    ),
    []
  );
  const keyExtractor = useCallback((item: RatedStock) => item.ticker, []);

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <>
          {Array.from({ length: 10 }).map((_, i) => (
            <StockRowSkeleton key={i} />
          ))}
        </>
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
          </View>
        </View>
      </View>

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.filterBar,
          { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
        ]}
        contentContainerStyle={styles.filterBarContent}
      >
        {CONFIDENCE_STEPS.map((step) => {
          const active = minConfidence === step && !buyOnly && !breakoutOnly;
          return (
            <Pressable
              key={step}
              onPress={() => {
                setMinConfidence(step);
                setBuyOnly(false);
                setBreakoutOnly(false);
              }}
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
                  { color: active ? colors.bgPrimary : colors.textSecondary },
                ]}
              >
                {step === 0 ? "All" : `${step}%+`}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => {
            setBuyOnly((v) => !v);
            setBreakoutOnly(false);
          }}
          style={[
            styles.filterChip,
            {
              backgroundColor: buyOnly ? colors.success : colors.bgCard,
              borderColor: buyOnly ? colors.success : colors.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              { color: buyOnly ? colors.successText : colors.textSecondary },
            ]}
          >
            BUY+
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setBreakoutOnly((v) => !v);
            setBuyOnly(false);
          }}
          style={[
            styles.filterChip,
            {
              backgroundColor: breakoutOnly ? colors.accentSecondary : colors.bgCard,
              borderColor: breakoutOnly ? colors.accentSecondary : colors.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              { color: breakoutOnly ? colors.bgPrimary : colors.textSecondary },
            ]}
          >
            BREAKOUT
          </Text>
        </Pressable>
      </ScrollView>

      {/* Sortable column header */}
      <View
        style={[
          styles.colHeader,
          { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor },
        ]}
      >
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
        getItemLayout={(_data, index) => ({ length: 72, offset: 72 * index, index })}
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
  filterBar: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 42 },
  filterBarContent: {
    paddingHorizontal: UITokens.spacing.sm,
    paddingVertical: 6,
    gap: 6,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.2 },
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
});