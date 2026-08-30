/**
 * NewsFeed — fetches and displays a list of news items.
 *
 * Supports:
 *  • Cursor-based infinite scrolling
 *  • Portfolio-filtered or market-wide mode
 *  • Category filter tabs
 *  • Pull-to-refresh
 *  • Expertise-level-aware rendering
 *  • Skeleton loading & empty state
 *  • Compliance disclaimer
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Linking,
  Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

import { useHoldings } from "@/hooks/queries";
import { useNewsDetail } from "@/hooks/queries/useNewsQueries";
import { useNewsFeed, useNewsHistoryInfinite } from "@/hooks/queries/useNewsQueries";
import i18n from "@/lib/i18n/config";
import type { NewsCategory, NewsItem } from "@/services/news/types";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import { ListContainer } from "@/components/ui/ListContainer";
import { NewsDisclaimer } from "./NewsAttribution";
import { NewsCard } from "./NewsCard";
import { tokens } from "@/theme/tokens";

// Fine-grained values not covered by the coarse spacing/typography scale,
// anchored to the nearest token so they stay tied to the design system.
const SP5 = tokens.spacing.xs + 1;
const SP6 = tokens.spacing.sm - 2;
const SP9 = tokens.spacing.sm + 1;
const SP10 = tokens.spacing.sm + 2;
const SP12 = tokens.spacing.md - 4;
const SP14 = tokens.spacing.md - 2;
const SP18 = tokens.spacing.md + 2;
const SP40 = tokens.spacing.xl + tokens.spacing.sm;
const FS12 = tokens.typography.caption.fontSize;
const FS13 = tokens.typography.label.fontSize;
const FS14 = tokens.typography.body.fontSize;
const FS16 = tokens.typography.h2.fontSize - 4;
const LH20 = tokens.typography.body.lineHeight;
const LH21 = tokens.typography.body.lineHeight + 1;
const LH22 = tokens.typography.body.lineHeight + 2;

// ── Category filter config ──────────────────────────────────────

interface CategoryTab {
  key: NewsCategory | "all";
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
}

const CATEGORIES: CategoryTab[] = [
  { key: "all",                    label: "catAll",           icon: "globe" },
  { key: "company_announcement",   label: "catAnnouncements", icon: "bullhorn" },
  { key: "financial",              label: "catFinancial",     icon: "file-text-o" },
  { key: "dividend",               label: "catDividends",     icon: "money" },
  { key: "earnings",               label: "catEarnings",      icon: "bar-chart" },
  { key: "market_news",            label: "catMarket",        icon: "line-chart" },
  { key: "regulatory",             label: "catRegulatory",    icon: "gavel" },
];

// ── Props ───────────────────────────────────────────────────────

interface NewsFeedProps {
  /** Only show news related to user's portfolio symbols */
  portfolioOnly?: boolean;
  /** Compact card style for embedding in other screens */
  compact?: boolean;
  /** Max items to show (useful when embedding) */
  maxItems?: number;
  /** Hide category filter tabs */
  hideCategoryFilter?: boolean;
  /** Fixed symbol filter (for stock detail pages) */
  symbol?: string;
  /** Search query for client-side title filtering */
  searchQuery?: string;
}

// ── Component ───────────────────────────────────────────────────

export const NewsFeed = React.memo(function NewsFeed({
  portfolioOnly = false,
  compact = false,
  maxItems,
  hideCategoryFilter = false,
  symbol,
  searchQuery = "",
}: NewsFeedProps) {
  const { colors } = useThemeStore();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const [activeCategory, setActiveCategory] = useState<NewsCategory | "all">("all");
  const [lang, setLang] = useState(i18n.language);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  useEffect(() => {
    const onLangChanged = (lng: string) => setLang(lng);
    i18n.on("languageChanged", onLangChanged);
    return () => { i18n.off("languageChanged", onLangChanged); };
  }, []);

  // Get user's portfolio symbols
  const { data: holdingsResp } = useHoldings();
  const userSymbols = useMemo(() => {
    if (symbol) return [symbol];
    return (holdingsResp?.holdings?.map((h: { symbol?: string }) => h.symbol).filter(Boolean) as string[]) ?? [];
  }, [holdingsResp?.holdings, symbol]);

  const categoryFilter = activeCategory === "all" ? undefined : [activeCategory] as NewsCategory[];
  // Filter server-side (not just client-side after fetch) so pagination reflects
  // the actual filtered result set instead of the full unfiltered market feed.
  const symbolsFilter = (portfolioOnly || !!symbol) && userSymbols.length > 0 ? userSymbols : undefined;

  // ── Live feed query (cursor-based infinite scroll) ──
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNewsFeed({
    categories: categoryFilter,
    symbols: symbolsFilter,
    lang,
  });

  // ── History query (past year, infinite scroll) ──
  // Also fall back to history when the live feed errors out (not just when
  // it's exhausted) so a transient /feed failure doesn't leave the screen
  // permanently blank while stored articles are still available.
  const {
    data: historyData,
    isLoading: historyLoading,
    fetchNextPage: fetchNextHistory,
    hasNextPage: hasNextHistory,
    isFetchingNextPage: isFetchingNextHistory,
  } = useNewsHistoryInfinite({
    categories: categoryFilter,
    symbols: symbolsFilter,
    lang,
    enabled: !maxItems && (hasNextPage === false || (isError && !isLoading)),
  });

  const { data: selectedDetail } = useNewsDetail(selectedItem?.id ?? "", !!selectedItem?.id);

  // Merge live feed + history, deduplicate by id, sort by date descending
  const newsItems = useMemo(() => {
    const liveItems: NewsItem[] = data?.pages?.flatMap((p) => p.items) ?? [];
    const historyItems: NewsItem[] = historyData?.pages?.flatMap((p) => p.items) ?? [];

    // Deduplicate — live items take priority
    const seen = new Set<string>();
    const merged: NewsItem[] = [];
    for (const item of [...liveItems, ...historyItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    // Sort by publishedAt descending (newest first)
    merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    // Client-side filter: if portfolioOnly or single-symbol mode, match by holdings
    const shouldFilter = (portfolioOnly || !!symbol) && userSymbols.length > 0;
    let filtered = shouldFilter
      ? merged.filter((it) => {
          const symSet = new Set(userSymbols.map((s) => s.toUpperCase()));
          return it.relatedSymbols.some((rs: string) => symSet.has(rs.toUpperCase()));
        })
      : merged;

    // Client-side search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.relatedSymbols.some((rs: string) => rs.toLowerCase().includes(q))
      );
    }

    return maxItems ? filtered.slice(0, maxItems) : filtered;
  }, [data?.pages, historyData?.pages, maxItems, portfolioOnly, symbol, userSymbols, searchQuery]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const openExternal = useCallback(async (item: NewsItem) => {
    const external = item.attachments?.[0]?.url || item.url;
    if (!external) return;
    const normalized = /^https?:\/\//i.test(external) ? external : `https://${external}`;
    try {
      await Linking.openURL(normalized);
    } catch {
      // Keep silent; user can still read in-app detail.
    }
  }, []);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !maxItems) {
      fetchNextPage();
    }
    // Also load more history when live feed is exhausted
    if (!hasNextPage && hasNextHistory && !isFetchingNextHistory && !maxItems) {
      fetchNextHistory();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hasNextHistory, isFetchingNextHistory, fetchNextHistory, maxItems]);

  const anyLoading = isLoading || historyLoading;

  // ── Loading ──
  if (anyLoading && !isRefetching) {
    return (
      <View style={s.loadingContainer}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[s.skeleton, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "40%" }]} />
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "90%", marginTop: tokens.spacing.sm }]} />
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "60%", marginTop: SP6 }]} />
          </View>
        ))}
      </View>
    );
  }

  // ── Error / Offline ──
  if (isError && newsItems.length === 0) {
    return (
      <View style={s.errorContainer}>
        <FontAwesome name="wifi" size={28} color={colors.textMuted} />
        <Text style={[s.errorText, { color: colors.textSecondary }]}>
          {i18n.t('news.unableToLoad')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('app.retry')}
          onPress={() => refetch()}
          style={[s.retryBtn, { borderColor: colors.accentPrimary }]}
        >
          <FontAwesome name="refresh" size={13} color={colors.accentPrimary} />
          <Text style={{ color: colors.accentPrimary, fontSize: FS13, fontWeight: "600", marginLeft: SP6 }}>
            {i18n.t('app.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Render ──
  return (
    <View style={{ flex: compact ? undefined : 1 }}>
      {/* Category filter tabs */}
      {!hideCategoryFilter && !compact && (
        <View style={[s.filterRow, { borderBottomColor: colors.borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SP12, gap: SP6 }}>
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t('news.' + cat.label)}
                  accessibilityState={{ selected: active }}
                  onPress={() => setActiveCategory(cat.key)}
                  style={[
                    s.filterChip,
                    {
                      backgroundColor: active ? colors.accentPrimary + "15" : "transparent",
                      borderColor: active ? colors.accentPrimary : colors.borderColor,
                    },
                  ]}
                >
                  <FontAwesome
                    name={cat.icon}
                    size={11}
                    color={active ? colors.accentPrimary : colors.textMuted}
                  />
                  <Text
                    style={{
                      color: active ? colors.accentPrimary : colors.textSecondary,
                      fontSize: FS12,
                      fontWeight: active ? "700" : "500",
                      marginLeft: SP5,
                    }}
                  >
                    {i18n.t('news.' + cat.label)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* News list — shared memoized list container */}
      <ListContainer
        data={newsItems}
        keyExtractor={(item) => item.id}
        estimatedItemSize={compact ? 120 : 152}
        isLoading={isLoading}
        isEmpty={newsItems.length === 0}
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            colors={colors}
            expertiseLevel={expertiseLevel}
            compact={compact}
            onPress={() => openExternal(item)}
          />
        )}
        contentContainerStyle={{ padding: compact ? 0 : 14 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          compact ? undefined : (
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          )
        }
        ListHeaderComponent={
          <>
            {isError && newsItems.length > 0 ? (
              <View style={[s.cachedBanner, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
                <FontAwesome name="wifi" size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: FS12, marginLeft: SP6, flex: 1 }}>
                  {i18n.t('news.showingCached')}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={i18n.t('app.retry')} onPress={() => refetch()} hitSlop={8}>
                  <Text style={{ color: colors.accentPrimary, fontSize: FS12, fontWeight: "600" }}>{i18n.t('app.retry')}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <>
            {(isFetchingNextPage || isFetchingNextHistory) && (
              <ActivityIndicator
                size="small"
                color={colors.accentPrimary}
                style={{ marginVertical: tokens.spacing.md }}
              />
            )}
            {!compact && newsItems.length > 0 && (
              <NewsDisclaimer colors={colors} />
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={[s.emptyText, { color: colors.textMuted }]}>
              {portfolioOnly ? i18n.t("news.noPortfolioNews") : i18n.t("news.noNews")}
            </Text>
          </View>
        }
        emptyTitle={portfolioOnly ? i18n.t("news.noPortfolioNews") : i18n.t("news.noNews")}
        emptyDesc={i18n.t("news.tryAnotherCategory")}
        emptyIcon="newspaper-variant-outline"
        scrollEnabled={!compact}
      />

      {/* In-app detail viewer ensures old/cached articles remain openable */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={[s.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
          <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {selectedDetail?.title ?? selectedItem?.title}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={i18n.t('app.close', 'Close')} onPress={() => setSelectedItem(null)} hitSlop={8}>
                <FontAwesome name="times" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[s.modalMeta, { color: colors.textMuted }]}>
              {selectedDetail?.publishedAt ?? selectedItem?.publishedAt}
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={[s.modalBody, { color: colors.textSecondary }]}>
                {selectedDetail?.fullContent || selectedDetail?.summary || selectedItem?.fullContent || selectedItem?.summary || i18n.t('news.noDetailsAvailable')}
              </Text>
            </ScrollView>

            <View style={s.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.t('app.close', 'Close')}
                onPress={() => setSelectedItem(null)}
                style={[s.modalBtn, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{i18n.t('app.close', 'Close')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={i18n.t('news.openSource', 'Open Source')}
                onPress={() => selectedItem && openExternal(selectedItem)}
                style={[s.modalBtn, { borderColor: colors.accentPrimary, backgroundColor: colors.accentPrimary + "15" }]}
              >
                <Text style={{ color: colors.accentPrimary, fontWeight: "700" }}>{i18n.t('news.openSource', 'Open Source')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  loadingContainer: {
    padding: SP14,
    gap: SP10,
  },
  skeleton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SP14,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
  },
  filterRow: {
    borderBottomWidth: 1,
    paddingVertical: tokens.spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP12,
    paddingVertical: SP6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: SP40,
    gap: SP12,
  },
  emptyText: {
    fontSize: FS14,
    textAlign: "center",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: SP40,
    gap: SP12,
  },
  errorText: {
    fontSize: FS14,
    textAlign: "center",
    lineHeight: LH20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP18,
    paddingVertical: SP9,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: tokens.spacing.xs,
  },
  cachedBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: SP10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: SP10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: tokens.spacing.md,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SP14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: tokens.spacing.sm,
    marginBottom: SP6,
  },
  modalTitle: {
    flex: 1,
    fontSize: FS16,
    fontWeight: "700",
    lineHeight: LH22,
  },
  modalMeta: {
    fontSize: FS12,
    marginBottom: SP10,
  },
  modalBody: {
    fontSize: FS14,
    lineHeight: LH21,
  },
  modalActions: {
    marginTop: SP12,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: tokens.spacing.sm,
  },
  modalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SP12,
    paddingVertical: tokens.spacing.sm,
    minHeight: 40,
    justifyContent: "center",
  },
});
