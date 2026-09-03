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
      total_deposits: 133231.207,
      deposit_count: 52,
      total_withdrawals: 4650,
      withdrawal_count: 0,
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

const mockDeposits = {
  data: {
    deposits: [
      {
        id: 101,
        user_id: 1,
        portfolio: "KFH",
        deposit_date: "2026-07-01",
        amount: 2500,
        currency: "KWD",
        bank_name: null,
        source: "deposit",
        notes: "opening cash",
        is_deleted: 0,
        created_at: null,
      },
    ],
    count: 1,
    total_kwd: 2500,
    pagination: { page: 1, page_size: 200, total_items: 1, total_pages: 1 },
  },
  refetch: jest.fn(),
};

const mockRealizedProfit: {
  data: { total_realized_kwd: number; total_profit_kwd: number; total_loss_kwd: number; details: any[] } | null;
} = {
  data: {
    total_realized_kwd: 123.45,
    total_profit_kwd: 150,
    total_loss_kwd: -26.55,
    details: [],
  },
};

jest.mock("@/hooks/queries", () => ({
  useTradingSummary: () => mockTradingSummary,
  useDeposits: () => mockDeposits,
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
  FilterChip: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable testID={`filter-chip-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
  PORTFOLIOS: ["KFH", "BBYN", "USA"],
  TXN_TYPES: ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend_Only"],
}));

jest.mock("@/components/form/DateInput", () => ({
  DateInput: ({ value, placeholder, onChangeText }: { value: string; placeholder: string; onChangeText: (value: string) => void }) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable testID={`date-input-${placeholder}`} onPress={() => onChangeText("2026-07-01")}>
        <Text>{value || placeholder}</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/portfolio/KpiWidgets", () => ({
  KpiCard: () => null,
}));

jest.mock("@/components/ui/InfoTip", () => ({
  InfoTip: () => null,
  GLOSSARY: {},
}));

jest.mock("@shopify/flash-list", () => ({
  FlashList: ({ data = [], renderItem, children }: { data?: unknown[]; renderItem?: (args: { item: unknown; index: number }) => React.ReactNode; children?: React.ReactNode }) => {
    const { View } = require("react-native");
    if (renderItem) return <>{data.map((item, index) => <View key={index}>{renderItem({ item, index })}</View>)}</>;
    return children ?? null;
  },
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
  TableRow: ({ txn }: { txn: { type: string; company_name: string; value: number } }) => {
    const { Text } = require("react-native");
    return (
      <>
        <Text>{txn.type}</Text>
        <Text>{txn.company_name}</Text>
        <Text>{txn.value}</Text>
      </>
    );
  },
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
    mockDeposits.refetch.mockClear();
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

  it("shows deposit rows from the deposits API when trading transactions are empty", () => {
    renderScreen(queryClient);

    fireEvent.press(screen.getByTestId("filter-chip-Deposit"));

    expect(screen.getByText("1 trading.transactionsLabel · Deposit")).toBeTruthy();
  expect(screen.getAllByText("Deposit").length).toBeGreaterThan(1);
    expect(screen.getByText("Cash Deposit")).toBeTruthy();
    expect(screen.getByText("2500")).toBeTruthy();
    expect(screen.queryByText("trading.noTransactions")).toBeNull();
  });

  it("uses calendar date inputs for the trading date filters", () => {
    renderScreen(queryClient);

    fireEvent.press(screen.getByTestId("date-input-trading.fromDate"));

    expect(screen.getByText("1 trading.transactionsLabel · from 2026-07-01")).toBeTruthy();
  });
});