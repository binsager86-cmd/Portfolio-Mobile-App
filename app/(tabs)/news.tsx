/**
 * News & Market Data — dedicated news screen.
 *
 * Sections:
 *  • Search bar with debounced filtering
 *  • Toggle: "My Holdings" / "All Market"
 *  • Category filter tabs
 *  • News feed list with pull-to-refresh
 *
 * Expertise gating: visible to intermediate+ users via tab layout.
 */

import { NewsFeed } from "@/components/news/NewsFeed";
import { withErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useThemeStore } from "@/services/themeStore";
import { tokens } from "@/theme/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

// Fine-grained values not covered by the coarse spacing/typography scale,
// anchored to the nearest token so they stay tied to the design system.
const SP2 = tokens.spacing.xs / 2;
const SP6 = tokens.spacing.sm - 2;
const FS12 = tokens.typography.caption.fontSize;
const FS13 = tokens.typography.label.fontSize;

export default withErrorBoundary(function NewsScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [portfolioOnly, setPortfolioOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
              {t("news.title")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: FS12, marginTop: SP2 }}>
              {t("news.subtitle")}
            </Text>
          </View>
        </View>

        {/* ── Search bar ── */}
        <View style={[s.searchBar, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={14} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("news.searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={[s.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoComplete="off"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("news.clearSearch") ?? "Clear search"}>
              <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* ── Feed toggle: My Holdings / All Market ── */}
        <View style={s.toggleRow}>
          <Pressable
            onPress={() => setPortfolioOnly(true)}
            accessibilityRole="tab"
            accessibilityLabel={t("news.myHoldings")}
            accessibilityState={{ selected: portfolioOnly }}
            style={[
              s.toggleBtn,
              {
                backgroundColor: portfolioOnly ? colors.accentPrimary + "15" : "transparent",
                borderColor: portfolioOnly ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="briefcase"
              size={12}
              color={portfolioOnly ? colors.accentPrimary : colors.textMuted}
            />
            <Text
              style={{
                color: portfolioOnly ? colors.accentPrimary : colors.textSecondary,
                fontSize: FS13,
                fontWeight: portfolioOnly ? "700" : "500",
                marginLeft: SP6,
              }}
            >
              {t("news.myHoldings")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPortfolioOnly(false)}
            accessibilityRole="tab"
            accessibilityLabel={t("news.allMarket")}
            accessibilityState={{ selected: !portfolioOnly }}
            style={[
              s.toggleBtn,
              {
                backgroundColor: !portfolioOnly ? colors.accentPrimary + "15" : "transparent",
                borderColor: !portfolioOnly ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="globe"
              size={12}
              color={!portfolioOnly ? colors.accentPrimary : colors.textMuted}
            />
            <Text
              style={{
                color: !portfolioOnly ? colors.accentPrimary : colors.textSecondary,
                fontSize: FS13,
                fontWeight: !portfolioOnly ? "700" : "500",
                marginLeft: SP6,
              }}
            >
              {t("news.allMarket")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── News feed ── */}
      <NewsFeed
        portfolioOnly={portfolioOnly}
        searchQuery={debouncedSearch}
      />
    </View>
  );
});

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md - 4,
    paddingBottom: tokens.spacing.sm,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: tokens.spacing.sm + 2,
  },
  headerTitle: {
    fontSize: tokens.typography.h2.fontSize,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.spacing.md - 4,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.spacing.sm + 2,
    borderWidth: 1,
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: tokens.typography.body.fontSize,
    paddingVertical: SP2,
  },
  toggleRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.spacing.md - 2,
    paddingVertical: tokens.spacing.sm - 1,
    borderRadius: tokens.spacing.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
});
