/**
 * useAnalysisQueries — unit tests for fundamental analysis hooks.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  analysisKeys,
  useAnalysisStocks,
  useStatements,
  useStockMetrics,
  useGrowthAnalysis,
  useStockScore,
  useScoreHistory,
  useValuations,
  useValuationDefaults,
  usePeerMultiples,
} from "@/hooks/queries/useAnalysisQueries";

const mockGetAnalysisStocks = jest.fn();
const mockGetStatements = jest.fn();
const mockGetStockMetrics = jest.fn();
const mockGetGrowthAnalysis = jest.fn();
const mockGetStockScore = jest.fn();
const mockGetScoreHistory = jest.fn();
const mockGetValuations = jest.fn();
const mockGetValuationDefaults = jest.fn();
const mockGetPeerMultiples = jest.fn();

jest.mock("@/services/api", () => ({
  getAnalysisStocks: (...a: unknown[]) =>
    (mockGetAnalysisStocks as (...a: unknown[]) => unknown)(...a),
  getStatements: (...a: unknown[]) =>
    (mockGetStatements as (...a: unknown[]) => unknown)(...a),
  getStockMetrics: (...a: unknown[]) =>
    (mockGetStockMetrics as (...a: unknown[]) => unknown)(...a),
  getGrowthAnalysis: (...a: unknown[]) =>
    (mockGetGrowthAnalysis as (...a: unknown[]) => unknown)(...a),
  getStockScore: (...a: unknown[]) =>
    (mockGetStockScore as (...a: unknown[]) => unknown)(...a),
  getScoreHistory: (...a: unknown[]) =>
    (mockGetScoreHistory as (...a: unknown[]) => unknown)(...a),
  getValuations: (...a: unknown[]) =>
    (mockGetValuations as (...a: unknown[]) => unknown)(...a),
  getValuationDefaults: (...a: unknown[]) =>
    (mockGetValuationDefaults as (...a: unknown[]) => unknown)(...a),
  getPeerMultiples: (...a: unknown[]) =>
    (mockGetPeerMultiples as (...a: unknown[]) => unknown)(...a),
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("analysisKeys", () => {
  it("produces stable, parameterized keys", () => {
    expect(analysisKeys.stocks("ko")).toEqual(["analysis-stocks", "ko"]);
    expect(analysisKeys.statements(7, "income")).toEqual([
      "analysis-statements",
      7,
      "income",
    ]);
    expect(analysisKeys.metrics(7)).toEqual(["analysis-metrics", 7]);
    expect(analysisKeys.growth(7)).toEqual(["analysis-growth", 7]);
    expect(analysisKeys.score(7)).toEqual(["analysis-score", 7]);
    expect(analysisKeys.scoreHistory(7)).toEqual([
      "analysis-score-history",
      7,
    ]);
    expect(analysisKeys.valuations(7)).toEqual(["analysis-valuations", 7]);
    expect(analysisKeys.valuationDefaults(7)).toEqual([
      "analysis-valuation-defaults",
      7,
    ]);
    expect(analysisKeys.peerMultiples(7)).toEqual([
      "analysis-peer-multiples",
      7,
    ]);
  });
});

describe("useAnalysisStocks", () => {
  it("forwards trimmed search and resolves data", async () => {
    mockGetAnalysisStocks.mockResolvedValueOnce([{ id: 1 }]);
    const client = makeClient();
    const { result } = renderHook(() => useAnalysisStocks("ko"), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetAnalysisStocks).toHaveBeenCalledWith({ search: "ko" });
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it("passes undefined when search is empty", async () => {
    mockGetAnalysisStocks.mockResolvedValueOnce([]);
    const client = makeClient();
    renderHook(() => useAnalysisStocks(""), { wrapper: makeWrapper(client) });
    await waitFor(() =>
      expect(mockGetAnalysisStocks).toHaveBeenCalledWith({ search: undefined }),
    );
  });
});

describe("useStatements", () => {
  it("forwards stockId and statementType", async () => {
    mockGetStatements.mockResolvedValueOnce([{ id: 1 }]);
    const client = makeClient();
    renderHook(() => useStatements(42, "income"), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() =>
      expect(mockGetStatements).toHaveBeenCalledWith(42, "income"),
    );
  });
});

describe("useStockMetrics", () => {
  it("forwards stockId", async () => {
    mockGetStockMetrics.mockResolvedValueOnce({ pe: 15 });
    const client = makeClient();
    const { result } = renderHook(() => useStockMetrics(7), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStockMetrics).toHaveBeenCalledWith(7);
    expect(result.current.data).toEqual({ pe: 15 });
  });
});

describe("useGrowthAnalysis", () => {
  it("forwards stockId", async () => {
    mockGetGrowthAnalysis.mockResolvedValueOnce({ revenue_cagr: 0.1 });
    const client = makeClient();
    renderHook(() => useGrowthAnalysis(7), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(mockGetGrowthAnalysis).toHaveBeenCalledWith(7));
  });
});

describe("useStockScore", () => {
  it("forwards stockId", async () => {
    mockGetStockScore.mockResolvedValueOnce({ score: 80 });
    const client = makeClient();
    renderHook(() => useStockScore(7), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(mockGetStockScore).toHaveBeenCalledWith(7));
  });
});

describe("useScoreHistory", () => {
  it("forwards stockId", async () => {
    mockGetScoreHistory.mockResolvedValueOnce([{ score: 80 }]);
    const client = makeClient();
    renderHook(() => useScoreHistory(7), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(mockGetScoreHistory).toHaveBeenCalledWith(7));
  });
});

describe("useValuations", () => {
  it("forwards stockId", async () => {
    mockGetValuations.mockResolvedValueOnce([{ id: 1 }]);
    const client = makeClient();
    renderHook(() => useValuations(7), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(mockGetValuations).toHaveBeenCalledWith(7));
  });
});

describe("useValuationDefaults", () => {
  it("forwards stockId", async () => {
    mockGetValuationDefaults.mockResolvedValueOnce({ wacc: 0.08 });
    const client = makeClient();
    renderHook(() => useValuationDefaults(7), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() =>
      expect(mockGetValuationDefaults).toHaveBeenCalledWith(7),
    );
  });
});

describe("usePeerMultiples", () => {
  it("does not fetch when disabled (default)", async () => {
    const client = makeClient();
    const { result } = renderHook(() => usePeerMultiples(7), {
      wrapper: makeWrapper(client),
    });
    // Allow any pending microtasks; should remain unfetched.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGetPeerMultiples).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches when enabled=true", async () => {
    mockGetPeerMultiples.mockResolvedValueOnce([{ ticker: "PEP" }]);
    const client = makeClient();
    const { result } = renderHook(() => usePeerMultiples(7, true), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPeerMultiples).toHaveBeenCalledWith(7);
  });
});
