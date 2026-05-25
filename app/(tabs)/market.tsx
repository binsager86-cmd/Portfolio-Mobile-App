/* eslint-disable custom-styles/no-hardcoded-styles, max-lines */
/**
 * Market Tab — Boursa Kuwait live market data.
 *
 * Sections:
 *  • Market indices (Premier, Main, All-Share, BK Main 50)
 *  • Today's Summary card (shares traded, value, trades)
 *  • Market Mood (gainers / neutral / losers bar)
 *  • Top Risers / Biggest Drops / Most Traded tables
 *  • Sector Performance table
 */

import { withErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { MarketSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useMarketRefresh, useMarketSummary } from "@/hooks/queries/useMarketQueries";
import { useResponsive } from "@/hooks/useResponsive";
import type { MarketIndex, MarketMover, PerMarketSummary, SectorIndex } from "@/services/market/marketApi";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type AppColors = ThemePalette;
type SummaryTotals = {
  volume?: number | null;
  value_traded?: number | null;
  trades?: number | null;
};

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function changeColor(val: number | null | undefined, colors: AppColors): string {
  if (val == null || val === 0) return colors.textMuted;
  return val > 0 ? colors.success : colors.danger;
}

function changePrefix(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return val > 0 ? "+" : "";
}

// ── Sub-components ──────────────────────────────────────────────────

function IndexCard({
  index,
  colors,
  isCompact,
}: {
  index: MarketIndex;
  colors: AppColors;
  isCompact?: boolean;
}) {
  const chgColor = changeColor(index.changePercent, colors);
  const isUp = (index.changePercent ?? 0) > 0;
  const isDown = (index.changePercent ?? 0) < 0;
  return (
    <View
      style={[
        s.indexCard,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: chgColor,
          borderLeftWidth: 3,
        },
        isCompact && { minWidth: 150, flex: 1 },
      ]}
    >
      <Text style={[s.indexName, { color: colors.textSecondary }]} numberOfLines={1}>
        {index.name}
      </Text>
      <Text style={[s.indexValue, { color: colors.textPrimary }]}>
        {fmt(index.value)}
      </Text>
      <View style={s.changeRow}>
        <FontAwesome
          name={isUp ? "caret-up" : isDown ? "caret-down" : "minus"}
          size={isUp || isDown ? 16 : 10}
          color={chgColor}
          style={{ marginRight: 4 }}
        />
        <Text style={[s.changeText, { color: chgColor }]}>
          {changePrefix(index.change)}
          {fmt(index.change)}
        </Text>
        <View style={[s.changeBadge, { backgroundColor: chgColor + "18" }]}>
          <Text style={[s.changePct, { color: chgColor }]}>
            {changePrefix(index.changePercent)}
            {fmt(index.changePercent)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function SummaryCard({
  summary,
  colors,
  t,
  isCompact,
}: {
  summary: SummaryTotals;
  colors: AppColors;
  t: (key: string) => string;
  isCompact: boolean;
}) {
  return (
    <View style={[s.summaryCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t("market.todaysActivity")}</Text>
      <View style={[s.summaryRow, isCompact && s.summaryRowCompact]}>
        <View style={[s.summaryItem, s.summaryItemCard, isCompact && s.summaryItemCompact, { backgroundColor: colors.bgSecondary + "55" }]}> 
          <View style={[s.summaryIconWrap, { backgroundColor: colors.accentSecondary + "15" }]}>
            <FontAwesome name="bar-chart" size={16} color={colors.accentSecondary} />
          </View>
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtCompact(summary.volume)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{t("market.sharesTraded")}</Text>
        </View>
        {!isCompact && <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />}
        <View style={[s.summaryItem, s.summaryItemCard, isCompact && s.summaryItemCompact, { backgroundColor: colors.bgSecondary + "55" }]}> 
          <View style={[s.summaryIconWrap, { backgroundColor: colors.accentPrimary + "15" }]}>
            <FontAwesome name="money" size={16} color={colors.accentPrimary} />
          </View>
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtCompact(summary.value_traded)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{t("market.valueKWD")}</Text>
        </View>
        {!isCompact && <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />}
        <View style={[s.summaryItem, s.summaryItemCard, isCompact && s.summaryItemCompact, { backgroundColor: colors.bgSecondary + "55" }]}> 
          <View style={[s.summaryIconWrap, { backgroundColor: colors.accentTertiary + "15" }]}>
            <FontAwesome name="exchange" size={14} color={colors.accentTertiary} />
          </View>
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtInt(summary.trades)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>{t("market.trades")}</Text>
        </View>
      </View>
    </View>
  );
}

function pct(part: number | null | undefined, total: number | null | undefined): string | null {
  if (!part || !total || total === 0) return null;
  return ((part / total) * 100).toFixed(1) + "%";
}

function MarketDetailCard({
  title,
  icon,
  index,
  perMarket,
  totalSummary,
  colors,
  t,
  isCompact,
}: {
  title: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  index: MarketIndex | undefined;
  perMarket: PerMarketSummary;
  totalSummary: SummaryTotals;
  colors: AppColors;
  t: (key: string) => string;
  isCompact: boolean;
}) {
  const chgColor = index ? changeColor(index.changePercent, colors) : colors.textMuted;
  const volPct = pct(perMarket.volume, totalSummary.volume);
  const valPct = pct(perMarket.value_traded, totalSummary.value_traded);
  const tradePct = pct(perMarket.trades, totalSummary.trades);
  return (
    <View style={[s.detailCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
      <View style={s.detailHeader}>
        <View style={[s.detailIconBg, { backgroundColor: chgColor + "15" }]}>
          <FontAwesome name={icon} size={16} color={chgColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.detailTitle, { color: colors.textPrimary }]}>{title}</Text>
          {index && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                {fmt(index.value)}
              </Text>
              <View style={[s.detailChangeBadge, { backgroundColor: chgColor + "18" }]}>
                <Text style={{ color: chgColor, fontSize: 12, fontWeight: "700" }}>
                  {changePrefix(index.changePercent)}{fmt(index.changePercent)}%
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={[s.detailStats, isCompact && s.detailStatsCompact]}>
        <View style={[s.detailStatItem, isCompact && s.detailStatItemCompact]}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>{t("market.volume")}</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtCompact(perMarket.volume)}
          </Text>
          {volPct && <Text style={[s.detailPct, { color: colors.accentSecondary }]}>{volPct}</Text>}
        </View>
        {!isCompact && <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />}
        <View style={[s.detailStatItem, isCompact && s.detailStatItemCompact]}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>{t("market.valueKWD")}</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtCompact(perMarket.value_traded)}
          </Text>
          {valPct && <Text style={[s.detailPct, { color: colors.accentPrimary }]}>{valPct}</Text>}
        </View>
        {!isCompact && <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />}
        <View style={[s.detailStatItem, isCompact && s.detailStatItemCompact]}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>{t("market.trades")}</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtInt(perMarket.trades)}
          </Text>
          {tradePct && <Text style={[s.detailPct, { color: colors.accentTertiary }]}>{tradePct}</Text>}
        </View>
        {perMarket.market_cap != null && perMarket.market_cap > 0 && (
          <>
            {!isCompact && <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />}
            <View style={[s.detailStatItem, isCompact && s.detailStatItemCompact]}>
              <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>{t("market.marketCap")}</Text>
              <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
                {fmtCompact(perMarket.market_cap)}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function GainersLosersBar({
  gainers,
  neutral,
  losers,
  colors,
  t,
  isCompact,
}: {
  gainers: number;
  neutral: number;
  losers: number;
  colors: AppColors;
  t: TFunction;
  isCompact: boolean;
}) {
  const total = gainers + neutral + losers || 1;
  const gPct = Math.round((gainers / total) * 100);
  const lPct = Math.round((losers / total) * 100);
  const nPct = 100 - gPct - lPct;
  return (
    <View style={[s.glCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t("market.marketMood")}</Text>
      <Text style={[s.glSubtitle, { color: colors.textMuted }]}>
        {t("market.howSectorsDoingToday")}
      </Text>
      <View style={s.glBar}>
        {gainers > 0 && (
          <View style={[s.glSegment, { flex: gainers / total, backgroundColor: colors.success, borderTopLeftRadius: 5, borderBottomLeftRadius: 5 }]} />
        )}
        {neutral > 0 && (
          <View style={[s.glSegment, { flex: neutral / total, backgroundColor: colors.textMuted }]} />
        )}
        {losers > 0 && (
          <View style={[s.glSegment, { flex: losers / total, backgroundColor: colors.danger, borderTopRightRadius: 5, borderBottomRightRadius: 5 }]} />
        )}
      </View>
      <View style={[s.glLabels, isCompact && s.glLabelsCompact]}>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: colors.success }]} />
          <View>
            <Text style={[s.glLabelText, { color: colors.success }]}>
              {gainers} {t("market.up")}
            </Text>
            <Text style={[s.glPctText, { color: colors.success }]}>{gPct}%</Text>
          </View>
        </View>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: colors.textMuted }]} />
          <View>
            <Text style={[s.glLabelText, { color: colors.textMuted }]}>
              {neutral} {t("market.flat")}
            </Text>
            <Text style={[s.glPctText, { color: colors.textMuted }]}>{nPct}%</Text>
          </View>
        </View>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: colors.danger }]} />
          <View>
            <Text style={[s.glLabelText, { color: colors.danger }]}>
              {losers} {t("market.down")}
            </Text>
            <Text style={[s.glPctText, { color: colors.danger }]}>{lPct}%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function MoverTable({
  title,
  subtitle,
  movers,
  icon,
  accentColor,
  colors,
  t,
  isCompact,
  isWide,
  isMostTraded,
}: {
  title: string;
  subtitle: string;
  movers: MarketMover[];
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor: string;
  colors: AppColors;
  t: (key: string) => string;
  isCompact: boolean;
  isWide: boolean;
  isMostTraded?: boolean;
}) {
  if (!movers.length) return null;
  const stockFlex = isMostTraded ? 1.7 : 1.4;
  const volumeFlex = isMostTraded ? 1.15 : 0.9;

  return (
    <View
      style={[
        s.moverCard,
        isMostTraded && s.featuredMoverCard,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      <View style={s.moverHeader}>
        <View style={[s.moverIconBg, { backgroundColor: accentColor + "15" }]}>
          <FontAwesome name={icon} size={13} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Text style={[s.moverSubtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {isCompact ? (
        movers.map((m, i) => {
          const chg = changeColor(m.changePercent, colors);
          return (
            <View
              key={m.symbol}
              style={[
                s.moverItemCard,
                {
                  backgroundColor: i % 2 === 0 ? colors.bgSecondary + "50" : colors.bgPrimary,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <View style={s.moverItemTop}>
                <View style={s.stockCell}>
                  {isMostTraded && (
                    <View style={[s.rankBadge, { backgroundColor: accentColor + "16" }]}>
                      <Text style={[s.rankBadgeText, { color: accentColor }]}>{i + 1}</Text>
                    </View>
                  )}
                  <View style={s.stockTextWrap}>
                    <Text style={[s.tableSymbolText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {m.symbol}
                    </Text>
                    <Text style={[s.miniMetaText, { color: colors.textMuted }]}>{subtitle}</Text>
                  </View>
                </View>
                <Text style={[s.tablePriceText, { color: colors.textPrimary }]}>{fmt(m.last, 0)}</Text>
              </View>
              <View style={s.moverItemBottom}>
                <View style={[s.changePill, s.changePillLarge, { backgroundColor: chg + "12" }]}>
                  <Text style={[s.changePillText, { color: chg }]}>
                    {changePrefix(m.changePercent)}
                    {fmt(m.changePercent)}%
                  </Text>
                </View>
                <View style={[s.metricPill, { backgroundColor: colors.bgSecondary + "80" }]}>
                  <Text style={[s.metricLabel, { color: colors.textMuted }]}>{t("market.volume")}</Text>
                  <Text style={[s.metricValue, { color: isMostTraded ? accentColor : colors.textPrimary }]}>
                    {fmtCompact(m.volume)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <>
          <View style={[s.tableRow, s.tableHeaderRow, isMostTraded && s.tableHeaderFeatured]}>
            <View style={[s.colStock, { flex: stockFlex }]}>
              <Text style={[s.colHeaderText, { color: colors.textMuted }]}>{t("market.stock")}</Text>
            </View>
            <View style={s.colPrice}>
              <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>{t("market.price")}</Text>
            </View>
            <View style={s.colChange}>
              <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>{t("market.change")}</Text>
            </View>
            <View style={[s.colVolume, { flex: volumeFlex }]}>
              <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>{t("market.volume")}</Text>
            </View>
          </View>
          {movers.map((m, i) => {
            const chg = changeColor(m.changePercent, colors);
            return (
              <View
                key={m.symbol}
                style={[
                  s.tableRow,
                  isWide && s.tableRowWide,
                  i % 2 === 0 && { backgroundColor: colors.bgSecondary + "40" },
                ]}
              >
                <View style={[s.colStock, { flex: stockFlex }]}>
                  <View style={s.stockCell}>
                    {isMostTraded && (
                      <View style={[s.rankBadge, { backgroundColor: accentColor + "16" }]}>
                        <Text style={[s.rankBadgeText, { color: accentColor }]}>{i + 1}</Text>
                      </View>
                    )}
                    <View style={s.stockTextWrap}>
                      <Text style={[s.tableSymbolText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {m.symbol}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={s.colPrice}>
                  <Text style={[s.tablePriceText, { color: colors.textPrimary, textAlign: "right" }]}>
                    {fmt(m.last, 0)}
                  </Text>
                </View>
                <View style={[s.colChange, { alignItems: "flex-end" }]}>
                  <View style={[s.changePill, s.changePillLarge, { backgroundColor: chg + "12" }]}>
                    <Text style={[s.changePillText, { color: chg }]}>
                      {changePrefix(m.changePercent)}
                      {fmt(m.changePercent)}%
                    </Text>
                  </View>
                </View>
                <View style={[s.colVolume, { flex: volumeFlex, alignItems: "flex-end" }]}>
                  {isMostTraded ? (
                    <View style={[s.metricPill, { backgroundColor: accentColor + "12" }]}>
                      <Text style={[s.metricLabel, { color: colors.textMuted }]}>{t("market.volume")}</Text>
                      <Text style={[s.metricValue, { color: accentColor }]}>{fmtCompact(m.volume)}</Text>
                    </View>
                  ) : (
                    <Text style={[s.tableVolumeText, { color: colors.textSecondary, textAlign: "right" }]}>
                      {fmtCompact(m.volume)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function SectorTable({
  sectors,
  colors,
  t,
  isCompact,
}: {
  sectors: SectorIndex[];
  colors: AppColors;
  t: (key: string) => string;
  isCompact: boolean;
}) {
  if (!sectors.length) return null;
  // Sort: biggest gainers first, then losers
  const sorted = [...sectors].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return (
    <View style={[s.moverCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}> 
      <View style={s.moverHeader}>
        <View style={[s.moverIconBg, { backgroundColor: colors.accentPrimary + "15" }]}>
          <FontAwesome name="th-large" size={13} color={colors.accentPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            {t("market.sectorPerformance")}
          </Text>
          <Text style={[s.moverSubtitle, { color: colors.textMuted }]}>
            {t("market.sectorSubtitle")}
          </Text>
        </View>
      </View>
      {isCompact ? (
        sorted.map((sec, i) => {
          const chg = changeColor(sec.changePercent, colors);
          return (
            <View
              key={sec.name}
              style={[
                s.moverItemCard,
                {
                  backgroundColor: i % 2 === 0 ? colors.bgSecondary + "50" : colors.bgPrimary,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <View style={s.moverItemTop}>
                <View style={s.stockTextWrap}>
                  <Text style={[s.tableSymbolText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sec.name}
                  </Text>
                  <Text style={[s.miniMetaText, { color: colors.textMuted }]}>{t("market.sector")}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.metricLabel, { color: colors.textMuted }]}>{t("market.index")}</Text>
                  <Text style={[s.tablePriceText, { color: colors.textPrimary }]}>{fmt(sec.last)}</Text>
                </View>
              </View>
              <View style={s.moverItemBottom}>
                <View style={[s.changePill, s.changePillLarge, { backgroundColor: chg + "12" }]}>
                  <Text style={[s.changePillText, { color: chg }]}>
                    {changePrefix(sec.changePercent)}
                    {fmt(sec.changePercent)}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <>
          <View style={[s.tableRow, s.tableHeaderRow]}>
            <View style={s.colSector}>
              <Text style={[s.colHeaderText, { color: colors.textMuted }]}>{t("market.sector")}</Text>
            </View>
            <View style={s.colChange}>
              <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>{t("market.change")}</Text>
            </View>
            <View style={s.colIndex}>
              <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>{t("market.index")}</Text>
            </View>
          </View>
          {sorted.map((sec, i) => {
            const chg = changeColor(sec.changePercent, colors);
            return (
              <View
                key={sec.name}
                style={[
                  s.tableRow,
                  i % 2 === 0 && { backgroundColor: colors.bgSecondary + "40" },
                ]}
              >
                <View style={s.colSector}>
                  <Text style={[s.tableSymbolText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sec.name}
                  </Text>
                </View>
                <View style={[s.colChange, { alignItems: "flex-end" }]}>
                  <View style={[s.changePill, s.changePillLarge, { backgroundColor: chg + "12" }]}>
                    <Text style={[s.changePillText, { color: chg }]}>
                      {changePrefix(sec.changePercent)}
                      {fmt(sec.changePercent)}%
                    </Text>
                  </View>
                </View>
                <View style={s.colIndex}>
                  <Text style={[s.tablePriceText, { color: colors.textSecondary, textAlign: "right" }]}>
                    {fmt(sec.last)}
                  </Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default withErrorBoundary(function MarketScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, isPhone, isTablet, spacing, maxContentWidth } = useResponsive();
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useMarketSummary();
  const refreshMarket = useMarketRefresh();
  const { t } = useTranslation();
  const isWide = isDesktop || isTablet;
  const isManualRefreshing = refreshMarket.isPending;

  const onRefresh = useCallback(async () => {
    try {
      await refreshMarket.mutateAsync();
    } catch {
      await refetch();
    }
  }, [refreshMarket, refetch]);

  if (isLoading) {
    return <MarketSkeleton />;
  }

  if (isError || !data) {
    return <ErrorScreen message={t("market.marketUnavailable")} onRetry={refetch} />;
  }

  const premierIndex = data.indices.find((idx) => idx.name === "Premier Market");
  const mainIndex = data.indices.find((idx) => idx.name === "Main Market");
  const summary = data.market_summary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        s.scrollContent,
        { maxWidth: maxContentWidth, alignSelf: "center", width: "100%", padding: spacing.pagePx },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isManualRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.accentPrimary}
          colors={[colors.accentPrimary]}
        />
      }
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.screenTitle, { color: colors.textPrimary }]}>
            {t("market.title")}
          </Text>
          <View style={s.headerMeta}>
            <View style={[s.statusDot, { backgroundColor: data.status === "open" ? colors.success : colors.danger }]} />
            <Text style={[s.headerDate, { color: colors.textMuted }]}>
              {data.status === "open" ? t("market.marketOpen") : t("market.marketClosed")} · {data.date || "—"}
            </Text>
          </View>
          <LastUpdated timestamp={dataUpdatedAt} isFetching={isFetching} />
        </View>
        <Pressable
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel={t("market.refresh", "Refresh market data")}
          accessibilityState={{ disabled: isManualRefreshing }}
          style={[s.refreshBtn, { backgroundColor: colors.accentPrimary + "15" }]}
          disabled={isManualRefreshing}
        >
          <FontAwesome
            name="refresh"
            size={16}
            color={colors.accentPrimary}
            style={isManualRefreshing ? { opacity: 0.4 } : undefined}
          />
        </Pressable>
      </View>

      {data._stale && (
        <View style={[s.staleBanner, { backgroundColor: "#f59e0b20" }]}>
          <FontAwesome name="clock-o" size={14} color="#f59e0b" />
          <Text style={{ color: "#f59e0b", marginLeft: 6, fontSize: 12 }}>
            {t("market.staleData")}
          </Text>
        </View>
      )}

      {/* ── Index Cards Row ── */}
      {isWide ? (
        <View style={s.indexGrid}>
          {data.indices.map((idx) => (
            <IndexCard key={idx.name} index={idx} colors={colors} isCompact={false} />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.indexRow}
        >
          {data.indices.map((idx) => (
            <IndexCard key={idx.name} index={idx} colors={colors} isCompact={isPhone} />
          ))}
        </ScrollView>
      )}

      {/* ── Today's Summary ── */}
      <SummaryCard summary={summary} colors={colors} t={t} isCompact={isPhone} />

      {/* ── Premier & Main Market Detail Cards ── */}
      <View style={[s.detailRow, isWide && { flexDirection: "row", gap: 16 }]}>
        {data.premier_summary && (
          <MarketDetailCard
            title={t("market.premierMarket")}
            icon="diamond"
            index={premierIndex}
            perMarket={data.premier_summary}
            totalSummary={summary}
            colors={colors}
            t={t}
            isCompact={isPhone}
          />
        )}
        {data.main_summary && (
          <MarketDetailCard
            title={t("market.mainMarket")}
            icon="building"
            index={mainIndex}
            perMarket={data.main_summary}
            totalSummary={summary}
            colors={colors}
            t={t}
            isCompact={isPhone}
          />
        )}
      </View>

      {/* ── Market Mood ── */}
      <GainersLosersBar
        gainers={summary.gainers ?? 0}
        neutral={summary.neutral ?? 0}
        losers={summary.losers ?? 0}
        colors={colors}
        t={t}
        isCompact={isPhone}
      />

      {/* ── Top movers (side by side on desktop) ── */}
      <View style={[s.moversRow, isWide && { flexDirection: "row", gap: 16 }]}>
        <MoverTable
          title={t("market.topRisers")}
          subtitle={t("market.risersSubtitle")}
          movers={data.top_gainers}
          icon="arrow-up"
          accentColor={colors.success}
          colors={colors}
          t={t}
          isCompact={isPhone}
          isWide={isWide}
        />
        <MoverTable
          title={t("market.biggestDrops")}
          subtitle={t("market.dropsSubtitle")}
          movers={data.top_losers}
          icon="arrow-down"
          accentColor={colors.danger}
          colors={colors}
          t={t}
          isCompact={isPhone}
          isWide={isWide}
        />
      </View>

      {/* ── Most Traded ── */}
      <MoverTable
        title={t("market.mostTraded")}
        subtitle={t("market.tradedSubtitle")}
        movers={data.top_value}
        icon="money"
        accentColor={colors.accentPrimary}
        colors={colors}
        t={t}
        isCompact={isPhone}
        isWide={isWide}
        isMostTraded
      />

      {/* ── Sector Performance ── */}
      <SectorTable sectors={data.sectors} colors={colors} t={t} isCompact={isPhone} />

      {/* Footer spacing */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}, "Unable to load Market. Please try again.");

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerDate: {
    fontSize: 14,
    fontWeight: "500",
  },
  refreshBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },

  /* Section label (uppercase, matches Overview tab) */
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  /* Index cards */
  indexRow: {
    gap: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  indexGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  indexCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 155,
    flexGrow: 1,
  },
  indexName: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  indexValue: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  changeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changePct: {
    fontSize: 14,
    fontWeight: "800",
  },

  /* Summary card */
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 12,
  },
  summaryRowCompact: {
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
  },
  summaryItemCard: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 112,
  },
  summaryItemCompact: {
    flexBasis: "48%",
  },
  summaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  summaryDivider: {
    width: 1,
    height: 36,
    opacity: 0.5,
  },

  /* Market detail cards (Premier / Main) */
  detailRow: {
    marginBottom: 16,
  },
  detailCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
    flex: 1,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  detailIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  detailChangeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  detailStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  detailStatsCompact: {
    flexWrap: "wrap",
    rowGap: 12,
    justifyContent: "space-between",
  },
  detailStatItem: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
  },
  detailStatItemCompact: {
    flexBasis: "48%",
    alignItems: "flex-start",
  },
  detailStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  detailStatValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  detailPct: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },

  /* Gainers/Losers bar */
  glCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 18,
  },
  glSubtitle: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
  },
  glBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 10,
  },
  glSegment: {
    height: "100%",
  },
  glLabels: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  glLabelsCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  glLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  glDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  glLabelText: {
    fontSize: 12,
    fontWeight: "700",
  },
  glPctText: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },

  /* Mover / Sector tables */
  moversRow: {
    gap: 12,
    marginBottom: 8,
  },
  moverCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  featuredMoverCard: {
    padding: 16,
  },
  moverHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  moverIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  moverSubtitle: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },

  /* Table grid — View-based cells for reliable alignment */
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 10,
  },
  tableRowWide: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tableHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.15)",
    marginBottom: 6,
    paddingVertical: 10,
  },
  tableHeaderFeatured: {
    marginBottom: 6,
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  /* Mover table columns */
  colStock: {
    flex: 1.4,
    minWidth: 0,
  },
  colPrice: {
    flex: 0.9,
    minWidth: 0,
  },
  colChange: {
    flex: 1.0,
    minWidth: 0,
  },
  colVolume: {
    flex: 0.9,
    minWidth: 0,
  },

  /* Sector table columns */
  colSector: {
    flex: 2,
    minWidth: 0,
  },
  colIndex: {
    flex: 1,
    minWidth: 0,
  },

  changePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changePillLarge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  changePillText: {
    fontSize: 15,
    fontWeight: "800",
  },
  stockCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  stockTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tableSymbolText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tablePriceText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tableVolumeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  miniMetaText: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  moverItemCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  moverItemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  moverItemBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rankBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  metricPill: {
    minWidth: 108,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "flex-end",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
});
