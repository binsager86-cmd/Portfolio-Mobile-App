/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * StockRow — information-dense, trader-focused scanner row.
 *
 * ┌──────────┬──────────────────────────────────┬──────────┐
 * │  RATING  │ TICKER  ·  [STAGE TAG]            │  63%     │
 * │  BADGE   │ Company name (truncated, 1 line)  │ ████████░│
 * │          │ Entry 317 · SL 298 · TP1 348 · RR │          │
 * └──────────┴──────────────────────────────────┴──────────┘
 */
import { UITokens } from "@/constants/uiTokens";
import { getRatingColors } from "@/constants/eagleEyeColors";
import {
  cleanCompanyName,
  getRatingConfidenceDescription,
} from "@/constants/eagleEyeStrings";
import { useThemeStore } from "@/services/themeStore";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RatedStock } from "@/hooks/useEagleEye";
import { useEagleEyeStock } from "@/hooks/useEagleEye";
import { BadgeHelpTooltip } from "./BadgeHelpTooltip";
import { RatingBadge } from "./RatingBadge";
import { StageTag } from "./StageTag";
import { MLBandBadge } from "./MLBandBadge";
import type { MLBandLabel } from "./MLBandBadge";
import { getActionInterpretation } from "./actionInterpretation";

export const STOCK_TABLE_COL_WIDTHS = {
  rating: 80,
  ticker: 88,
  stage: 104,
  action: 220,
  volume: 98,
  current: 88,
  entry: 84,
  tp1: 84,
  bvps: 84,
  pe: 68,
  rr: 68,
  yesterdayConfidence: 72,
  liveConfidence: 72,
} as const;

export const STOCK_TABLE_TOTAL_WIDTH =
  UITokens.spacing.md * 2
  + STOCK_TABLE_COL_WIDTHS.rating
  + STOCK_TABLE_COL_WIDTHS.ticker
  + STOCK_TABLE_COL_WIDTHS.stage
  + STOCK_TABLE_COL_WIDTHS.action
  + STOCK_TABLE_COL_WIDTHS.volume
  + STOCK_TABLE_COL_WIDTHS.current
  + STOCK_TABLE_COL_WIDTHS.entry
  + STOCK_TABLE_COL_WIDTHS.tp1
  + STOCK_TABLE_COL_WIDTHS.bvps
  + STOCK_TABLE_COL_WIDTHS.pe
  + STOCK_TABLE_COL_WIDTHS.rr
  + STOCK_TABLE_COL_WIDTHS.yesterdayConfidence
  + STOCK_TABLE_COL_WIDTHS.liveConfidence;

type StockRowVariant = "default" | "table";

interface StockRowProps {
  item: RatedStock;
  isFirst?: boolean;
  variant?: StockRowVariant;
}

interface StockRowSkeletonProps {
  variant?: StockRowVariant;
}

function fmt(n: number | null | undefined, dec = 3): string {
  return n != null ? n.toFixed(dec) : "—";
}

export function computeRR(item: RatedStock): number | null {
  const apiRR = item.risk_reward_ratio;
  if (apiRR != null && Number.isFinite(apiRR)) {
    return Number(apiRR);
  }

  const { entry_primary: e, stop_loss: sl, tp1 } = item;
  if (e != null && sl != null && tp1 != null && e > sl) {
    const risk = e - sl;
    return risk > 0 ? (tp1 - e) / risk : null;
  }
  return null;
}

export const StockRow = React.memo(function StockRow({ item, isFirst = false, variant = "default" }: StockRowProps) {
  const { colors } = useThemeStore();
  const router = useRouter();
  const isTable = variant === "table";
  const { data: liveAnalysis } = useEagleEyeStock(item.ticker, 0, isTable);

  const confPct = Math.min(100, Math.max(0, item.confidence));
  const confColor = confPct >= 75 ? colors.success : confPct >= 60 ? "#E6A817" : colors.textMuted;
  const confidenceHelp = getRatingConfidenceDescription(item.rating, confPct);
  const liveConfidence = useMemo(() => {
    const raw = liveAnalysis?.data?.confidence;
    return Number.isFinite(raw) ? Math.min(100, Math.max(0, Number(raw))) : null;
  }, [liveAnalysis?.data?.confidence]);
  const liveConfColor =
    liveConfidence == null
      ? colors.textMuted
      : liveConfidence >= 75
        ? colors.success
        : liveConfidence >= 60
          ? "#E6A817"
          : colors.textMuted;
  const liveConfidenceHelp =
    liveConfidence == null
      ? "Live confidence is loading from the fresh stock analysis endpoint."
      : getRatingConfidenceDescription(liveAnalysis?.data?.rating ?? item.rating, liveConfidence);
  const ratingColors = getRatingColors(item.rating, colors);
  const leftStripColor =
    item.rating === "SELL" || item.rating === "STRONG_SELL"
      ? colors.danger
      : ratingColors.bg;
  const separatorColor =
    colors.mode === "dark" ? "rgba(255,255,255,0.25)" : "rgba(30,41,59,0.25)";

  const rr = useMemo(() => computeRR(item), [item]);
  const rrText = rr != null ? `1:${rr.toFixed(1)}` : "-";
  const actionInterpretation = useMemo(
    () =>
      getActionInterpretation({
        rating: item.rating,
        continue_rising: item.continue_rising,
        continue_rising_exhaustion_count: item.continue_rising_exhaustion_count,
        risk_warning_score: item.risk_warning_score,
        risky_near_resistance: item.risky_near_resistance,
        risk_reward_ratio: rr,
        close: item.last_price,
        stage: item.stage,
      }),
    [
      item.continue_rising,
      item.continue_rising_exhaustion_count,
      item.risk_warning_score,
      item.last_price,
      item.rating,
      item.risky_near_resistance,
      item.stage,
      rr,
    ]
  );

  const actionColor = useMemo(() => {
    const actionText = actionInterpretation.action.toUpperCase();
    if (actionText.includes("EXIT") || actionText.includes("SKIP") || actionText.includes("AVOID") || actionText.includes("TRIM")) {
      return colors.danger;
    }
    if (actionText.includes("WAIT") || actionText.includes("HOLD") || actionText.includes("STAND ASIDE") || actionText.includes("SMALL")) {
      return colors.warning;
    }
    if (actionText.includes("ENTER") || actionText.includes("ADD")) {
      return colors.success;
    }
    return colors.textSecondary;
  }, [actionInterpretation.action, colors.danger, colors.success, colors.textSecondary, colors.warning]);

  const volumeCell = useMemo(() => {
    const vc = item.volume_context;
    if (!vc) {
      return { label: "-", color: colors.textMuted };
    }

    const rv = Number.isFinite(vc.relative_volume) ? vc.relative_volume : 0;
    const rvText = `${rv.toFixed(1)}x`;
    const isHigh =
      vc.liquidity_tier === "TRADEABLE" && vc.is_volume_confirmed && rv >= 1.5;
    const isLow =
      vc.liquidity_tier !== "TRADEABLE" || !vc.is_volume_confirmed || rv < 1;

    if (isHigh) {
      return { label: `High ${rvText}`, color: colors.success };
    }
    if (isLow) {
      return { label: `Low ${rvText}`, color: "#E6A817" };
    }
    return { label: `Mid ${rvText}`, color: colors.textSecondary };
  }, [item.volume_context, colors.textMuted, colors.success, colors.textSecondary]);

  if (isTable) {
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(tabs)/eagle-eye/[ticker]",
            params: { ticker: item.ticker },
          })
        }
        android_ripple={{ color: colors.bgCardHover }}
        style={({ pressed, hovered }: any) => [
          styles.tableRow,
          {
            backgroundColor: pressed || hovered ? colors.bgCardHover : colors.bgCard,
            borderTopColor: separatorColor,
            borderTopWidth: isFirst ? 0 : 0.5,
          },
        ]}
        accessibilityLabel={`${item.ticker} ${item.rating}`}
      >
        <View style={[styles.leftStrip, { backgroundColor: leftStripColor }]} />

        <View style={styles.tableCellRating}>
          <View style={styles.badgeStack}>
            <RatingBadge rating={item.rating} size="sm" />
            {item.continue_rising && item.continue_rising_badge ? (
              <RatingBadge rating={item.continue_rising_badge} size="sm" />
            ) : null}
          </View>
        </View>

        <View style={styles.tableCellTicker}>
          <Text style={[styles.tableTickerText, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.ticker}
          </Text>
        </View>

        <View style={styles.tableCellStage}>
          <StageTag stage={item.stage} size="sm" />
        </View>

        <View style={styles.tableCellAction}>
          <Text style={[styles.tableActionText, { color: actionColor }]} numberOfLines={2} ellipsizeMode="tail">
            {actionInterpretation.action}
          </Text>
        </View>

        <View style={styles.tableCellVolume}>
          <Text style={[styles.tableVolumeText, { color: volumeCell.color }]} numberOfLines={1}>
            {volumeCell.label}
          </Text>
        </View>

        <View style={styles.tableCellCurrent}>
          <Text
            style={[
              styles.tableNumText,
              { color: item.last_price != null ? colors.textPrimary : colors.textMuted },
            ]}
          >
            {item.last_price != null ? fmt(item.last_price) : "N/A"}
          </Text>
        </View>

        <View style={styles.tableCellEntry}>
          <Text style={[styles.tableNumText, { color: colors.textPrimary }]}>
            {fmt(item.entry_primary)}
          </Text>
        </View>

        <View style={styles.tableCellTP1}>
          <Text style={[styles.tableNumText, { color: colors.success }]}>
            {fmt(item.tp1)}
          </Text>
        </View>

        <View style={styles.tableCellBVPS}>
          <Text
            style={[
              styles.tableNumText,
              { color: item.book_value_per_share != null ? colors.textPrimary : colors.textMuted },
            ]}
          >
            {item.book_value_per_share != null ? fmt(item.book_value_per_share) : "N/A"}
          </Text>
        </View>

        <View style={styles.tableCellPE}>
          <Text
            style={[
              styles.tableNumText,
              { color: item.pe_ratio != null ? colors.textPrimary : colors.textMuted },
            ]}
          >
            {item.pe_ratio != null ? fmt(item.pe_ratio, 2) : "N/A"}
          </Text>
        </View>

        <View style={styles.tableCellRR}>
          <Text
            style={[
              styles.tableNumText,
              {
                color: item.risky_near_resistance
                  ? colors.danger
                  : rr != null
                    ? colors.textPrimary
                    : colors.textMuted,
              },
            ]}
          >
            {item.risky_near_resistance ? `${rrText}!` : rrText}
          </Text>
        </View>

        <View style={styles.tableCellConfidence}>
          <BadgeHelpTooltip
            title={`${confPct.toFixed(0)}% Yesterday Confidence`}
            body={confidenceHelp}
            align="right"
          >
            <Text style={[styles.tableNumText, { color: confColor }]}>{`${confPct.toFixed(0)}%`}</Text>
          </BadgeHelpTooltip>
        </View>

        <View style={styles.tableCellConfidence}>
          <BadgeHelpTooltip
            title={liveConfidence == null ? "Live confidence loading" : `${liveConfidence.toFixed(0)}% Live Confidence`}
            body={liveConfidenceHelp}
            align="right"
          >
            <Text style={[styles.tableNumText, { color: liveConfColor }]}>
              {liveConfidence == null ? "--" : `${liveConfidence.toFixed(0)}%`}
            </Text>
          </BadgeHelpTooltip>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(tabs)/eagle-eye/[ticker]",
          params: { ticker: item.ticker },
        })
      }
      android_ripple={{ color: colors.bgCardHover }}
      style={({ pressed, hovered }: any) => [
        styles.row,
        {
          backgroundColor:
            pressed || hovered ? colors.bgCardHover : colors.bgCard,
          borderTopColor: separatorColor,
          borderTopWidth: isFirst ? 0 : 0.5,
        },
      ]}
      accessibilityLabel={`${item.ticker} ${item.rating}`}
    >
      <View style={[styles.leftStrip, { backgroundColor: leftStripColor }]} />

      {/* ── Rating badge column ─────────────────────────────── */}
      <View style={styles.badgeCol}>
        <View style={styles.badgeStack}>
          <RatingBadge rating={item.rating} size="sm" />
          {item.continue_rising && item.continue_rising_badge ? (
            <RatingBadge rating={item.continue_rising_badge} size="sm" />
          ) : null}
        </View>
      </View>

      {/* ── Content column ──────────────────────────────────── */}
      <View style={styles.contentCol}>
        {/* Row 1: ticker + stage tag */}
        <View style={styles.titleRow}>
          <Text
            style={[styles.ticker, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.ticker}
          </Text>
          <StageTag stage={item.stage} size="sm" />
        </View>

        {/* Row 2: company name */}
        <Text
          style={[styles.name, { color: colors.textMuted }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {cleanCompanyName(item.name_en)}
        </Text>

        {/* Row 3: color-coded trading data */}
        {(item.entry_primary != null ||
          item.stop_loss != null ||
          item.tp1 != null) && (
          <Text style={styles.tradeBase} numberOfLines={1} ellipsizeMode="tail">
            {item.entry_primary != null && (
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                {`Entry ${fmt(item.entry_primary)}`}
              </Text>
            )}
            {item.stop_loss != null && (
              <Text style={{ fontSize: 11 }}>
                <Text style={{ color: colors.textMuted }}>{`  ·  `}</Text>
                <Text
                  style={{ color: colors.danger }}
                >{`SL ${fmt(item.stop_loss)}`}</Text>
              </Text>
            )}
            {item.tp1 != null && (
              <Text style={{ fontSize: 11 }}>
                <Text style={{ color: colors.textMuted }}>{`  ·  `}</Text>
                <Text
                  style={{ color: colors.success }}
                >{`TP1 ${fmt(item.tp1)}`}</Text>
              </Text>
            )}
            {rr != null && (
              <Text style={{ fontSize: 11 }}>
                <Text style={{ color: colors.textMuted }}>{`  ·  `}</Text>
                <Text style={{ color: item.risky_near_resistance ? colors.danger : colors.textSecondary }}>
                  {`R:R 1:${rr.toFixed(1)}`}
                </Text>
              </Text>
            )}
            {item.risky_near_resistance && (
              <Text style={{ fontSize: 11 }}>
                <Text style={{ color: colors.textMuted }}>{`  ·  `}</Text>
                <Text style={{ color: colors.danger }}>{`Risky`}</Text>
              </Text>
            )}
          </Text>
        )}

        {/* Row 4: volume indicator */}
        {item.volume_context != null && (() => {
          const vc = item.volume_context!;
          const rv = vc.relative_volume;
          const confirmed = vc.is_volume_confirmed;
          const tier = vc.liquidity_tier;
          const [label, volColor]: [string, string] =
            tier === "ILLIQUID"             ? ["💧 Illiquid", colors.textMuted]
            : tier === "WATCH_ONLY"         ? ["💧 Low liquidity", "#E6A817"]
            : confirmed && rv >= 1.5        ? [`🔥 ${rv.toFixed(1)}× vol`, "#34D399"]
            : !confirmed                    ? [`⚠ Low vol (${rv.toFixed(1)}×)`, "#E6A817"]
            :                                [`${rv.toFixed(1)}× vol`, colors.textMuted];
          return (
            <Text style={{ fontSize: 10, color: volColor, fontVariant: ["tabular-nums"] }}>
              {label}
            </Text>
          );
        })()}

        <View style={styles.confLine}>
          <View
            style={[
              styles.barBg,
              {
                backgroundColor:
                  colors.mode === "dark"
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(100,116,139,0.20)",
              },
            ]}
          >
            <View
              style={[
                styles.barFill,
                { width: `${confPct}%` as any, backgroundColor: confColor },
              ]}
            />
          </View>
          <BadgeHelpTooltip
            title={`${confPct.toFixed(0)}% Confidence`}
            body={confidenceHelp}
            align="right"
          >
            <Text style={[styles.confNum, { color: confColor }]}>{confPct.toFixed(0)}%</Text>
          </BadgeHelpTooltip>
        </View>
      </View>

      {/* ── ML band column ──────────────────────────────────── */}
      <View style={styles.mlCol}>
        <MLBandBadge
          band={(item.ml_band?.band ?? null) as MLBandLabel}
          accessibilityHint={
            item.ml_band?.band
              ? `ML band: ${item.ml_band.band}`
              : "ML not active for this stock"
          }
        />
      </View>
    </Pressable>
  );
});

export function StockRowSkeleton({ variant = "default" }: StockRowSkeletonProps = {}) {
  const { colors } = useThemeStore();
  const sh = { backgroundColor: colors.bgCardHover };

  if (variant === "table") {
    return (
      <View
        style={[
          styles.tableRow,
          { backgroundColor: colors.bgCard, borderTopColor: colors.borderColor },
        ]}
      >
        <View style={[styles.leftStrip, { backgroundColor: colors.borderColor }]} />
        <View style={styles.tableCellRating}>
          <View style={[styles.skelRect, sh, { width: 68, height: 20 }]} />
        </View>
        <View style={styles.tableCellTicker}>
          <View style={[styles.skelRect, sh, { width: 58, height: 12 }]} />
        </View>
        <View style={styles.tableCellStage}>
          <View style={[styles.skelRect, sh, { width: 84, height: 12 }]} />
        </View>
        <View style={styles.tableCellAction}>
          <View style={[styles.skelRect, sh, { width: 92, height: 12 }]} />
        </View>
        <View style={styles.tableCellVolume}>
          <View style={[styles.skelRect, sh, { width: 70, height: 12 }]} />
        </View>
        <View style={styles.tableCellCurrent}>
          <View style={[styles.skelRect, sh, { width: 68, height: 12 }]} />
        </View>
        <View style={styles.tableCellEntry}>
          <View style={[styles.skelRect, sh, { width: 68, height: 12 }]} />
        </View>
        <View style={styles.tableCellTP1}>
          <View style={[styles.skelRect, sh, { width: 68, height: 12 }]} />
        </View>
        <View style={styles.tableCellBVPS}>
          <View style={[styles.skelRect, sh, { width: 64, height: 12 }]} />
        </View>
        <View style={styles.tableCellPE}>
          <View style={[styles.skelRect, sh, { width: 56, height: 12 }]} />
        </View>
        <View style={styles.tableCellRR}>
          <View style={[styles.skelRect, sh, { width: 54, height: 12 }]} />
        </View>
        <View style={styles.tableCellConfidence}>
          <View style={[styles.skelRect, sh, { width: 48, height: 12 }]} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.bgCard, borderTopColor: colors.borderColor },
      ]}
    >
      <View style={[styles.leftStrip, { backgroundColor: colors.borderColor }]} />
      <View style={styles.badgeCol}>
        <View style={[styles.skelRect, sh, { width: 72, height: 22 }]} />
      </View>
      <View style={[styles.contentCol, { gap: 5 }]}>
        <View style={[styles.skelRect, sh, { width: 64, height: 14 }]} />
        <View style={[styles.skelRect, sh, { width: 130, height: 11 }]} />
        <View style={[styles.skelRect, sh, { width: 170, height: 11 }]} />
        <View style={styles.confLine}>
          <View style={[styles.barBg, sh]} />
          <View style={[styles.skelRect, sh, { width: 28, height: 12 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: 7,
    position: "relative",
    overflow: "hidden",
    minHeight: 72,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: 6,
    position: "relative",
    overflow: "hidden",
    width: "100%",
    minWidth: STOCK_TABLE_TOTAL_WIDTH,
    minHeight: 54,
  },
  leftStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 0,
  },
  tableCellRating: {
    width: STOCK_TABLE_COL_WIDTHS.rating,
    paddingRight: 6,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  tableCellTicker: {
    width: STOCK_TABLE_COL_WIDTHS.ticker,
    paddingRight: 6,
  },
  tableCellStage: {
    width: STOCK_TABLE_COL_WIDTHS.stage,
    paddingRight: 6,
  },
  tableCellAction: {
    width: STOCK_TABLE_COL_WIDTHS.action,
    paddingRight: 6,
  },
  tableCellVolume: {
    width: STOCK_TABLE_COL_WIDTHS.volume,
    paddingRight: 6,
  },
  tableCellCurrent: {
    width: STOCK_TABLE_COL_WIDTHS.current,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellEntry: {
    width: STOCK_TABLE_COL_WIDTHS.entry,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellTP1: {
    width: STOCK_TABLE_COL_WIDTHS.tp1,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellBVPS: {
    width: STOCK_TABLE_COL_WIDTHS.bvps,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellPE: {
    width: STOCK_TABLE_COL_WIDTHS.pe,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellRR: {
    width: STOCK_TABLE_COL_WIDTHS.rr,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  tableCellConfidence: {
    width: STOCK_TABLE_COL_WIDTHS.yesterdayConfidence,
    alignItems: "flex-end",
  },
  tableTickerText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  tableStageText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  tableActionText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  tableVolumeText: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  tableNumText: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  badgeCol: {
    width: 84,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingRight: 6,
  },
  badgeStack: {
    gap: 4,
    alignItems: "flex-start",
  },
  contentCol: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ticker: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  name: {
    fontSize: 11,
    maxWidth: "96%",
    flexShrink: 1,
  },
  tradeBase: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  confLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  confNum: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    minWidth: 30,
    textAlign: "right",
  },
  barBg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    borderRadius: 2,
  },
  skelRect: {
    borderRadius: 4,
  },
  mlCol: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
});
