import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../helpers";

const mockTradingSummary = {
  data: {
    summary: {
      total_transactions: 0,
      total_trades: 0,
      total_pnl: 0,
    },
    transactions: [],
    pagination: {
      page: 1,
      total_pages: 1,
      total_items: 0,
    },
  },
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: jest.fn(),
  isFetching: false,
};

const mockRealizedProfit = {
  data: {
    total_realized_kwd: 123.45,
    total_profit_kwd: 150,
    total_loss_kwd: -26.55,
    details: [],
  },
};

jest.mock("@/hooks/queries", () => ({
  useTradingSummary: () => mockTradingSummary,
  useRiskMetrics: () => ({ data: null }),
  useRealizedProfit: () => mockRealizedProfit,
}));

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    width: 390,
    height: 844,
    bp: "phone",
    isPhone: true,
    isTablet: false,
    isDesktop: false,
    fonts: { title: 18, caption: 13 },
    spacing: { pagePx: 16 },
  }),
}));

jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    colors: {
      bgPrimary: "#0a0a15",
      bgSecondary: "#121220",
      bgCard: "#1a1a2e",
      bgCardHover: "#252540",
      bgInput: "#121220",
      textPrimary: "#e6e6f0",
      textSecondary: "#a0a0b0",
      textMuted: "#6b6b80",
      accentPrimary: "#8a2be2",
      accentSecondary: "#4cc9f0",
      accentTertiary: "#ff00cc",
      success: "#00d4ff",
      danger: "#ff4757",
      borderColor: "rgba(255,255,255,0.08)",
    },
  }),
}));

jest.mock("@/components/ui/ErrorBoundary", () => ({
  withErrorBoundary: (Component: React.ComponentType) => Component,
}));

jest.mock("@/components/ui/ErrorScreen", () => ({
  ErrorScreen: () => null,
}));

jest.mock("@/components/ui/PageSkeletons", () => ({
  TradingSkeleton: () => null,
}));

jest.mock("@/components/trading/TradingSummary", () => ({
  TradingSummaryCards: ({
    realizedData,
    activeTab,
    onTabChange,
  }: {
    realizedData?: { total_realized_kwd: number } | null;
    activeTab: "capitalFlow" | "realizedTransactions";
    onTabChange: (tab: "capitalFlow" | "realizedTransactions") => void;
  }) => {
    const { Pressable, Text } = require("react-native");
    return (
      <>
        <Text testID="trading-summary-cards">summary</Text>
        <Text testID="trading-summary-active-tab">{activeTab}</Text>
        <Text testID="trading-summary-realized-value">{realizedData?.total_realized_kwd ?? "none"}</Text>
        <Pressable testID="switch-to-realized-tab" onPress={() => onTabChange("realizedTransactions")}>
          <Text>switch</Text>
        </Pressable>
      </>
    );
  },
}));

jest.mock("@/components/trading/TradingFilters", () => ({
  FilterChip: () => null,
  PORTFOLIOS: ["KFH", "BBYN", "USA"],
  TXN_TYPES: ["Buy", "Sell", "Dividend_Only"],
}));

jest.mock("@/components/portfolio/KpiWidgets", () => ({
  KpiCard: () => null,
}));

jest.mock("@/components/ui/InfoTip", () => ({
  InfoTip: () => null,
  GLOSSARY: {},
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock("@/components/trading/TradingEditableRow", () => ({
  EDIT_COLUMNS: [],
  EDIT_TABLE_WIDTH: 0,
  EditableTableRow: () => null,
  editRowChanged: () => false,
  editStyles: {
    modeToggle: {},
    modeBtn: {},
    modeBtnText: {},
    editWarning: {},
    editWarningText: {},
    editActionRow: {},
    editActionBtn: {},
    editActionBtnText: {},
    confirmOverlay: {},
    confirmText: {},
    confirmBtnRow: {},
    confirmBtn: {},
    confirmBtnText: {},
  },
  txnToEditRow: () => ({
    date: "",
    symbol: "",
    portfolio: "",
    type: "Buy",
    quantity: "0",
    price: "0",
    fees: "0",
    notes: "",
  }),
}));

jest.mock("@/components/trading/TradingTable", () => ({
  HeaderCell: () => null,
  sortTransactions: (transactions: unknown[]) => transactions,
  TABLE_COLUMNS: [],
  TableRow: () => null,
  TOTAL_TABLE_WIDTH: 0,
  ts: {
    tableOuter: {},
    headerRow: {},
    headerCell: {},
    headerText: {},
  },
}));

jest.mock("@/services/api", () => ({
  deleteTransaction: jest.fn(),
  exportTradingExcel: jest.fn(),
  recalculateWAC: jest.fn(),
  renameStockBySymbol: jest.fn(),
  updateTransaction: jest.fn(),
}));

import TradingScreen from "@/app/(tabs)/trading";

function renderScreen(qc?: QueryClient) {
  const queryClient = qc ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TradingScreen />
    </QueryClientProvider>
  );
}

describe("TradingScreen", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockTradingSummary.refetch.mockClear();
    mockRealizedProfit.data = {
      total_realized_kwd: 123.45,
      total_profit_kwd: 150,
      total_loss_kwd: -26.55,
      details: [],
    };
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("passes realized data into the trading summary cards when realized data is available", () => {
    renderScreen(queryClient);

    expect(screen.getByTestId("trading-summary-cards")).toBeTruthy();
    expect(screen.getByTestId("trading-summary-active-tab").props.children).toBe("capitalFlow");
    expect(screen.getByTestId("trading-summary-realized-value").props.children).toBe(123.45);
  });

  it("does not render a standalone realized trades breakdown section on the page", () => {
    renderScreen(queryClient);

    expect(screen.queryByTestId("realized-trades-section")).toBeNull();
  });

  it("passes null realized data into the trading summary cards when realized data is unavailable", () => {
    mockRealizedProfit.data = null;

    renderScreen(queryClient);

    expect(screen.getByTestId("trading-summary-realized-value").props.children).toBe("none");
  });

  it("hides the transaction log when the realized transactions tab is active", () => {
    renderScreen(queryClient);

    expect(screen.getByText("trading.transactionLog")).toBeTruthy();

    fireEvent.press(screen.getByTestId("switch-to-realized-tab"));

    expect(screen.getByTestId("trading-summary-active-tab").props.children).toBe("realizedTransactions");
    expect(screen.queryByText("trading.transactionLog")).toBeNull();
  });
});