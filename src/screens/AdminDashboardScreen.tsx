/**
 * Admin Dashboard — dedicated admin-only experience.
 *
 * Two summary cards at top:
 *   1. Registered Users — count + new-per-day
 *   2. Total Activities — count across all users
 *
 * Expandable detail sections:
 *   1. Users table: registered date, name, username, last login, portfolio value, growth
 *   2. Activities table: date, type (buy/sell/deposit/dividend), stock, shares, value
 *
 * Click a user row to filter activities by that user.
 */

import { useAdminActivities, useAdminCreateUser, useAdminDeleteUser, useAdminUpdatePassword, useAdminUpdateUsername, useAdminUsers } from "@/hooks/queries";
import type { FontPreset } from "@/hooks/useResponsive";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import type { AdminActivity, AdminUser } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import type { ThemePalette } from "@/constants/theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { TFunction } from "i18next";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle
} from "react-native";

type AppColors = ThemePalette;
type AppFonts = FontPreset;
type TFn = TFunction;
type IconName = React.ComponentProps<typeof FontAwesome>["name"];

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
const SPACE_8 = 8;
const SPACE_10 = 10;
const SPACE_12 = 12;
const SPACE_14 = 14;
const SPACE_16 = 16;
const SPACE_18 = 18;
const SPACE_20 = 20;
const SPACE_24 = 24;
const SPACE_40 = 40;
const FONT_10 = 10;
const FONT_11 = 11;
const FONT_12 = 12;
const FONT_13 = 13;
const FONT_14 = 14;
const COLOR_WHITE = "#fff";
const COLOR_BLUE = "#3498db";
const COLOR_RED = "#e74c3c";
const COLOR_GREEN = "#27ae60";
const COLOR_PURPLE = "#8e44ad";
const COLOR_ORANGE = "#f39c12";
const COLOR_TEAL = "#1abc9c";
const COLOR_GRAY = "#95a5a6";

function errMsg(e: unknown, fallback: string): string {
  if (e && typeof e === "object") {
    const anyErr = e as { response?: { data?: { detail?: unknown } }; message?: unknown };
    const detail = anyErr.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) => (d && typeof d === "object" ? (d as { msg?: unknown }).msg : undefined))
        .filter((m): m is string => typeof m === "string");
      if (messages.length > 0) return messages.join("; ");
    }
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  return fallback;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Format currency without decimal places for admin overview */
function fmtInt(value: number): string {
  return formatCurrency(value, "KWD", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(epoch: number | null): string {
  if (!epoch) return "\u2014";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(epoch: number | null): string {
  if (!epoch) return "\u2014";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(epoch: number | null, t: TFn): string {
  if (!epoch) return t("adminPanel.never");
  const now = Date.now() / 1000;
  const diff = now - epoch;
  if (diff < 60) return t("adminPanel.justNow");
  if (diff < 3600) return t("adminPanel.mAgo", { m: Math.floor(diff / 60) });
  if (diff < 86400) return t("adminPanel.hAgo", { h: Math.floor(diff / 3600) });
  if (diff < 604800) return t("adminPanel.dAgo", { d: Math.floor(diff / 86400) });
  return formatDate(epoch);
}

const TXN_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  buy: { label: "adminPanel.buy", icon: "arrow-up", color: COLOR_BLUE },
  sell: { label: "adminPanel.sell", icon: "arrow-down", color: COLOR_RED },
  dividend: { label: "adminPanel.dividend", icon: "gift", color: COLOR_GREEN },
  deposit: { label: "adminPanel.deposit", icon: "plus-circle", color: COLOR_PURPLE },
  bonus: { label: "adminPanel.bonus", icon: "star", color: COLOR_ORANGE },
  split: { label: "adminPanel.split", icon: "columns", color: COLOR_TEAL },
};

function getTxnConfig(type: string, t: (key: string) => string) {
  const entry = TXN_CONFIG[type];
  if (!entry) return { label: type, icon: "circle", color: COLOR_GRAY };
  return { label: t(entry.label), icon: entry.icon, color: entry.color };
}

/** Group users by registration day */
function getNewUsersPerDay(users: AdminUser[]): { date: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const u of users) {
    if (!u.created_at) continue;
    const day = new Date(u.created_at * 1000).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    map[day] = (map[day] || 0) + 1;
  }
  return Object.entries(map).map(([date, count]) => ({ date, count }));
}

// ── Summary Card ────────────────────────────────────────────────────

function SummaryCard({
  icon, iconColor, title, value, subtitle, onPress, active, colors, fonts,
}: {
  icon: string; iconColor: string; title: string; value: string | number;
  subtitle?: string; onPress?: () => void; active?: boolean; colors: AppColors; fonts: AppFonts;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}`}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        st.summaryCard,
        {
          backgroundColor: colors.bgSecondary,
          borderColor: active ? iconColor : colors.borderColor,
          borderWidth: active ? 2 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[st.summaryIconWrap, { backgroundColor: iconColor + "18" }]}>
        <FontAwesome name={icon as IconName} size={22} color={iconColor} />
      </View>
      <Text style={[st.summaryLabel, { color: colors.textMuted, fontSize: fonts.caption }]}>
        {title}
      </Text>
      <Text style={[st.summaryValue, { color: colors.textPrimary, fontSize: fonts.hero }]}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={[st.summarySub, { color: colors.textMuted, fontSize: fonts.caption }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ── Table Header ────────────────────────────────────────────────────

function TableHeader({
  columns, colors, fonts,
}: {
  columns: { label: string; flex: number; align?: "left" | "center" | "right" }[];
  colors: AppColors; fonts: AppFonts;
}) {
  return (
    <View style={[st.tableHeaderRow, { borderBottomColor: colors.borderColor }]}>
      {columns.map((col) => (
        <Text
          key={col.label}
          style={[
            st.tableHeaderCell,
            { flex: col.flex, textAlign: col.align ?? "left",
              color: colors.textMuted, fontSize: fonts.caption },
          ]}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

// ── User Table Row ──────────────────────────────────────────────────

function UserTableRow({
  user, colors, fonts, isPhone, selected, onPress, t,
}: {
  user: AdminUser; colors: AppColors; fonts: AppFonts; isPhone: boolean;
  selected: boolean; onPress: () => void; t: TFn;
}) {
  const growthColor = user.growth_value >= 0 ? "#27ae60" : "#e74c3c";
  const growthSign = user.growth_value >= 0 ? "+" : "";
  const dailyColor = user.daily_change >= 0 ? "#27ae60" : "#e74c3c";
  const dailySign = user.daily_change >= 0 ? "+" : "";

  if (isPhone) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`User ${user.name || user.username}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          st.userCardMobile,
          {
            backgroundColor: selected ? colors.accentPrimary + "10" : "transparent",
            borderBottomColor: colors.borderColor,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={st.userCardRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.userName, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {user.name || user.username}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: SPACE_2 }}>
              @{user.username}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[st.userValue, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {fmtInt(user.total_value)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: FONT_11, marginTop: SPACE_1 }}>
              {t("adminPanel.stocks")} {fmtInt(user.stocks_value)} {"\u00B7"} {t("adminPanel.cash")} {fmtInt(user.cash_balance)}
            </Text>
            <Text style={{ color: growthColor, fontSize: fonts.caption, fontWeight: "600", marginTop: SPACE_2 }}>
              {growthSign}{fmtInt(user.growth_value)}
            </Text>
            <Text style={{ color: dailyColor, fontSize: FONT_11, fontWeight: "600", marginTop: SPACE_1 }}>
              {dailySign}{fmtInt(user.daily_change)} {t("adminPanel.dailyChange")}
            </Text>
          </View>
        </View>
        <View style={st.userCardMeta}>
          <Text style={{ color: colors.textMuted, fontSize: FONT_11 }}>
            {t("adminPanel.registered")} {formatDate(user.created_at)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: FONT_11 }}>
            {t("adminPanel.last")} {timeAgo(user.last_login, t)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`User ${user.name || user.username}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        st.tableRow,
        {
          backgroundColor: selected
            ? colors.accentPrimary + "10"
            : pressed ? (colors.bgCardHover ?? colors.bgPrimary) : "transparent",
          borderBottomColor: colors.borderColor,
        },
      ]}
    >
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textPrimary, fontSize: fonts.body }]}>
        {formatDate(user.created_at)}
      </Text>
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }]}>
        {user.name || "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textMuted, fontSize: fonts.body }]}>
        @{user.username}
      </Text>
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textMuted, fontSize: fonts.body, textAlign: "center" }]}>
        {timeAgo(user.last_login, t)}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {fmtInt(user.stocks_value)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.success ?? "#27ae60", fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {fmtInt(user.cash_balance)}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "center", fontWeight: "700" }]}>
        {fmtInt(user.total_value)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: growthColor, fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {growthSign}{fmtInt(user.growth_value)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: dailyColor, fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {dailySign}{fmtInt(user.daily_change)}
      </Text>
    </Pressable>
  );
}

// ── Activity Table Row ──────────────────────────────────────────────

function ActivityTableRow({
  activity, colors, fonts, isPhone, t,
}: {
  activity: AdminActivity; colors: AppColors; fonts: AppFonts; isPhone: boolean;
  t: TFn;
}) {
  const cfg = getTxnConfig(activity.txn_type, t);

  if (isPhone) {
    return (
      <View style={[st.actCardMobile, { borderBottomColor: colors.borderColor }]}>
        <View style={st.actCardRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE_8, flex: 1 }}>
            <View style={[st.txnIconBg, { backgroundColor: cfg.color + "18" }]}>
              <FontAwesome name={cfg.icon as IconName} size={12} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.actStock, { color: colors.textPrimary, fontSize: fonts.body }]}>
                {activity.stock_symbol}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: FONT_11, marginTop: SPACE_1 }}>
                @{activity.username} {"\u00B7"} {cfg.label}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[st.actValue, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {formatCurrency(activity.value)}
            </Text>
            {activity.shares > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: FONT_11, marginTop: SPACE_1 }}>
                {t("adminPanel.sharesAt", { shares: activity.shares, price: activity.price > 0 ? formatCurrency(activity.price) : "\u2014" })}
              </Text>
            )}
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: FONT_11 }}>
          {activity.txn_date || formatDate(activity.created_at)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[st.tableRow, { borderBottomColor: colors.borderColor }]}>
      <Text style={[st.tableCell, { flex: 1, color: colors.textMuted, fontSize: fonts.body }]}>
        {activity.txn_date || formatDate(activity.created_at)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.textSecondary, fontSize: fonts.body }]}>
        @{activity.username}
      </Text>
      <View style={[st.tableCell, { flex: 0.8, flexDirection: "row", alignItems: "center", gap: SPACE_6 }]}>
        <View style={[st.txnBadge, { backgroundColor: cfg.color + "18" }]}>
          <FontAwesome name={cfg.icon as IconName} size={10} color={cfg.color} />
          <Text style={[st.txnBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }]}>
        {activity.stock_symbol}
      </Text>
      <Text style={[st.tableCell, { flex: 0.7, color: colors.textMuted, fontSize: fonts.body, textAlign: "right" }]}>
        {activity.shares > 0 ? activity.shares.toLocaleString() : "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.textSecondary, fontSize: fonts.body, textAlign: "right" }]}>
        {activity.price > 0 ? formatCurrency(activity.price) : "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "right", fontWeight: "600" }]}>
        {formatCurrency(activity.value)}
      </Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

function AdminDashboardScreen() {
  const { colors } = useThemeStore();
  const { isPhone, fonts } = useResponsive();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { t } = useTranslation();

  const [activeSection, setActiveSection] = useState<"users" | "activities" | "manage">("users");
  const [activityPage, setActivityPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterUserName, setFilterUserName] = useState<string | undefined>();
  const [filterTxnType, setFilterTxnType] = useState<string | undefined>();
  const [filterStock, setFilterStock] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Manage users state
  const [manageSearch, setManageSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editField, setEditField] = useState<"username" | "password" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [formValue, setFormValue] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState("");

  const {
    data: usersData,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useAdminUsers(isAdmin);

  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    refetch: refetchActivities,
  } = useAdminActivities({
    page: activityPage,
    perPage: 50,
    userId: filterUserId,
    txnType: filterTxnType,
    stockSymbol: filterStock || undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    enabled: isAdmin,
  });

  const createUser = useAdminCreateUser();
  const updateUsername = useAdminUpdateUsername();
  const updatePassword = useAdminUpdatePassword();
  const deleteUser = useAdminDeleteUser();

  const onRefresh = useCallback(() => {
    refetchUsers();
    refetchActivities();
  }, [refetchUsers, refetchActivities]);

  const handleUserPress = useCallback((user: AdminUser) => {
    if (filterUserId === user.id) {
      setFilterUserId(undefined);
      setFilterUserName(undefined);
    } else {
      setFilterUserId(user.id);
      setFilterUserName(user.name || user.username);
      setActiveSection("activities");
      setActivityPage(1);
    }
  }, [filterUserId]);

  const clearAllFilters = useCallback(() => {
    setFilterUserId(undefined);
    setFilterUserName(undefined);
    setFilterTxnType(undefined);
    setFilterStock("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setActivityPage(1);
  }, []);

  const newUsersToday = useMemo(() => {
    if (!usersData?.users) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEpoch = todayStart.getTime() / 1000;
    return usersData.users.filter((u) => u.created_at && u.created_at >= todayEpoch).length;
  }, [usersData]);

  const dailyRegistrations = useMemo(
    () => (usersData?.users ? getNewUsersPerDay(usersData.users) : []),
    [usersData],
  );

  if (!isAdmin) {
    return (
      <View style={[st.center, { backgroundColor: colors.bgPrimary, flex: 1 }]}>
        <FontAwesome name="lock" size={48} color={colors.textMuted} />
        <Text style={[st.noAccess, { color: colors.textMuted, fontSize: fonts.body }]}>
          {t("adminPanel.adminAccessRequired")}
        </Text>
      </View>
    );
  }

  const userCount = usersData?.count ?? 0;
  const activities = activitiesData?.activities ?? [];
  const totalActivities = activitiesData?.total ?? 0;
  const totalPages = Math.ceil(totalActivities / 50);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        st.container,
        { maxWidth: isPhone ? undefined : 1100, alignSelf: "center", width: "100%" },
      ]}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accentPrimary} />
      }
    >
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={[st.pageTitle, { color: colors.textPrimary, fontSize: fonts.hero }]}>
            {t("adminPanel.title")}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: SPACE_2 }}>
            {t("adminPanel.subtitle")}
          </Text>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={[st.summaryRow, isPhone && st.summaryRowPhone]}>
        <SummaryCard
          icon="users"
          iconColor="#3498db"
          title={t("adminPanel.registeredUsers")}
          value={userCount}
          subtitle={newUsersToday > 0 ? t("adminPanel.todayCount", { count: newUsersToday }) : t("adminPanel.registrationDays", { count: dailyRegistrations.length })}
          onPress={() => setActiveSection("users")}
          active={activeSection === "users"}
          colors={colors}
          fonts={fonts}
        />
        <SummaryCard
          icon="exchange"
          iconColor="#27ae60"
          title={t("adminPanel.totalActivities")}
          value={totalActivities.toLocaleString()}
          subtitle={activities.length > 0 ? t("adminPanel.latest", { time: activities[0]?.txn_date || "\u2014" }) : t("adminPanel.noActivity")}
          onPress={() => setActiveSection("activities")}
          active={activeSection === "activities"}
          colors={colors}
          fonts={fonts}
        />
        <SummaryCard
          icon="cog"
          iconColor="#8e44ad"
          title={t("adminPanel.manageUsers")}
          value={t("adminPanel.manage")}
          subtitle={t("adminPanel.addEditDelete")}
          onPress={() => setActiveSection("manage")}
          active={activeSection === "manage"}
          colors={colors}
          fonts={fonts}
        />
      </View>

      {/* Users Section */}
      {activeSection === "users" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE_10 }}>
              <FontAwesome name="users" size={16} color="#3498db" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                {t("adminPanel.users")}
              </Text>
              <View style={[st.badge, { backgroundColor: COLOR_BLUE }]}>
                <Text style={st.badgeText}>{userCount}</Text>
              </View>
            </View>
            {filterUserId != null && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Clear user filter ${filterUserName ?? ''}`}
                onPress={() => { setFilterUserId(undefined); setFilterUserName(undefined); }}
                style={[st.filterChip, { backgroundColor: "#3498db" + "18" }]}
              >
                <Text style={{ color: COLOR_BLUE, fontSize: fonts.caption, fontWeight: "600" }}>
                  {filterUserName} {"\u00D7"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* New registrations per day */}
          {dailyRegistrations.length > 0 && (
            <View style={[st.dailyBar, { borderBottomColor: colors.borderColor }]}>
              <Text style={{ color: colors.textMuted, fontSize: FONT_11, fontWeight: "600", marginBottom: SPACE_6 }}>
                {t("adminPanel.recentRegistrations")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE_6 }}>
                {dailyRegistrations.slice(0, 7).map((d) => (
                  <View key={d.date} style={[st.dayChip, { backgroundColor: colors.bgPrimary }]}>
                    <Text style={{ color: colors.textMuted, fontSize: FONT_10 }}>{d.date}</Text>
                    <Text style={{ color: COLOR_BLUE, fontSize: FONT_12, fontWeight: "700" }}>+{d.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Table header (desktop) */}
          {!isPhone && (
            <TableHeader
              colors={colors}
              fonts={fonts}
              columns={[
                { label: t("adminPanel.registered"), flex: 1.2 },
                { label: t("adminPanel.name"), flex: 1.2 },
                { label: t("adminPanel.username"), flex: 1 },
                { label: t("adminPanel.lastLoginHeader"), flex: 1.2, align: "center" },
                { label: t("adminPanel.stocksHeader"), flex: 1, align: "center" },
                { label: t("adminPanel.cashHeader"), flex: 0.8, align: "center" },
                { label: t("adminPanel.total"), flex: 1, align: "center" },
                { label: t("adminPanel.growth"), flex: 0.8, align: "center" },
                { label: t("adminPanel.dailyChange"), flex: 0.8, align: "center" },
              ]}
            />
          )}

          {usersLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: SPACE_24 }} />
          ) : (
            (usersData?.users ?? []).map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                colors={colors}
                fonts={fonts}
                isPhone={isPhone}
                selected={filterUserId === user.id}
                onPress={() => handleUserPress(user)}
                t={t}
              />
            ))
          )}
        </View>
      )}

      {/* Activities Section */}
      {activeSection === "activities" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE_10 }}>
              <FontAwesome name="exchange" size={16} color="#27ae60" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                {t("adminPanel.userActivities")}
              </Text>
              <View style={[st.badge, { backgroundColor: COLOR_GREEN }]}>
                <Text style={st.badgeText}>{totalActivities.toLocaleString()}</Text>
              </View>
            </View>
            {(filterUserId != null || filterTxnType || filterStock || filterDateFrom || filterDateTo) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("adminPanel.clearAll")}
                onPress={clearAllFilters}
                style={[st.filterChip, { backgroundColor: "#e74c3c" + "18" }]}
              >
                <Text style={{ color: COLOR_RED, fontSize: fonts.caption, fontWeight: "600" }}>
                  {t("adminPanel.clearAll")} {"\u00D7"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ── Filter Bar ── */}
          <View style={[st.filterBar, { borderBottomColor: colors.borderColor }]}>
            {/* Row 1: Search inputs */}
            <View style={[st.filterRow, isPhone && { flexDirection: "column" }]}>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="user" size={12} color={colors.textMuted} style={{ marginRight: SPACE_6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder={t("adminPanel.filterByUser")}
                  placeholderTextColor={colors.textMuted}
                  value={filterUserName ?? ""}
                  onChangeText={(txt) => {
                    if (!txt) {
                      setFilterUserId(undefined);
                      setFilterUserName(undefined);
                    } else {
                      setFilterUserName(txt);
                      // Find matching user
                      const match = usersData?.users.find(
                        (u) => u.username.toLowerCase() === txt.toLowerCase()
                          || (u.name && u.name.toLowerCase() === txt.toLowerCase()),
                      );
                      setFilterUserId(match?.id);
                    }
                    setActivityPage(1);
                  }}
                />
              </View>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="line-chart" size={12} color={colors.textMuted} style={{ marginRight: SPACE_6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder={t("adminPanel.filterByStock")}
                  placeholderTextColor={colors.textMuted}
                  value={filterStock}
                  onChangeText={(txt) => { setFilterStock(txt); setActivityPage(1); }}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Row 2: Date range */}
            <View style={[st.filterRow, isPhone && { flexDirection: "column" }]}>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="calendar" size={12} color={colors.textMuted} style={{ marginRight: SPACE_6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder={t("adminPanel.fromDate")}
                  placeholderTextColor={colors.textMuted}
                  value={filterDateFrom}
                  onChangeText={(txt) => { setFilterDateFrom(txt); setActivityPage(1); }}
                />
              </View>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="calendar" size={12} color={colors.textMuted} style={{ marginRight: SPACE_6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder={t("adminPanel.toDate")}
                  placeholderTextColor={colors.textMuted}
                  value={filterDateTo}
                  onChangeText={(txt) => { setFilterDateTo(txt); setActivityPage(1); }}
                />
              </View>
            </View>

            {/* Row 3: Type filter chips */}
            <View style={st.filterChipRow}>
              {[
                { key: undefined, label: t("adminPanel.all") },
                { key: "buy", label: t("adminPanel.buy") },
                { key: "sell", label: t("adminPanel.sell") },
                { key: "dividend", label: t("adminPanel.dividend") },
                { key: "deposit", label: t("adminPanel.deposit") },
                { key: "bonus", label: t("adminPanel.bonus") },
              ].map((item) => {
                const active = filterTxnType === item.key;
                const cfg = item.key ? getTxnConfig(item.key, t) : { color: COLOR_GREEN };
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => { setFilterTxnType(item.key); setActivityPage(1); }}
                    style={[
                      st.typeChip,
                      {
                        backgroundColor: active ? cfg.color : cfg.color + "15",
                        borderColor: active ? cfg.color : cfg.color + "40",
                      },
                    ]}
                  >
                    <Text style={{ color: active ? "#fff" : cfg.color, fontSize: FONT_12, fontWeight: "600" }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Active filter chips */}
            {(filterUserId != null || filterStock || filterDateFrom || filterDateTo) && (
              <View style={st.filterChipRow}>
                {filterUserId != null && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clear user filter ${filterUserName ?? ''}`}
                    onPress={() => { setFilterUserId(undefined); setFilterUserName(undefined); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#3498db" + "18" }]}
                  >
                    <Text style={{ color: COLOR_BLUE, fontSize: FONT_11, fontWeight: "600" }}>
                      {t("adminPanel.userHeader")}: {filterUserName} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterStock !== "" && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clear stock filter ${filterStock}`}
                    onPress={() => { setFilterStock(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#f39c12" + "18" }]}
                  >
                    <Text style={{ color: COLOR_ORANGE, fontSize: FONT_11, fontWeight: "600" }}>
                      {t("adminPanel.stock")}: {filterStock} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterDateFrom !== "" && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clear from date ${filterDateFrom}`}
                    onPress={() => { setFilterDateFrom(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#8e44ad" + "18" }]}
                  >
                    <Text style={{ color: COLOR_PURPLE, fontSize: FONT_11, fontWeight: "600" }}>
                      {t("adminPanel.fromLabel")}: {filterDateFrom} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterDateTo !== "" && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Clear to date ${filterDateTo}`}
                    onPress={() => { setFilterDateTo(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#8e44ad" + "18" }]}
                  >
                    <Text style={{ color: COLOR_PURPLE, fontSize: FONT_11, fontWeight: "600" }}>
                      {t("adminPanel.toLabel")}: {filterDateTo} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Table header (desktop) */}
          {!isPhone && (
            <TableHeader
              colors={colors}
              fonts={fonts}
              columns={[
                { label: t("adminPanel.date"), flex: 1 },
                { label: t("adminPanel.userHeader"), flex: 0.8 },
                { label: t("adminPanel.type"), flex: 0.8 },
                { label: t("adminPanel.stock"), flex: 1 },
                { label: t("adminPanel.sharesHeader"), flex: 0.7, align: "right" },
                { label: t("adminPanel.priceHeader"), flex: 0.8, align: "right" },
                { label: t("adminPanel.valueHeader"), flex: 1, align: "right" },
              ]}
            />
          )}

          {activitiesLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: SPACE_24 }} />
          ) : activities.length === 0 ? (
            <View style={st.emptyState}>
              <FontAwesome name="inbox" size={32} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: fonts.body, marginTop: SPACE_8 }}>
                {t("adminPanel.noActivitiesFound")}
              </Text>
            </View>
          ) : (
            activities.map((act) => (
              <ActivityTableRow key={act.id} activity={act} colors={colors} fonts={fonts} isPhone={isPhone} t={t} />
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={[st.pagination, { borderTopColor: colors.borderColor }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous page"
                accessibilityState={{ disabled: activityPage <= 1 }}
                onPress={() => setActivityPage((p) => Math.max(1, p - 1))}
                disabled={activityPage <= 1}
                style={[st.pageBtn, { backgroundColor: colors.bgPrimary, opacity: activityPage <= 1 ? 0.4 : 1 }]}
              >
                <FontAwesome name="chevron-left" size={12} color={colors.textSecondary} />
              </Pressable>
              <Text style={{ color: colors.textSecondary, fontSize: fonts.body, fontWeight: "600" }}>
                {t("adminPanel.pageOf", { current: activityPage, total: totalPages })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next page"
                accessibilityState={{ disabled: activityPage >= totalPages }}
                onPress={() => setActivityPage((p) => Math.min(totalPages, p + 1))}
                disabled={activityPage >= totalPages}
                style={[st.pageBtn, { backgroundColor: colors.bgPrimary, opacity: activityPage >= totalPages ? 0.4 : 1 }]}
              >
                <FontAwesome name="chevron-right" size={12} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* ══════════════════ Manage Users Section ══════════════════ */}
      {activeSection === "manage" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE_10 }}>
              <FontAwesome name="cog" size={16} color="#8e44ad" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                {t("adminPanel.manageUsers")}
              </Text>
              <View style={[st.badge, { backgroundColor: COLOR_PURPLE }]}>
                <Text style={st.badgeText}>{userCount}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("adminPanel.addUser")}
              onPress={() => {
                setNewUsername("");
                setNewPassword("");
                setNewName("");
                setActionError("");
                setShowAddModal(true);
              }}
              style={[st.filterChip, { backgroundColor: "#27ae60" + "18" }]}
            >
              <Text style={{ color: COLOR_GREEN, fontSize: fonts.caption, fontWeight: "600" }}>
                {t("adminPanel.addUser")}
              </Text>
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={[st.filterBar, { borderBottomColor: colors.borderColor }]}>
            <View style={st.filterInputWrap}>
              <FontAwesome name="search" size={12} color={colors.textMuted} style={{ marginRight: SPACE_6 }} />
              <TextInput
                style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                placeholder={t("adminPanel.searchByUsername")}
                placeholderTextColor={colors.textMuted}
                value={manageSearch}
                onChangeText={setManageSearch}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* User list */}
          {usersLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: SPACE_24 }} />
          ) : (
            (usersData?.users ?? [])
              .filter((u) =>
                !manageSearch ||
                u.username.toLowerCase().includes(manageSearch.toLowerCase()) ||
                (u.name && u.name.toLowerCase().includes(manageSearch.toLowerCase())),
              )
              .map((user) => (
                <View
                  key={user.id}
                  style={[
                    st.manageRow,
                    { borderBottomColor: colors.borderColor },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }}>
                      {user.name || user.username}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: SPACE_2 }}>
                      @{user.username}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: FONT_11, marginTop: SPACE_3 }}>
                      {t("adminPanel.lastLogin")} {timeAgo(user.last_login, t)} {"\u00B7"} {t("adminPanel.registered")} {formatDate(user.created_at)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: SPACE_8, alignItems: "center" }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit username for ${user.username}`}
                      onPress={() => {
                        setEditUser(user);
                        setEditField("username");
                        setFormValue(user.username);
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#3498db" + "18" }]}
                    >
                      <FontAwesome name="pencil" size={12} color="#3498db" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Reset password for ${user.username}`}
                      onPress={() => {
                        setEditUser(user);
                        setEditField("password");
                        setFormValue("");
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#f39c12" + "18" }]}
                    >
                      <FontAwesome name="lock" size={12} color="#f39c12" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete user ${user.username}`}
                      onPress={() => {
                        setDeleteTarget(user);
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#e74c3c" + "18" }]}
                    >
                      <FontAwesome name="trash" size={12} color="#e74c3c" />
                    </Pressable>
                  </View>
                </View>
              ))
          )}
        </View>
      )}

      {/* ══════════════════ Add User Modal ══════════════════ */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} style={{ flex: 1, justifyContent: "center" }}>
        <Pressable accessibilityRole="none" accessibilityLabel="Close dialog" style={st.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable accessibilityRole="none" style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
              {t("adminPanel.addNewUser")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: SPACE_12 }}>
              {t("adminPanel.username")}
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder={t("adminPanel.username")}
              placeholderTextColor={colors.textMuted}
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
            />
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: SPACE_4, marginTop: SPACE_10 }}>
              {t("adminPanel.displayName")}
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder={t("adminPanel.name")}
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: SPACE_4, marginTop: SPACE_10 }}>
              {t("adminPanel.passwordMin8")}
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder={t("adminPanel.password")}
              placeholderTextColor={colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            {actionError ? (
              <Text style={{ color: COLOR_RED, fontSize: FONT_12, marginTop: SPACE_8 }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.cancel")}
                onPress={() => setShowAddModal(false)}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("app.cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("adminPanel.create")}
                accessibilityState={{ disabled: createUser.isPending, busy: createUser.isPending }}
                onPress={async () => {
                  if (!newUsername || !newPassword) {
                    setActionError(t("adminPanel.usernamePasswordRequired"));
                    return;
                  }
                  try {
                    await createUser.mutateAsync({
                      username: newUsername,
                      password: newPassword,
                      name: newName || undefined,
                    });
                    setShowAddModal(false);
                  } catch (e: unknown) {
                    setActionError(errMsg(e, t("adminPanel.failedToCreateUser")));
                  }
                }}
                disabled={createUser.isPending}
                style={[st.modalBtn, { backgroundColor: COLOR_GREEN }]}
              >
                {createUser.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: COLOR_WHITE, fontWeight: "600" }}>{t("adminPanel.create")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════ Edit Username / Password Modal ══════════════════ */}
      <Modal visible={editField !== null && editUser !== null} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "web" ? undefined : "padding"} style={{ flex: 1, justifyContent: "center" }}>
        <Pressable accessibilityRole="none" accessibilityLabel="Close dialog" style={st.modalOverlay} onPress={() => { setEditField(null); setEditUser(null); }}>
          <Pressable accessibilityRole="none" style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
              {editField === "username" ? t("adminPanel.changeUsername") : t("adminPanel.resetPassword")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: SPACE_4 }}>
              {t("adminPanel.user", { username: editUser?.username })}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: SPACE_8, marginTop: SPACE_8 }}>
              {editField === "username" ? t("adminPanel.newUsername") : t("adminPanel.newPasswordMin8")}
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder={editField === "username" ? t("adminPanel.newUsernamePlaceholder") : t("adminPanel.newPasswordPlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={formValue}
              onChangeText={setFormValue}
              autoCapitalize={editField === "username" ? "none" : "none"}
              secureTextEntry={editField === "password"}
            />
            {actionError ? (
              <Text style={{ color: COLOR_RED, fontSize: FONT_12, marginTop: SPACE_8 }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.cancel")}
                onPress={() => { setEditField(null); setEditUser(null); }}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("app.cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.save")}
                accessibilityState={{ disabled: updateUsername.isPending || updatePassword.isPending, busy: updateUsername.isPending || updatePassword.isPending }}
                onPress={async () => {
                  if (!formValue) {
                    setActionError(editField === "username" ? t("adminPanel.usernameRequired") : t("adminPanel.passwordRequired"));
                    return;
                  }
                  try {
                    if (editField === "username") {
                      await updateUsername.mutateAsync({ userId: editUser!.id, username: formValue });
                    } else {
                      await updatePassword.mutateAsync({ userId: editUser!.id, password: formValue });
                    }
                    setEditField(null);
                    setEditUser(null);
                  } catch (e: unknown) {
                    setActionError(errMsg(e, t("adminPanel.operationFailed")));
                  }
                }}
                disabled={updateUsername.isPending || updatePassword.isPending}
                style={[st.modalBtn, { backgroundColor: editField === "username" ? "#3498db" : "#f39c12" }]}
              >
                {(updateUsername.isPending || updatePassword.isPending) ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: COLOR_WHITE, fontWeight: "600" }}>{t("app.save")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════ Delete Confirmation Modal ══════════════════ */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <Pressable accessibilityRole="none" accessibilityLabel="Close dialog" style={st.modalOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable accessibilityRole="none" style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <View style={{ alignItems: "center", marginBottom: SPACE_12 }}>
              <View style={[st.summaryIconWrap, { backgroundColor: "#e74c3c" + "18" }]}>
                <FontAwesome name="exclamation-triangle" size={22} color="#e74c3c" />
              </View>
            </View>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title, textAlign: "center" }]}>
              {t("adminPanel.deleteUser")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.body, textAlign: "center", marginBottom: SPACE_4 }}>
              {t("adminPanel.deleteUserConfirm", { username: deleteTarget?.username })}
            </Text>
            <Text style={{ color: COLOR_RED, fontSize: fonts.caption, textAlign: "center", marginTop: SPACE_4 }}>
              {t("adminPanel.deleteUserWarning")}
            </Text>
            {actionError ? (
              <Text style={{ color: COLOR_RED, fontSize: FONT_12, marginTop: SPACE_8, textAlign: "center" }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.cancel")}
                onPress={() => setDeleteTarget(null)}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary, flex: 1 }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("app.cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("app.delete")}
                accessibilityState={{ disabled: deleteUser.isPending, busy: deleteUser.isPending }}
                onPress={async () => {
                  try {
                    await deleteUser.mutateAsync(deleteTarget!.id);
                    setDeleteTarget(null);
                  } catch (e: unknown) {
                    setActionError(errMsg(e, t("adminPanel.failedToDeleteUser")));
                  }
                }}
                disabled={deleteUser.isPending}
                style={[st.modalBtn, { backgroundColor: COLOR_RED, flex: 1 }]}
              >
                {deleteUser.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: COLOR_WHITE, fontWeight: "600" }}>{t("app.delete")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

export default AdminDashboardScreen;

// ── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { padding: SPACE_20, paddingBottom: SPACE_40 },
  center: { justifyContent: "center", alignItems: "center", gap: SPACE_12 },
  noAccess: { fontWeight: "600", marginTop: SPACE_8 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACE_20,
  },
  pageTitle: { fontWeight: "800", letterSpacing: -0.5 },

  summaryRow: { flexDirection: "row", gap: SPACE_14, marginBottom: SPACE_20 },
  summaryRowPhone: { flexDirection: "column" },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: SPACE_18,
    gap: SPACE_6,
    ...Platform.select({
      web: ({ cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" } as unknown as ViewStyle),
    }),
  },
  summaryIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginBottom: SPACE_4,
  },
  summaryLabel: { fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontWeight: "800", letterSpacing: -0.5 },
  summarySub: { fontWeight: "500" },

  section: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: SPACE_16 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", padding: SPACE_16,
  },
  sectionTitle: { fontWeight: "700" },
  badge: {
    borderRadius: 10, paddingHorizontal: SPACE_8, paddingVertical: SPACE_3,
    minWidth: 28, alignItems: "center",
  },
  badgeText: { color: COLOR_WHITE, fontWeight: "700", fontSize: FONT_12 },
  filterChip: {
    borderRadius: 8, paddingHorizontal: SPACE_10, paddingVertical: SPACE_5,
    ...Platform.select({ web: ({ cursor: "pointer" } as unknown as ViewStyle) }),
  },

  filterBar: {
    paddingHorizontal: SPACE_16, paddingVertical: SPACE_12, gap: SPACE_10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRow: {
    flexDirection: "row", gap: SPACE_10,
  },
  filterInputWrap: {
    flexDirection: "row", alignItems: "center",
  },
  filterInput: {
    flex: 1, height: 36, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: SPACE_10, fontSize: FONT_13,
  },
  filterChipRow: {
    flexDirection: "row", flexWrap: "wrap", gap: SPACE_6,
  },
  typeChip: {
    borderRadius: 8, paddingHorizontal: SPACE_12, paddingVertical: SPACE_6,
    borderWidth: 1,
    ...Platform.select({ web: ({ cursor: "pointer" } as unknown as ViewStyle) }),
  },

  dailyBar: { paddingHorizontal: SPACE_16, paddingBottom: SPACE_12, borderBottomWidth: StyleSheet.hairlineWidth },
  dayChip: { borderRadius: 8, paddingHorizontal: SPACE_10, paddingVertical: SPACE_5, alignItems: "center", gap: SPACE_2 },

  tableHeaderRow: {
    flexDirection: "row", paddingHorizontal: SPACE_16, paddingVertical: SPACE_8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderCell: { fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACE_16, paddingVertical: SPACE_12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: ({ cursor: "pointer" } as unknown as ViewStyle) }),
  },
  tableCell: { paddingRight: SPACE_8 },

  userCardMobile: {
    paddingHorizontal: SPACE_16, paddingVertical: SPACE_12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  userCardMeta: { flexDirection: "row", gap: SPACE_12, marginTop: SPACE_6 },
  userName: { fontWeight: "600" },
  userValue: { fontWeight: "600" },

  actCardMobile: {
    paddingHorizontal: SPACE_16, paddingVertical: SPACE_12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actCardRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: SPACE_4,
  },
  actStock: { fontWeight: "600" },
  actValue: { fontWeight: "600" },
  txnIconBg: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
  },
  txnBadge: {
    flexDirection: "row", alignItems: "center", gap: SPACE_4,
    borderRadius: 6, paddingHorizontal: SPACE_8, paddingVertical: SPACE_3,
  },
  txnBadgeText: { fontSize: FONT_11, fontWeight: "700", textTransform: "uppercase" },

  emptyState: { alignItems: "center", justifyContent: "center", padding: SPACE_40, gap: SPACE_4 },

  pagination: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: SPACE_16, paddingVertical: SPACE_14, borderTopWidth: StyleSheet.hairlineWidth,
  },
  pageBtn: { width: 34, height: 34, borderRadius: 8, justifyContent: "center", alignItems: "center" },

  // Manage users
  manageRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACE_16, paddingVertical: SPACE_14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    width: 34, height: 34, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
    ...Platform.select({ web: ({ cursor: "pointer" } as unknown as ViewStyle) }),
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
  },
  modalCard: {
    borderRadius: 16, padding: SPACE_24,
    width: "90%", maxWidth: 420,
    ...Platform.select({ web: ({ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" } as unknown as ViewStyle) }),
  },
  modalTitle: { fontWeight: "700", marginBottom: SPACE_12 },
  modalInput: {
    height: 42, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: SPACE_12, fontSize: FONT_14, marginBottom: SPACE_4,
  },
  modalActions: {
    flexDirection: "row", gap: SPACE_10, marginTop: SPACE_18,
  },
  modalBtn: {
    borderRadius: 10, paddingVertical: SPACE_10, paddingHorizontal: SPACE_20,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({ web: ({ cursor: "pointer" } as unknown as ViewStyle) }),
  },
});
