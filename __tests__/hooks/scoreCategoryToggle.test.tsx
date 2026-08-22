import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ScorePanel } from "@/src/features/fundamental-analysis/components/ScorePanel";

const mockMutate = jest.fn();

const stablePreferences = {
  profitability: true,
  liquidity: true,
  capital_structure: true,
  efficiency: true,
  valuation: true,
  cashflow: true,
  growth: true,
} as const;

const stableScoreData = {
  overall_score: 72,
  fundamental_score: 70,
  valuation_score: 68,
  growth_score: 74,
  quality_score: 75,
  risk_score: 20,
  risk_penalty_pct: 4,
  scoring_date: "2026-08-22",
  details: { "Current Price": 100 },
  metric_category_scores: {
    profitability: 80,
    liquidity: 60,
    capital_structure: 70,
    efficiency: 75,
    valuation: 68,
    cashflow: 77,
    growth: 74,
  },
  metric_category_preferences: stablePreferences,
  metric_category_breakdown: {
    profitability: { base: 0, metrics: [] },
    liquidity: { base: 0, metrics: [] },
    capital_structure: { base: 0, metrics: [] },
    efficiency: { base: 0, metrics: [] },
    valuation: { base: 0, metrics: [] },
    cashflow: { base: 0, metrics: [] },
    growth: { base: 0, metrics: [] },
  },
};

const stableCategoryPrefsResponse = {
  preferences: stablePreferences,
  pro_rata_weights: {
    profitability: 0.2,
    liquidity: 0.08,
    capital_structure: 0.12,
    efficiency: 0.1,
    valuation: 0.15,
    cashflow: 0.2,
    growth: 0.15,
  },
};

jest.mock("@/hooks/queries", () => ({
  analysisKeys: {
    metrics: (stockId: number) => ["analysis-metrics", stockId],
    growth: (stockId: number) => ["analysis-growth", stockId],
    score: (stockId: number) => ["analysis-score", stockId],
    scoreHistory: (stockId: number) => ["analysis-score-history", stockId],
    valuations: (stockId: number) => ["analysis-valuations", stockId],
  },
  useStockScore: () => ({
    data: stableScoreData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isFetching: false,
  }),
  useScoreHistory: () => ({ data: { scores: [] } }),
  useValuations: () => ({ data: { valuations: [] } }),
  useStatements: () => ({ data: { statements: [], latest_preferred: null } }),
  useScoreCategoryPreferences: () => ({
    data: stableCategoryPrefsResponse,
  }),
  useUpdateScoreCategoryPreferences: () => ({ mutate: mockMutate }),
}));

jest.mock("@/src/store/userPrefsStore", () => ({
  useUserPrefsStore: () => ({ preferences: { expertiseLevel: "advanced" } }),
}));

jest.mock("@/lib/aiSummaryGenerator", () => ({
  generateStockSummary: () => null,
}));

jest.mock("@/components/ui/PageSkeletons", () => ({
  FAPanelSkeleton: () => null,
}));

jest.mock("@/src/features/fundamental-analysis/components/shared", () => {
  const ReactNative = require("react-native");
  return {
    Card: ({ children }: { children: React.ReactNode }) => <ReactNative.View>{children}</ReactNative.View>,
    ExportBar: () => null,
    FadeIn: ({ children }: { children: React.ReactNode }) => <ReactNative.View>{children}</ReactNative.View>,
    NetworkErrorState: () => null,
    SectionHeader: ({ title }: { title: string }) => <ReactNative.Text>{title}</ReactNative.Text>,
  };
});

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({ data, renderItem }: { data: unknown[]; renderItem: (item: { item: unknown; index: number }) => React.ReactNode }) => {
    const ReactNative = require("react-native");
    return <ReactNative.View>{data.map((item, index) => renderItem({ item, index }))}</ReactNative.View>;
  },
}));

const colors = {
  bgPrimary: "#000000",
  bgSecondary: "#111111",
  bgCard: "#222222",
  bgInput: "#333333",
  borderColor: "#444444",
  textPrimary: "#ffffff",
  textSecondary: "#dddddd",
  textMuted: "#aaaaaa",
  accentPrimary: "#00aaff",
  accentSecondary: "#ffaa00",
  success: "#00cc66",
  warning: "#ffcc00",
  danger: "#ff4444",
} as const;

describe("ScorePanel category toggles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("toggles Profitability category from checked to unchecked and sends update payload", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScorePanel
          stockId={7}
          stockSymbol="TEST"
          colors={colors as never}
          isDesktop={false}
        />
      </QueryClientProvider>,
    );

    const checkbox = await screen.findByLabelText("Exclude Profitability from score");
    fireEvent.press(checkbox);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    const payload = mockMutate.mock.calls[0][0] as Array<{ category_key: string; included: boolean }>;
    const profitability = payload.find((p) => p.category_key === "profitability");
    expect(profitability?.included).toBe(false);
    expect(payload.filter((p) => p.included).length).toBe(6);

    expect(screen.getByLabelText("Include Profitability from score")).toBeTruthy();
  });
});
