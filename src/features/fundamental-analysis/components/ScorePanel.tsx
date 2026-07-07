/**
 * ScorePanel — CFA-based composite score display with sub-scores,
 * history, and underlying metrics.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { analysisKeys, useScoreCategoryPreferences, useScoreHistory, useStatements, useStockScore, useUpdateScoreCategoryPreferences, useValuations } from "@/hooks/queries";
import { generateStockSummary, type AISummary } from "@/lib/aiSummaryGenerator";
import type { TableData } from "@/lib/exportAnalysis";
import { showErrorAlert } from "@/lib/errorHandling";
import { calculateMetrics, type CategoryBreakdown, type MetricCategoryScoreKey, type ScoreCategoryPreferences, type ScoreCategoryWeights } from "@/services/api";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import { st } from "../styles";
import { METRIC_CATEGORY_SCORE_ORDER, METRIC_CATEGORY_SCORE_WEIGHTS, SCORE_WEIGHTS, type PanelWithSymbolProps } from "../types";
import { formatScoreDate, INTERPRETATION_SCALE, safeFormatMetric, scoreColor, scoreLabel } from "../utils";
import { Card, ExportBar, FadeIn, NetworkErrorState, SectionHeader } from "./shared";

/** Beginner-friendly 3-word score label (no financial jargon). */
function beginnerScoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Okay";
  if (score >= 40) return "Weak";
  return "Risky";
}

interface ScoreCategoryRow {
  key: string;
  label: string;
  weight: string;
  value: number | null | undefined;
  iconColor: string;
  breakdown?: CategoryBreakdown;
  penaltyPct?: number | null;
  included?: boolean;
}

export const ScorePanel = React.memo(function ScorePanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useStockScore(stockId);
  const historyQ = useScoreHistory(stockId);
  const valuationsQ = useValuations(stockId);
  const stmtQ = useStatements(stockId);
  const categoryPrefsQ = useScoreCategoryPreferences(stockId);
  const updateCategoryPrefs = useUpdateScoreCategoryPreferences(stockId);
  const preferences = useUserPrefsStore((s) => s.preferences);
  const isBeginner = preferences.expertiseLevel === "normal";
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Local mirror of category preferences for instant UI feedback.
  const [localPrefs, setLocalPrefs] = useState<ScoreCategoryPreferences | null>(null);
  React.useEffect(() => {
    if (categoryPrefsQ.data?.preferences) {
      setLocalPrefs(categoryPrefsQ.data.preferences);
    }
  }, [categoryPrefsQ.data?.preferences]);

  // Recalculate metrics for every period in the uploaded statements,
  // then refetch the score / history so any new statement is reflected.
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const seen = new Set<string>();
      const uniquePeriods = (stmtQ.data?.statements ?? [])
        .filter((s) => { if (seen.has(s.period_end_date)) return false; seen.add(s.period_end_date); return true; })
        .map((s) => ({
          period_end_date: s.period_end_date,
          fiscal_year: s.fiscal_year,
          fiscal_quarter: s.fiscal_quarter ?? undefined,
        }));

      const preferredPeriod = stmtQ.data?.latest_preferred?.period_end_date;
      const preferredPeriods = preferredPeriod
        ? uniquePeriods.filter((p) => p.period_end_date === preferredPeriod)
        : [];
      const periods = preferredPeriods.length > 0 ? preferredPeriods : uniquePeriods;

      if (periods.length > 0) {
        const results = await Promise.allSettled(
          periods.map((p) => calculateMetrics(stockId, p)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          showErrorAlert("Partial Refresh", new Error(`${failed}/${periods.length} period calculations failed.`));
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.metrics(stockId) }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.growth(stockId) }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.score(stockId) }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.scoreHistory(stockId) }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.valuations(stockId) }),
      ]);
    } catch (err) {
      showErrorAlert("Refresh Failed", err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, stmtQ.data, stockId, queryClient]);

  const score = data;
  const scoreHistory = historyQ.data?.scores ?? [];
  const valuations = valuationsQ.data?.valuations ?? [];
  const hasMetricCategoryScores = useMemo(
    () => METRIC_CATEGORY_SCORE_ORDER.every((key) => typeof score?.metric_category_scores?.[key] === "number"),
    [score],
  );

  // Pro-rata weights driven by local checkbox state.
  const effectivePrefs = useMemo<ScoreCategoryPreferences>(() => {
    if (localPrefs) return localPrefs;
    if (score?.metric_category_preferences) return score.metric_category_preferences;
    return Object.fromEntries(METRIC_CATEGORY_SCORE_ORDER.map((k) => [k, true])) as ScoreCategoryPreferences;
  }, [localPrefs, score?.metric_category_preferences]);

  const proRataWeights = useMemo<ScoreCategoryWeights>(() => {
    const includedTotal = METRIC_CATEGORY_SCORE_ORDER.reduce(
      (sum, key) => sum + (effectivePrefs[key] ? METRIC_CATEGORY_SCORE_WEIGHTS[key].value : 0),
      0,
    );
    if (includedTotal <= 0) {
      return Object.fromEntries(
        METRIC_CATEGORY_SCORE_ORDER.map((k) => [k, METRIC_CATEGORY_SCORE_WEIGHTS[k].value]),
      ) as ScoreCategoryWeights;
    }
    return Object.fromEntries(
      METRIC_CATEGORY_SCORE_ORDER.map((k) => [
        k,
        effectivePrefs[k] ? METRIC_CATEGORY_SCORE_WEIGHTS[k].value / includedTotal : 0,
      ]),
    ) as ScoreCategoryWeights;
  }, [effectivePrefs]);

  const previewOverallScore = useMemo(() => {
    if (!hasMetricCategoryScores || !score?.metric_category_scores) return null;
    let total = 0;
    for (const key of METRIC_CATEGORY_SCORE_ORDER) {
      total += (score.metric_category_scores[key] ?? 0) * proRataWeights[key];
    }
    return total;
  }, [hasMetricCategoryScores, score?.metric_category_scores, proRataWeights]);

  const displayOverallScore = previewOverallScore ?? score?.overall_score ?? 0;

  const scoreCategoryRows = useMemo<ScoreCategoryRow[]>(() => {
    if (hasMetricCategoryScores && score?.metric_category_scores) {
      return METRIC_CATEGORY_SCORE_ORDER.map((key) => ({
        key,
        label: METRIC_CATEGORY_SCORE_WEIGHTS[key].label,
        weight: `${(proRataWeights[key] * 100).toFixed(0)}%`,
        value: score.metric_category_scores?.[key] ?? null,
        iconColor: METRIC_CATEGORY_SCORE_WEIGHTS[key].iconColor,
        breakdown: score.metric_category_breakdown?.[key],
        included: effectivePrefs[key] ?? true,
      }));
    }

    return [
      { key: "fundamental", label: "Fundamental", weight: SCORE_WEIGHTS.FUNDAMENTAL.label, value: score?.fundamental_score, iconColor: SCORE_WEIGHTS.FUNDAMENTAL.iconColor, breakdown: score?.score_breakdown?.fundamental },
      { key: "quality", label: "Quality", weight: SCORE_WEIGHTS.QUALITY.label, value: score?.quality_score, iconColor: SCORE_WEIGHTS.QUALITY.iconColor, breakdown: score?.score_breakdown?.quality },
      { key: "growth", label: "Growth", weight: SCORE_WEIGHTS.GROWTH.label, value: score?.growth_score, iconColor: SCORE_WEIGHTS.GROWTH.iconColor, breakdown: score?.score_breakdown?.growth },
      { key: "valuation", label: "Valuation", weight: SCORE_WEIGHTS.VALUATION.label, value: score?.valuation_score, iconColor: SCORE_WEIGHTS.VALUATION.iconColor, breakdown: score?.score_breakdown?.valuation },
      { key: "risk", label: "Risk", weight: SCORE_WEIGHTS.RISK.label, value: score?.risk_score, iconColor: SCORE_WEIGHTS.RISK.iconColor, breakdown: score?.score_breakdown?.risk, penaltyPct: score?.risk_penalty_pct },
    ];
  }, [hasMetricCategoryScores, score, proRataWeights, effectivePrefs]);

  const scoreSummaryText = useMemo(() => {
    if (!hasMetricCategoryScores) {
      return `CFA-Based Composite Score\nFundamentals ${SCORE_WEIGHTS.FUNDAMENTAL.label} · Quality ${SCORE_WEIGHTS.QUALITY.label} · Growth ${SCORE_WEIGHTS.GROWTH.label} · Valuation ${SCORE_WEIGHTS.VALUATION.label}\nRisk penalty up to ${SCORE_WEIGHTS.RISK.label}`;
    }

    const active = METRIC_CATEGORY_SCORE_ORDER.filter((key) => effectivePrefs[key]);
    if (active.length === 0) {
      return "Metrics-Aligned Composite Score\nNo categories selected. Enable at least one category to compute a score.";
    }
    const firstLine = active.slice(0, 4)
      .map((key) => `${METRIC_CATEGORY_SCORE_WEIGHTS[key].label} ${(proRataWeights[key] * 100).toFixed(0)}%`)
      .join(" · ");
    const secondLine = active.slice(4)
      .map((key) => `${METRIC_CATEGORY_SCORE_WEIGHTS[key].label} ${(proRataWeights[key] * 100).toFixed(0)}%`)
      .join(" · ");
    return `Metrics-Aligned Composite Score\n${firstLine}${secondLine ? `\n${secondLine}` : ""}`;
  }, [hasMetricCategoryScores, effectivePrefs, proRataWeights]);

  // Average IV across latest per-model valuations (same logic as Valuation Summary)
  const avgIV = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of valuations) {
      if (v.intrinsic_value != null && !map[v.model_type]) {
        map[v.model_type] = v.intrinsic_value;
      }
    }
    const models = Object.values(map);
    return models.length > 0 ? models.reduce((s, x) => s + x, 0) / models.length : null;
  }, [valuations]);

  // AI Summary
  const aiSummary = useMemo((): AISummary | null => {
    if (!score || score.overall_score == null) return null;
    const currentPrice = score.details?.["Current Price"] ?? 0;
    return generateStockSummary(
      stockSymbol,
      currentPrice,
      avgIV,
      {
        fundamental: score.fundamental_score,
        valuation: score.valuation_score,
        growth: score.growth_score,
        quality: score.quality_score,
        risk: score.risk_score,
      },
      preferences,
    );
  }, [score, avgIV, stockSymbol, preferences]);

  const VIRTUALIZE_THRESHOLD = 20;

  const renderHistoryRow = useCallback(({ item: sh, index: idx }: { item: typeof scoreHistory[number]; index: number }) => (
    <View key={sh.id} style={[st.scoreHistRow, { backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
      <Text style={[st.scoreHistCell, { flex: 1, color: colors.textSecondary }]}>{formatScoreDate(sh.scoring_date)}</Text>
      <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: scoreColor(sh.overall_score ?? 0, colors) }]}>
        {sh.overall_score?.toFixed(0) ?? "–"}
      </Text>
      {!hasMetricCategoryScores && (
        <>
          <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>{sh.fundamental_score?.toFixed(0) ?? "–"}</Text>
          <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>{sh.valuation_score?.toFixed(0) ?? "–"}</Text>
          <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>{sh.growth_score?.toFixed(0) ?? "–"}</Text>
          <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>{sh.quality_score?.toFixed(0) ?? "–"}</Text>
          <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>{sh.risk_score?.toFixed(0) ?? "–"}</Text>
        </>
      )}
    </View>
  ), [colors, hasMetricCategoryScores]);

  const exportTables = useCallback((): TableData[] => {
    const tables: TableData[] = [];
    if (score && score.overall_score != null) {
      tables.push({
        title: "Score Summary",
        headers: ["Component", "Weight", "Score"],
        rows: [
          ["Overall", "100%", displayOverallScore.toFixed(0)],
          ...scoreCategoryRows.map((row) => [row.label, row.weight, row.value?.toFixed(0) ?? "–"]),
        ],
      });
    }
    if (scoreHistory.length > 0) {
      tables.push({
        title: "Score History",
        headers: hasMetricCategoryScores ? ["Date", "Overall"] : ["Date", "Overall", "Fundamental", "Valuation", "Growth", "Quality", "Risk"],
        rows: scoreHistory.map((sh) => (
          hasMetricCategoryScores
            ? [formatScoreDate(sh.scoring_date), sh.overall_score?.toFixed(0) ?? "–"]
            : [
                formatScoreDate(sh.scoring_date),
                sh.overall_score?.toFixed(0) ?? "–",
                sh.fundamental_score?.toFixed(0) ?? "–",
                sh.valuation_score?.toFixed(0) ?? "–",
                sh.growth_score?.toFixed(0) ?? "–",
                sh.quality_score?.toFixed(0) ?? "–",
                sh.risk_score?.toFixed(0) ?? "–",
              ]
        )),
      });
    }
    if (score?.details && Object.keys(score.details).length > 0) {
      tables.push({
        title: "Underlying Metrics",
        headers: ["Metric", "Value"],
        rows: Object.entries(score.details).map(([name, val]) => [
          name,
          safeFormatMetric(name, val),
        ]),
      });
    }
    return tables;
  }, [hasMetricCategoryScores, score, scoreCategoryRows, scoreHistory]);

  // Toggle a category on/off and persist the preference.
  const handleToggleCategory = useCallback((key: MetricCategoryScoreKey) => {
    setLocalPrefs((prev) => {
      const next = { ...(prev ?? (score?.metric_category_preferences as ScoreCategoryPreferences | undefined) ?? Object.fromEntries(METRIC_CATEGORY_SCORE_ORDER.map((k) => [k, true])) as ScoreCategoryPreferences) };
      next[key] = !next[key];
      // Prevent disabling every category.
      if (!Object.values(next).some(Boolean)) {
        next[key] = true;
        return next;
      }
      updateCategoryPrefs.mutate(
        METRIC_CATEGORY_SCORE_ORDER.map((k) => ({ category_key: k, included: next[k] })),
      );
      return next;
    });
  }, [score?.metric_category_preferences, updateCategoryPrefs]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {isLoading ? (
        <FAPanelSkeleton />
      ) : isError ? (
        <NetworkErrorState error={error} onRetry={refetch} colors={colors} />
      ) : !score || score.overall_score == null ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="star-o" size={32} color={colors.warning} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>
            {score?.error ?? "No score available"}
          </Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Calculate metrics first, then compute the score.</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 2 }}>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing || isFetching}
              accessibilityRole="button"
              accessibilityLabel="Refresh score"
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 6,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                borderWidth: 1, borderColor: colors.accentPrimary,
                backgroundColor: colors.accentPrimary + (pressed ? "22" : "10"),
                opacity: refreshing || isFetching ? 0.6 : 1,
              })}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              ) : (
                <FontAwesome name="refresh" size={12} color={colors.accentPrimary} />
              )}
              <Text style={{ color: colors.accentPrimary, fontSize: 12, fontWeight: "700" }}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </Text>
            </Pressable>
            <ExportBar
              onExport={async (fmt) => {
                const { exportExcel, exportCSV, exportPDF } = await import("@/lib/exportAnalysis");
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Score");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Score");
                else await exportPDF(t, stockSymbol, "Score", aiSummary);
              }}
              colors={colors}
            />
          </View>

          {/* AI Summary Card */}
          {aiSummary && (
            <FadeIn>
              <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 16, paddingHorizontal: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Text style={{ fontSize: 20, marginRight: 8 }}>{aiSummary.emoji}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 }}>
                    {aiSummary.headline}
                  </Text>
                </View>
                {aiSummary.bullets.map((b, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4, paddingLeft: 4 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginRight: 6 }}>{"\u2022"}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>{b}</Text>
                  </View>
                ))}
                {aiSummary.actionHint && (
                  <View style={{ marginTop: 8, backgroundColor: colors.accentPrimary + "14", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
                      {"\u27A4"} {aiSummary.actionHint}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderColor + "40" }}>
                  <View style={{
                    width: 8, height: 8, borderRadius: 4, marginRight: 6,
                    backgroundColor: aiSummary.riskLevel === "low" ? colors.success : aiSummary.riskLevel === "high" ? colors.danger : colors.warning,
                  }} />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Risk: {aiSummary.riskLevel.charAt(0).toUpperCase() + aiSummary.riskLevel.slice(1)}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          )}

          {/* Overall Score */}
          <FadeIn>
            <Card colors={colors} style={{ alignItems: "center", paddingVertical: 28, marginBottom: 16 }}>
              <View style={[st.scoreRing, { borderColor: scoreColor(displayOverallScore, colors) }]}>
                <View style={[st.scoreRingInner, { backgroundColor: scoreColor(displayOverallScore, colors) + "10" }]}>
                  <Text style={[st.scoreNum, { color: scoreColor(displayOverallScore, colors) }]}>
                    {displayOverallScore.toFixed(0)}
                  </Text>
                </View>
              </View>

              {previewOverallScore != null && score?.overall_score != null && Math.abs(previewOverallScore - score.overall_score) > 0.05 && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: colors.accentPrimary + "14", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <FontAwesome name="refresh" size={10} color={colors.accentPrimary} style={{ marginRight: 6 }} />
                  <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>
                    Preview: weights changed
                  </Text>
                </View>
              )}

              {isBeginner ? (
                <>
                  {/* Beginner: simple 3-word label */}
                  <Text style={{ color: scoreColor(displayOverallScore, colors), fontSize: 22, fontWeight: "800", marginTop: 14 }}>
                    {beginnerScoreLabel(displayOverallScore)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
                    Overall health of this stock
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 14 }}>
                    {scoreLabel(displayOverallScore)}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
                    {scoreSummaryText}
                  </Text>
                </>
              )}

              {/* Sector Percentile (when available from API) */}
              {score.sector_percentile != null && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor + "40", alignItems: "center" }}>
                  <Text style={{ color: colors.accentSecondary, fontSize: 13, fontWeight: "700" }}>
                    Top {Math.max(1, 100 - Math.round(score.sector_percentile))}% in {score.sector_name ?? "Sector"}
                  </Text>
                  {!isBeginner && (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>Peer-relative ranking</Text>
                  )}
                </View>
              )}

              {/* Risk disclaimer */}
              {!isBeginner && (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: "center", lineHeight: 16 }}>
                  {hasMetricCategoryScores ? "Built from the same ratio families shown on the Metrics tab." : "Legacy five-pillar score shown for compatibility."}{"\n"}
                  Past performance ≠ future results.
                </Text>
              )}
            </Card>
          </FadeIn>

          {/* Intrinsic Value vs Current Price (from Valuation Summary avg) */}
          {(() => {
            const iv = avgIV;
            const cp = score.details?.["Current Price"];
            if (iv == null || cp == null || iv <= 0 || cp <= 0) return null;
            const disc = ((iv - cp) / iv) * 100;
            const isUndervalued = disc > 0;
            const absDisc = Math.abs(disc);
            const verdictColor = disc > 10 ? colors.success : disc < -10 ? colors.danger : colors.warning;
            const verdict = disc > 20 ? "Undervalued" : disc > 10 ? "Slightly Undervalued" : disc > -10 ? "Fairly Valued" : disc > -20 ? "Slightly Overvalued" : "Overvalued";
            return (
              <FadeIn delay={40}>
                <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 18, paddingHorizontal: 18 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 14 }}>
                    Intrinsic Value vs Current Price
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ alignItems: "center", flex: 1 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Intrinsic Value</Text>
                      <Text style={{ color: colors.accentPrimary, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                        ${iv.toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 16 }}>vs</Text>
                    </View>
                    <View style={{ alignItems: "center", flex: 1 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Current Price</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                        ${cp.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "center", backgroundColor: verdictColor + "14", borderRadius: 10, paddingVertical: 10 }}>
                    <Text style={{ color: verdictColor, fontSize: 18, fontWeight: "800" }}>
                      {isUndervalued ? "▼" : "▲"} {absDisc.toFixed(1)}% {isUndervalued ? "Discount" : "Premium"}
                    </Text>
                    <Text style={{ color: verdictColor, fontSize: 13, fontWeight: "600", marginTop: 2 }}>
                      {verdict}
                    </Text>
                  </View>
                </Card>
              </FadeIn>
            );
          })()}

          {/* Interpretation Scale */}
          {(!isBeginner || showAdvanced) && (
          <FadeIn delay={50}>
            <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 10 }}>
                Interpretation Scale
              </Text>
              {INTERPRETATION_SCALE.map((tier) => {
                const isActive = displayOverallScore >= tier.min && displayOverallScore <= tier.max;
                return (
                  <View
                    key={tier.min}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: isActive ? tier.color + "18" : "transparent",
                      marginBottom: 2,
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tier.color, marginRight: 10 }} />
                    <Text style={{ color: isActive ? tier.color : colors.textMuted, fontSize: 13, fontWeight: isActive ? "800" : "500", width: 56 }}>
                      {tier.min}–{tier.max}
                    </Text>
                    <Text style={{ color: isActive ? tier.color : colors.textMuted, fontSize: 13, fontWeight: isActive ? "700" : "400", flex: 1 }}>
                      {tier.label}
                    </Text>
                    {isActive && (
                      <FontAwesome name="chevron-left" size={10} color={tier.color} />
                    )}
                  </View>
                );
              })}
            </Card>
          </FadeIn>
          )}

          {/* Sub-scores */}
          {(!isBeginner || showAdvanced) && (
          <FadeIn delay={100}>
            <SectionHeader title={hasMetricCategoryScores ? "Score Categories" : "Sub-Scores"} icon="sliders" iconColor={colors.accentSecondary} colors={colors} />
            <Card colors={colors} style={{ marginBottom: 16 }}>
              {scoreCategoryRows.map((row) => (
                <ScoreBarPremium
                  key={row.key}
                  label={row.label}
                  weight={row.weight}
                  value={row.value}
                  colors={colors}
                  iconColor={row.iconColor}
                  breakdown={row.breakdown}
                  penaltyPct={row.penaltyPct}
                  included={row.included}
                  onToggle={hasMetricCategoryScores ? () => handleToggleCategory(row.key as MetricCategoryScoreKey) : undefined}
                />
              ))}
            </Card>
          </FadeIn>
          )}

          {/* Score History */}
          {(!isBeginner || showAdvanced) && scoreHistory.length > 1 && (
            <FadeIn delay={200}>
              <SectionHeader title="Score History" icon="history" iconColor={colors.warning} badge={scoreHistory.length} colors={colors} />
              {hasMetricCategoryScores && (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8, paddingHorizontal: 4 }}>
                  Historical category-level breakdowns are not stored yet, so history tracks the composite score only.
                </Text>
              )}
              <Card colors={colors} noPadding style={{ marginBottom: 16 }}>
                {/* Header */}
                <View style={[st.scoreHistRow, { borderBottomWidth: 1, borderBottomColor: colors.borderColor, backgroundColor: colors.bgInput + "40" }]}>
                  <Text style={[st.scoreHistCell, { flex: 1, fontWeight: "800", color: colors.textPrimary }]}>Date</Text>
                  <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: colors.textPrimary }]}>Score</Text>
                  {!hasMetricCategoryScores && (
                    <>
                      <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>F</Text>
                      <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>V</Text>
                      <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>G</Text>
                      <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>Q</Text>
                      <Text style={[st.scoreHistCell, { width: 38, color: colors.textMuted }]}>R</Text>
                    </>
                  )}
                </View>
                {scoreHistory.length > VIRTUALIZE_THRESHOLD ? (
                  <View style={{ height: Math.min(scoreHistory.length * 36, 400) }}>
                    <FlashList
                      data={scoreHistory}
                      renderItem={renderHistoryRow}
                      drawDistance={200}
                      keyExtractor={(sh) => String(sh.id)}
                    />
                  </View>
                ) : (
                  scoreHistory.map((sh, idx) => renderHistoryRow({ item: sh, index: idx }))
                )}
              </Card>
            </FadeIn>
          )}

          {/* Underlying Metrics */}
          {(!isBeginner || showAdvanced) && score.details && Object.keys(score.details).length > 0 && (
            <FadeIn delay={300}>
              <SectionHeader title="Underlying Metrics" icon="list-ol" iconColor={colors.accentPrimary} badge={Object.keys(score.details).length} colors={colors} />
              <Card colors={colors}>
                {Object.entries(score.details).map(([name, val], idx, arr) => (
                  <View key={name} style={[st.metricRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" }]}>
                    <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>{name}</Text>
                    <Text
                      style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}
                      accessibilityLabel={`${name}: ${safeFormatMetric(name, val)}`}
                    >
                      {safeFormatMetric(name, val)}
                    </Text>
                  </View>
                ))}
              </Card>
            </FadeIn>
          )}

          {/* Beginner: show/hide advanced toggle */}
          {isBeginner && (
            <Pressable
              onPress={() => setShowAdvanced((p) => !p)}
              style={{ alignItems: "center", paddingVertical: 14, marginBottom: 16 }}
            >
              <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
                {showAdvanced ? "Hide technical details \u25B2" : "Show technical details \u25BC"}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
});

/* ── ScoreBarPremium (memoized) ─────────────────────────────────── */

interface ScoreBarPremiumProps {
  label: string;
  weight: string;
  value: number | null | undefined;
  colors: ThemePalette;
  iconColor: string;
  breakdown?: CategoryBreakdown;
  penaltyPct?: number | null;
  included?: boolean;
  onToggle?: () => void;
}

const ScoreBarPremium = React.memo(function ScoreBarPremium({
  label, weight, value, colors, iconColor, breakdown, penaltyPct, included, onToggle,
}: ScoreBarPremiumProps) {
  const [expanded, setExpanded] = useState(false);
  const v = value ?? 0;
  const barColor = scoreColor(v, colors);
  const isRiskPenalty = penaltyPct != null;
  const isExcluded = included === false;
  return (
    <View style={{ marginBottom: 14 }} accessibilityRole="summary">
      <Pressable onPress={() => breakdown && setExpanded((p) => !p)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View style={[st.rowBetween, { marginBottom: 6 }]}>
          <View style={st.rowCenter}>
            {onToggle && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                hitSlop={8}
                style={{ marginRight: 8, padding: 2 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !isExcluded }}
                accessibilityLabel={`${isExcluded ? "Include" : "Exclude"} ${label} from score`}
              >
                <FontAwesome
                  name={isExcluded ? "square-o" : "check-square-o"}
                  size={18}
                  color={isExcluded ? colors.textMuted : colors.accentPrimary}
                />
              </Pressable>
            )}
            <View style={[st.sectionIcon, { backgroundColor: iconColor + "18", width: 22, height: 22 }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: iconColor }} />
            </View>
            <Text style={{ color: isExcluded ? colors.textMuted : colors.textSecondary, fontSize: 14, fontWeight: "500", marginLeft: 8 }}>{label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 4 }}>({weight})</Text>
            {breakdown && (
              <FontAwesome
                name={expanded ? "chevron-up" : "chevron-down"}
                size={10}
                color={colors.textMuted}
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{ color: isExcluded ? colors.textMuted : barColor, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}
              accessibilityLabel={`${label} score: ${v.toFixed(0)} out of 100`}
            >
              {isExcluded ? "—" : v.toFixed(0)}
            </Text>
            {isRiskPenalty && (
              <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700", marginTop: 1 }}>
                −{(penaltyPct ?? 0).toFixed(1)}%
              </Text>
            )}
          </View>
        </View>
        <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "50" }]}>
          <View
            style={[st.scoreBarFill, { width: `${isExcluded ? 0 : Math.min(v, 100)}%`, backgroundColor: isExcluded ? colors.textMuted : barColor }]}
            accessibilityLabel={`${label} progress bar`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}
          />
        </View>
      </Pressable>

      {/* Expanded metric breakdown */}
      {expanded && breakdown && (
        <View style={{ marginTop: 8, marginLeft: 30, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: iconColor + "40" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>Base: {breakdown.base} pts</Text>
          {breakdown.metrics.map((m) => {
            const ptsColor = m.points > 0 ? colors.success : m.points < 0 ? colors.danger : colors.textMuted;
            const ptsLabel = m.points > 0 ? `+${m.points}` : String(m.points);
            return (
              <View key={m.metric} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5, minHeight: 22 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>{m.metric}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                    {m.value != null ? safeFormatMetric(m.metric, m.value) : "—"} · {m.reason}
                  </Text>
                </View>
                <View style={{ backgroundColor: ptsColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                  <Text style={{ color: ptsColor, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {ptsLabel}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.borderColor + "30" }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Final (clamped 0–100)</Text>
            <Text style={{ color: barColor, fontSize: 13, fontWeight: "800" }}>{v.toFixed(0)}</Text>
          </View>
        </View>
      )}
    </View>
  );
});
