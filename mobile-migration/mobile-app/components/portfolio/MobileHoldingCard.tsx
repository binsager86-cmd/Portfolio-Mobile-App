/**
 * MobileHoldingCard — rich details card for the Holdings (Portfolio
 * Analysis) screen on phones / narrow widths.
 *
 * Replaces the previous minimal 5-field card with a professional layout
 * that surfaces the same numbers the desktop 18-column table shows,
 * organised into scannable sections:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  AAPL                          [ 12.4% ]     │  header
 *   │  Apple Inc.                    USD           │
 *   ├──────────────────────────────────────────────┤
 *   │  Market Value                                │  hero
 *   │  KD 1,234.567                                │
 *   │  ▲ +KD 45.2 (+3.8%)                          │
 *   ├──────────────────────────────────────────────┤
 *   │  Quantity 100 │ Avg Cost 150.0 │ Mkt 175.0   │  metric grid
 *   │  Total Cost   │ Unrealized P/L │ Realized P/L│
 *   │  Cash Div.    │ Yield-on-Cost  │ P/E         │
 *   └──────────────────────────────────────────────┘
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { formatCurrency, formatPercent } from "@/lib/currency";
import { pnlColor } from "@/lib/formatting";
import type { Holding } from "@/services/api";

interface Props {
  holding: Holding;
  colors: ThemePalette;
  /** Optional override label for the price/changes currency (defaults to KWD). */
  baseCurrency?: string;
}

function MetricCell({
  label,
  value,
  colors,
  valueColor,
  align = "left",
}: {
  label: string;
  value: string;
  colors: ThemePalette;
  valueColor?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <View style={[styles.metricCell, { alignItems: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }]}>
      <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, { color: valueColor ?? colors.textPrimary }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function MobileHoldingCardImpl({ holding, colors, baseCurrency = "KWD" }: Props) {
  const totalPnlKwd = holding.total_pnl_kwd ?? holding.unrealized_pnl_kwd ?? 0;
  const isGain = totalPnlKwd >= 0;
  const totalPnlColor = pnlColor(totalPnlKwd, colors);
  const pctColor = pnlColor(holding.pnl_pct ?? 0, colors);

  const accentEdge = isGain ? colors.success : colors.danger;

  const fmtMoney = (v: number | null | undefined, ccy = baseCurrency) =>
    v == null ? "—" : formatCurrency(v, ccy);

  const fmtNum = (v: number | null | undefined, fractionDigits = 0) =>
    v == null
      ? "—"
      : v.toLocaleString(undefined, {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        });

  const fmtPct = (v: number | null | undefined) =>
    v == null ? "—" : formatPercent(v);

  const allocationLabel = useMemo(() => {
    const a = holding.allocation_pct;
    if (a == null) return null;
    return `${a.toFixed(1)}%`;
  }, [holding.allocation_pct]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
        },
      ]}
    >
      {/* Accent edge — colored bar on the leading side, indicates gain/loss */}
      <View style={[styles.accentEdge, { backgroundColor: accentEdge }]} />

      {/* ── Header: Symbol / Company / Allocation badge ───────── */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={[styles.symbol, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {holding.symbol}
            </Text>
            <View style={[styles.currencyBadge, { borderColor: colors.borderColor }]}>
              <Text style={[styles.currencyBadgeText, { color: colors.textMuted }]}>
                {holding.currency}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.company, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {holding.company}
          </Text>
        </View>

        {allocationLabel && (
          <View
            style={[
              styles.allocationBadge,
              {
                backgroundColor: colors.accentPrimary + "1F",
                borderColor: colors.accentPrimary + "55",
              },
            ]}
          >
            <Text style={[styles.allocationText, { color: colors.accentPrimary }]}>
              {allocationLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ── Hero: Market Value + Total P/L ─────────────────────── */}
      <View style={[styles.hero, { borderTopColor: colors.borderColor }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
            Market Value
          </Text>
          <Text
            style={[styles.heroValue, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {fmtMoney(holding.market_value_kwd)}
          </Text>
        </View>

        <View style={[styles.pnlPill, { backgroundColor: totalPnlColor + "15", borderColor: totalPnlColor + "55" }]}>
          <FontAwesome
            name={isGain ? "arrow-up" : "arrow-down"}
            size={11}
            color={totalPnlColor}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.pnlPillValue, { color: totalPnlColor }]} numberOfLines={1}>
            {fmtMoney(totalPnlKwd)}
          </Text>
          <Text style={[styles.pnlPillPct, { color: pctColor }]} numberOfLines={1}>
            {(holding.pnl_pct ?? 0) >= 0 ? "+" : ""}
            {(holding.pnl_pct ?? 0).toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* ── Detail grid: 3 columns × 3 rows ────────────────────── */}
      <View style={[styles.gridSection, { borderTopColor: colors.borderColor }]}>
        <View style={styles.gridRow}>
          <MetricCell
            label="Quantity"
            value={fmtNum(holding.shares_qty)}
            colors={colors}
          />
          <MetricCell
            label="Avg Cost"
            value={fmtNum(holding.avg_cost, 3)}
            colors={colors}
            align="center"
          />
          <MetricCell
            label="Mkt Price"
            value={fmtNum(holding.market_price, 3)}
            colors={colors}
            align="right"
          />
        </View>

        <View style={styles.gridRow}>
          <MetricCell
            label="Total Cost"
            value={fmtMoney(holding.total_cost_kwd ?? holding.total_cost)}
            colors={colors}
          />
          <MetricCell
            label="Unrealized"
            value={fmtMoney(holding.unrealized_pnl_kwd)}
            valueColor={pnlColor(holding.unrealized_pnl_kwd ?? 0, colors)}
            colors={colors}
            align="center"
          />
          <MetricCell
            label="Realized"
            value={fmtMoney(holding.realized_pnl)}
            valueColor={pnlColor(holding.realized_pnl ?? 0, colors)}
            colors={colors}
            align="right"
          />
        </View>

        <View style={styles.gridRow}>
          <MetricCell
            label="Cash Div."
            value={fmtMoney(holding.cash_dividends)}
            colors={colors}
          />
          <MetricCell
            label="Yield/Cost"
            value={fmtPct(holding.dividend_yield_on_cost_pct)}
            colors={colors}
            align="center"
          />
          <MetricCell
            label="P/E"
            value={
              holding.pe_ratio == null
                ? "—"
                : holding.pe_ratio.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })
            }
            colors={colors}
            align="right"
          />
        </View>
      </View>
    </View>
  );
}

export const MobileHoldingCard = memo(MobileHoldingCardImpl);

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
  },
  accentEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  // Header ----------------------------------------------------------
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  symbol: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  currencyBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  currencyBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  company: {
    fontSize: 12,
    marginTop: 2,
  },
  allocationBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allocationText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // Hero ------------------------------------------------------------
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroValue: {
    fontSize: 19,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  pnlPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  pnlPillValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  pnlPillPct: {
    fontSize: 12,
    fontWeight: "700",
  },
  // Grid ------------------------------------------------------------
  gridSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "700",
  },
});
