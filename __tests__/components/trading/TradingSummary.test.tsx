import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/components/ui/ResponsiveGrid", () => ({
  ResponsiveGrid: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    isPhone: true,
  }),
}));

jest.mock("@/components/form/DateInput", () => ({
  DateInput: ({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) => {
    const { TextInput: MockTextInput } = require("react-native");
    return <MockTextInput testID="mock-date-input" value={value} onChangeText={onChangeText} />;
  },
}));

jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    colors: {
      bgCard: "#1a1a2e",
      borderColor: "rgba(255,255,255,0.08)",
      accentPrimary: "#8a2be2",
      accentSecondary: "#4cc9f0",
      textPrimary: "#e6e6f0",
      textSecondary: "#a0a0b0",
      textMuted: "#6b6b80",
      success: "#00d4ff",
      danger: "#ff4757",
    },
  }),
}));

jest.mock("@/lib/exportRealizedTransactionsReport", () => ({
  exportRealizedTransactionsReport: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, value?: string | { defaultValue?: string }) => {
      if (typeof value === "string") return value;
      if (key === "trading.recordsCount" && typeof value?.count === "number") {
        return `${value.count} records`;
      }
      const labels: Record<string, string> = {
        "trading.sinceInception": "Since Inception",
        "trading.allValuesKWD": "All values in KWD",
        "trading.capitalFlow": "CAPITAL FLOW",
        "trading.deposits": "Deposits",
        "trading.withdrawals": "Withdrawals",
      };
      if (labels[key]) return labels[key];
      return value?.defaultValue ?? key;
    },
  }),
}));

import { TradingSummaryCards } from "@/components/trading/TradingSummary";
import { exportRealizedTransactionsReport } from "@/lib/exportRealizedTransactionsReport";

const summary = {
  total_deposits: 130726.739,
  deposit_count: 50,
  total_withdrawals: 4650,
  withdrawal_count: 3,
} as any;

const realizedData = {
  total_realized_kwd: 1234.5,
  total_profit_kwd: 1800,
  total_loss_kwd: -565.5,
  details: [
    {
      id: 3,
      symbol: "ZAIN",
      portfolio: "USA",
      txn_date: "2025-05-25",
      shares: 100,
      sell_value: 300,
      avg_cost_at_txn: 2.2,
      realized_pnl: 55,
      realized_pnl_kwd: 55,
      currency: "KWD",
      source: "manual",
    },
    {
      id: 2,
      symbol: "NBK",
      portfolio: "KFH",
      txn_date: "2025-05-20",
      shares: 400,
      sell_value: 1000,
      avg_cost_at_txn: 2,
      realized_pnl: 120,
      realized_pnl_kwd: 120,
      dividends_allocated_kwd: 10,
      net_pnl_kwd: 130,
      currency: "KWD",
      source: "manual",
    },
    {
      id: 1,
      symbol: "MABANEE",
      portfolio: "BBYN",
      txn_date: "2025-05-10",
      shares: 250,
      sell_value: 900,
      avg_cost_at_txn: 2.5,
      realized_pnl: -30,
      realized_pnl_kwd: -30,
      dividends_allocated_kwd: 45.5,
      net_pnl_kwd: 15.5,
      currency: "KWD",
      source: "manual",
    },
  ],
};

function TradingSummaryHarness() {
  const [activeTab, setActiveTab] = React.useState<"capitalFlow" | "realizedTransactions">("capitalFlow");

  return (
    <TradingSummaryCards
      summary={summary}
      realizedData={realizedData}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

describe("TradingSummaryCards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows capital flow by default", () => {
    render(<TradingSummaryHarness />);

    expect(screen.getByText("Transaction Details")).toBeTruthy();
    expect(screen.getByText("Deposits")).toBeTruthy();
    expect(screen.queryByText("NBK")).toBeNull();
  });

  it("switches to the realized transactions tab", () => {
    render(<TradingSummaryHarness />);

    fireEvent.press(screen.getByText("Realized Transactions"));

    expect(screen.getByText("Total Realized")).toBeTruthy();
    expect(screen.getAllByText("Win Rate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("realized-outcome-rate").props.children).toBe("+100.00%");
    expect(screen.getByTestId("realized-outcome-wins").props.children).toBe("3");
    expect(screen.getByTestId("realized-outcome-losses").props.children).toBe("0");
    expect(screen.getByText("All realized transactions")).toBeTruthy();
    expect(screen.getByText("Realized P&L")).toBeTruthy();
    expect(screen.getByText("Cash Dividends")).toBeTruthy();
    expect(screen.getByText("Purchase Value")).toBeTruthy();
    expect(screen.getAllByText("Net P/L").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("P&L %")).toBeTruthy();
    expect(screen.getAllByText("3 records").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ZAIN")).toBeTruthy();
    expect(screen.getByText("NBK")).toBeTruthy();
    expect(screen.getByText("MABANEE")).toBeTruthy();
    expect(screen.getByText("220.000 KWD")).toBeTruthy();
    expect(screen.getByText("-30.000 KWD")).toBeTruthy();
    expect(screen.getByText("+45.500 KWD")).toBeTruthy();
    expect(screen.getByText("+15.500 KWD")).toBeTruthy();
    expect(screen.getByText("+2.48%")).toBeTruthy();
  });

  it("filters realized transactions by symbol and date range", () => {
    render(<TradingSummaryHarness />);

    fireEvent.press(screen.getByText("Realized Transactions"));
    fireEvent.changeText(screen.getByPlaceholderText("Search stock or symbol"), "NBK");
    const dateInputs = screen.getAllByTestId("mock-date-input");
    fireEvent.changeText(dateInputs[0], "2025-05-15");
    fireEvent.changeText(dateInputs[1], "2025-05-22");

    expect(screen.getByText("NBK")).toBeTruthy();
    expect(screen.queryByText("ZAIN")).toBeNull();
    expect(screen.queryByText("MABANEE")).toBeNull();
    expect(screen.getAllByText("1 records").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  it("sorts realized transactions when a header is pressed", () => {
    render(<TradingSummaryHarness />);

    fireEvent.press(screen.getByText("Realized Transactions"));

    expect(screen.getAllByTestId("realized-row-symbol").map((node) => node.props.children)).toEqual([
      "ZAIN",
      "NBK",
      "MABANEE",
    ]);

    fireEvent.press(screen.getByTestId("realized-sort-shares"));

    expect(screen.getAllByTestId("realized-row-symbol").map((node) => node.props.children)).toEqual([
      "ZAIN",
      "MABANEE",
      "NBK",
    ]);

    fireEvent.press(screen.getByTestId("realized-sort-shares"));

    expect(screen.getAllByTestId("realized-row-symbol").map((node) => node.props.children)).toEqual([
      "NBK",
      "MABANEE",
      "ZAIN",
    ]);
  });

  it("exports the visible realized transactions report", async () => {
    render(<TradingSummaryHarness />);

    fireEvent.press(screen.getByText("Realized Transactions"));
    fireEvent.changeText(screen.getByPlaceholderText("Search stock or symbol"), "NBK");
    fireEvent.press(screen.getByTestId("export-realized-transactions"));

    await waitFor(() => {
      expect(exportRealizedTransactionsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: [
            expect.objectContaining({
              symbol: "NBK",
              portfolio: "KFH",
              purchaseValueKwd: 800,
              netPnlKwd: 130,
              pnlPct: 16.25,
            }),
          ],
          filters: {
            symbol: "NBK",
            fromDate: "",
            toDate: "",
          },
          summary: expect.objectContaining({
            visibleTrades: 1,
            sortColumn: "Date",
            sortDirection: "desc",
          }),
        }),
      );
    });
  });

  it("renders derived dividends when the API row only provides net P&L", async () => {
    const realizedFromApi = {
      total_realized_kwd: 55,
      total_profit_kwd: 55,
      total_loss_kwd: 0,
      total_dividends_allocated_kwd: 25,
      details: [
        {
          id: 11,
          symbol: "NBK",
          portfolio: "KFH",
          txn_date: "2025-05-20",
          shares: 400,
          sell_value: 1000,
          avg_cost_at_txn: 2,
          realized_pnl: 55,
          realized_pnl_kwd: 55,
          net_pnl_kwd: 80,
          dividends_allocated_kwd: 25,
          currency: "KWD",
          source: "stored",
        },
      ],
    };

    render(
      <TradingSummaryCards
        summary={summary}
        realizedData={realizedFromApi}
        activeTab="realizedTransactions"
        onTabChange={() => undefined}
      />,
    );

    expect(screen.getByText("+25.000 KWD")).toBeTruthy();
    expect(screen.getByText("+80.000 KWD")).toBeTruthy();
  });
});