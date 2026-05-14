/* eslint-disable custom-styles/no-hardcoded-styles */
/**
 * Eagle Eye — Settings screen
 *
 * Safety toggles, position limits, display preferences.
 * Persisted to AsyncStorage under key "eagle_eye_settings".
 *
 * Route: /(tabs)/eagle-eye/settings
 */

import { EE } from "@/constants/eagleEyeStrings";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemePalette } from "@/constants/theme";
import { useRouter } from "expo-router";

const STORAGE_KEY = "eagle_eye_settings";

const SORT_OPTIONS = [
  { key: "confidence", label: EE.sortByConfidence },
  { key: "rr", label: EE.sortByRR },
] as const;

interface EagleEyeSettings {
  circuitBreaker: boolean;
  confirmLargePositions: boolean;
  sectorCapPct: string; // string for TextInput
  minConfidenceDisplay: string;
  defaultSort: "confidence" | "rr";
}

const DEFAULT_SETTINGS: EagleEyeSettings = {
  circuitBreaker: true,
  confirmLargePositions: true,
  sectorCapPct: "40",
  minConfidenceDisplay: "0",
  defaultSort: "confidence",
};

function parseSettings(raw: string | null): EagleEyeSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export default function EagleEyeSettingsScreen() {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<EagleEyeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw: string | null) => setSettings(parseSettings(raw)))
      .catch(() => setSettings({ ...DEFAULT_SETTINGS }))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(<K extends keyof EagleEyeSettings>(
    key: K,
    value: EagleEyeSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      Alert.alert("", EE.settingsSaved);
    } catch {
      // Silently fail — settings are best-effort
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.bgPrimary, paddingTop: insets.top },
        ]}
      >
        <BackHeader title={EE.settingsTitle} colors={colors} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.accentPrimary} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.root, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}
    >
      <BackHeader title={EE.settingsTitle} colors={colors} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + UITokens.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Safety Features ──────────────────────────────────────────────── */}
        <SectionHeader title={EE.safetyFeatures} colors={colors} />

        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          {/* Liquidity cap — always on */}
          <SettingRow
            label={EE.liquidityCap}
            sublabel={EE.liquidityCapAlwaysOn}
            colors={colors}
          >
            <Switch
              value={true}
              disabled
              trackColor={{ false: colors.borderColor, true: colors.success }}
              thumbColor="#fff"
            />
          </SettingRow>

          <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

          {/* Circuit breaker */}
          <SettingRow
            label={EE.circuitBreaker}
            colors={colors}
          >
            <Switch
              value={settings.circuitBreaker}
              onValueChange={(v) => update("circuitBreaker", v)}
              trackColor={{ false: colors.borderColor, true: colors.success }}
              thumbColor="#fff"
            />
          </SettingRow>

          <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

          {/* Confirm large positions */}
          <SettingRow
            label={EE.confirmLargePositions}
            colors={colors}
          >
            <Switch
              value={settings.confirmLargePositions}
              onValueChange={(v) => update("confirmLargePositions", v)}
              trackColor={{ false: colors.borderColor, true: colors.success }}
              thumbColor="#fff"
            />
          </SettingRow>
        </View>

        {/* ── Position Limits ──────────────────────────────────────────────── */}
        <SectionHeader title={EE.positionLimits} colors={colors} />

        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <SettingRow label={EE.sectorExposureCap} colors={colors}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.numInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.borderColor,
                    backgroundColor: colors.bgCardHover,
                  },
                ]}
                value={settings.sectorCapPct}
                onChangeText={(v) =>
                  update("sectorCapPct", v.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: colors.textMuted }]}>%</Text>
            </View>
          </SettingRow>
        </View>

        {/* ── Display ──────────────────────────────────────────────────────── */}
        <SectionHeader title={EE.displaySection} colors={colors} />

        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
        >
          <SettingRow label={EE.minConfidenceDisplay} colors={colors}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.numInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.borderColor,
                    backgroundColor: colors.bgCardHover,
                  },
                ]}
                value={settings.minConfidenceDisplay}
                onChangeText={(v) =>
                  update("minConfidenceDisplay", v.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: colors.textMuted }]}>%</Text>
            </View>
          </SettingRow>

          <View style={[styles.divider, { backgroundColor: colors.borderColor }]} />

          {/* Default sort */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>
              {EE.defaultSort}
            </Text>
            <View style={styles.sortRow}>
              {SORT_OPTIONS.map((opt) => {
                const active = settings.defaultSort === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => update("defaultSort", opt.key)}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: active
                          ? colors.accentPrimary
                          : colors.bgCardHover,
                        borderColor: active ? colors.accentPrimary : colors.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        { color: active ? "#fff" : colors.textSecondary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Save ─────────────────────────────────────────────────────────── */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: pressed ? colors.accentSecondary : colors.accentPrimary,
              opacity: saving ? 0.7 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <FontAwesome name="save" size={14} color="#fff" />
              <Text style={styles.saveBtnText}>{EE.saveSettings}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function BackHeader({
  title,
  colors,
}: {
  title: string;
  colors: ThemePalette;
}) {
  const router = useRouter();
  return (
    <View
      style={[
        styles.backHeader,
        { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <FontAwesome name="chevron-left" size={16} color={colors.accentPrimary} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.textPrimary }]}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

function SectionHeader({ title, colors }: { title: string; colors: ThemePalette }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
  );
}

function SettingRow({
  label,
  sublabel,
  colors,
  children,
}: {
  label: string;
  sublabel?: string;
  colors: ThemePalette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelWrapper}>
        <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.settingSubLabel, { color: colors.textMuted }]}>{sublabel}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  scroll: {
    padding: UITokens.spacing.md,
    gap: UITokens.spacing.sm,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: UITokens.spacing.sm,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: UITokens.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: UITokens.spacing.md,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UITokens.spacing.md,
    paddingVertical: UITokens.spacing.sm + 4,
    minHeight: 52,
    gap: UITokens.spacing.sm,
  },
  settingLabelWrapper: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  settingSubLabel: {
    fontSize: 11,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  numInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderRadius: UITokens.radius.sm,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  unitLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  sortRow: {
    flexDirection: "row",
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: UITokens.radius.pill,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: UITokens.spacing.sm,
    marginTop: UITokens.spacing.md,
    paddingVertical: 14,
    borderRadius: UITokens.radius.md,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
