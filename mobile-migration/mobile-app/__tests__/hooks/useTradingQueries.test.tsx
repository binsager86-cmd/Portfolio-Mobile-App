/**
 * useTradingQueries — unit tests for trading summary hook.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { tradingKeys, useTradingSummary } from "@/hooks/queries/useTradingQueries";

const mockGetTradingSummary = jest.fn();

jest.mock("@/services/api", () => ({
  getTradingSummary: (...a: unknown[]) =>
    (mockGetTradingSummary as (...a: unknown[]) => unknown)(...a),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("tradingKeys", () => {
  it("namespaces under 'trading-summary'", () => {
    expect(tradingKeys.summary("a")[0]).toBe("trading-summary");
  });

  it("varies by filter values", () => {
    expect(tradingKeys.summary(["KFH"])).not.toEqual(tradingKeys.summary(["NBK"]));
  });
});

describe("useTradingSummary", () => {
  beforeEach(() => mockGetTradingSummary.mockReset());

  it("collapses single-element arrays into scalar params", async () => {
    mockGetTradingSummary.mockResolvedValue({ rows: [], total: 0 });
    const { result } = renderHook(
      () =>
        useTradingSummary({
          portfolios: ["KFH"],
          txnTypes: ["buy"],
          search: "  bbyn  ",
          page: 1,
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetTradingSummary).toHaveBeenCalledWith({
      portfolio: "KFH",
      txn_type: "buy",
      date_from: undefined,
      date_to: undefined,
      search: "bbyn",
      page: 1,
      page_size: 100,
    });
  });

  it("sends undefined when multiple values are selected (server-side multi unsupported)", async () => {
    mockGetTradingSummary.mockResolvedValue({ rows: [], total: 0 });
    const { result } = renderHook(
      () =>
        useTradingSummary({
          portfolios: ["KFH", "NBK"],
          txnTypes: ["buy", "sell"],
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetTradingSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolio: undefined,
        txn_type: undefined,
      }),
    );
  });

  it("normalises empty search to undefined and forwards date filters", async () => {
    mockGetTradingSummary.mockResolvedValue({ rows: [], total: 0 });
    const { result } = renderHook(
      () =>
        useTradingSummary({
          search: "   ",
          dateFrom: "2025-01-01",
          dateTo: "2025-12-31",
          pageSize: 50,
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetTradingSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        search: undefined,
        date_from: "2025-01-01",
        date_to: "2025-12-31",
        page_size: 50,
      }),
    );
  });
});
