/**
 * User Preferences store (Zustand) — persists expertise level, language, and feature flags.
 *
 * Follows the same persistence pattern as themeStore.ts:
 * On Web    → localStorage (sync)
 * On Native → expo-secure-store (async)
 */

import { Platform } from "react-native";
import { create } from "zustand";

// Lazy import to avoid pulling fetch + auth into stores that don't need it.
async function syncPrefsToBackend(prefs: NotificationPreferences): Promise<void> {
  try {
    const mod = await import("../../services/notifications/notificationPrefsService");
    await mod.pushNotificationPrefs(prefs);
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefsStore] backend sync failed:", err);
  }
}

// Mirror the non-notification prefs (expertise, language, feature flags) to
// the backend so they follow the user across devices and re-installs.
async function syncUserPrefsToBackend(prefs: UserPreferences): Promise<void> {
  try {
    const mod = await import("../../services/userPrefs/userPrefsService");
    await mod.pushUserPrefs({
      expertiseLevel: prefs.expertiseLevel,
      language: prefs.language,
      showAdvancedMetrics: prefs.showAdvancedMetrics,
      enableShariaFilter: prefs.enableShariaFilter,
      dividendFocus: prefs.dividendFocus,
    });
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefsStore] user-prefs sync failed:", err);
  }
}

export type ExpertiseLevel = "normal" | "intermediate" | "advanced";
export type AppLanguage = "en" | "ar";

export interface ExpertiseLevelConfig {
  key: ExpertiseLevel;
  label: string;
  icon: string; // FontAwesome icon name
  description: string;
  youAre: string[];
  youGet: string[];
}

export const EXPERTISE_LEVELS: ExpertiseLevelConfig[] = [
  {
    key: "normal",
    label: "Normal",
    icon: "user",
    description: "Perfect for everyday investors who want a clean, simple experience.",
    youAre: [
      "New to investing or prefer simplicity",
      "Focused on tracking your portfolio",
      "Not interested in complex metrics",
    ],
    youGet: [
      "Portfolio overview & health",
      "Transaction management",
      "Deposit tracking",
      "Dividend summaries",
    ],
  },
  {
    key: "intermediate",
    label: "Intermediate",
    icon: "line-chart",
    description: "For investors who want deeper insights and analytical tools.",
    youAre: [
      "Comfortable with financial concepts",
      "Want to analyze stock fundamentals",
      "Looking for actionable insights",
    ],
    youGet: [
      "Everything in Normal, plus:",
      "Fundamental analysis & scoring",
      "Decision engine recommendations",
      "Price alerts & notifications",
    ],
  },
  {
    key: "advanced",
    label: "Advanced",
    icon: "rocket",
    description: "Full access to every tool, metric, and advanced feature.",
    youAre: [
      "Experienced investor or analyst",
      "Want full control over all features",
      "Comfortable with advanced metrics",
    ],
    youGet: [
      "Everything in Intermediate, plus:",
      "Investment planner & projections",
      "Trade simulator",
      "Advanced valuation models",
      "Data extraction & backup tools",
    ],
  },
];

export interface NotificationPreferences {
  newsNotifications: boolean;
  portfolioUpdates: boolean;
  priceAlerts: boolean;
  dailyPriceUpdates: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  newsNotifications: true,
  portfolioUpdates: true,
  priceAlerts: true,
  dailyPriceUpdates: true,
};

export interface UserPreferences {
  expertiseLevel: ExpertiseLevel;
  language: AppLanguage;
  showAdvancedMetrics: boolean;
  enableShariaFilter: boolean;
  dividendFocus: boolean;
  notifications: NotificationPreferences;
}

const STORAGE_KEY = "user_prefs";

const DEFAULT_PREFS: UserPreferences = {
  expertiseLevel: "normal",
  language: "en",
  showAdvancedMetrics: false,
  enableShariaFilter: false,
  dividendFocus: false,
  notifications: { ...DEFAULT_NOTIFICATION_PREFS },
};

// ── Persistence helpers ─────────────────────────────────────────────

async function loadPrefs(): Promise<UserPreferences> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      const SecureStore = await import("expo-secure-store");
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefsStore] Failed to load preferences:", err);
  }
  return DEFAULT_PREFS;
}

async function savePrefs(prefs: UserPreferences): Promise<void> {
  try {
    const raw = JSON.stringify(prefs);
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    }
  } catch (err) {
    if (__DEV__) console.warn("[UserPrefsStore] Failed to persist preferences:", err);
  }
}

// ── Store ───────────────────────────────────────────────────────────

interface UserPrefsState {
  preferences: UserPreferences;
  hydrated: boolean;
  hydrate: () => void;
  pullRemote: () => Promise<void>;
  setExpertiseLevel: (level: ExpertiseLevel) => void;
  setLanguage: (lang: AppLanguage) => void;
  toggleAdvancedMetrics: () => void;
  toggleShariaFilter: () => void;
  toggleDividendFocus: () => void;
  toggleNotification: (key: keyof NotificationPreferences) => void;
  resetToDefaults: () => void;
}

export const useUserPrefsStore = create<UserPrefsState>((set, get) => ({
  preferences: DEFAULT_PREFS,
  hydrated: false,

  hydrate: async () => {
    const prefs = await loadPrefs();
    set({ preferences: prefs, hydrated: true });
    // Best-effort remote pull. Safe to call even when unauthenticated —
    // pullUserPrefs returns null without a token. Will be re-invoked by
    // the layout once login completes.
    await get().pullRemote();
  },

  pullRemote: async () => {
    try {
      const mod = await import("../../services/userPrefs/userPrefsService");
      const remote = await mod.pullUserPrefs();
      if (!remote) return;
      const prev = get().preferences;
      const merged: UserPreferences = {
        ...prev,
        expertiseLevel: remote.expertiseLevel ?? prev.expertiseLevel,
        language: remote.language ?? prev.language,
        showAdvancedMetrics:
          remote.showAdvancedMetrics ?? prev.showAdvancedMetrics,
        enableShariaFilter:
          remote.enableShariaFilter ?? prev.enableShariaFilter,
        dividendFocus: remote.dividendFocus ?? prev.dividendFocus,
      };
      set({ preferences: merged });
      savePrefs(merged);
    } catch (err) {
      if (__DEV__) console.warn("[UserPrefsStore] remote hydrate failed:", err);
    }
  },

  setExpertiseLevel: (level) => {
    const next = {
      ...get().preferences,
      expertiseLevel: level,
      showAdvancedMetrics: level !== "normal",
    };
    set({ preferences: next });
    savePrefs(next);
    void syncUserPrefsToBackend(next);
  },

  setLanguage: (lang) => {
    const next = { ...get().preferences, language: lang };
    set({ preferences: next });
    savePrefs(next);
    void syncUserPrefsToBackend(next);
  },

  toggleAdvancedMetrics: () => {
    const next = {
      ...get().preferences,
      showAdvancedMetrics: !get().preferences.showAdvancedMetrics,
    };
    set({ preferences: next });
    savePrefs(next);
    void syncUserPrefsToBackend(next);
  },

  toggleShariaFilter: () => {
    const next = {
      ...get().preferences,
      enableShariaFilter: !get().preferences.enableShariaFilter,
    };
    set({ preferences: next });
    savePrefs(next);
    void syncUserPrefsToBackend(next);
  },

  toggleDividendFocus: () => {
    const next = {
      ...get().preferences,
      dividendFocus: !get().preferences.dividendFocus,
    };
    set({ preferences: next });
    savePrefs(next);
    void syncUserPrefsToBackend(next);
  },

  toggleNotification: (key) => {
    const prev = get().preferences;
    const next = {
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      },
    };
    set({ preferences: next });
    savePrefs(next);
    // Mirror the change to the backend so the push dispatcher honors it.
    void syncPrefsToBackend(next.notifications);
  },

  resetToDefaults: () => {
    set({ preferences: DEFAULT_PREFS });
    savePrefs(DEFAULT_PREFS);
    void syncUserPrefsToBackend(DEFAULT_PREFS);
    void syncPrefsToBackend(DEFAULT_PREFS.notifications);
  },
}));
