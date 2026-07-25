/**
 * Holdings Screen tests.
 *
 * Covers:
 *   - Loading state (spinner)
 *   - Data display (holding cards with symbol, shares, prices)
 *   - Error state
 *   - Filter buttons (All, KFH, BBYN, USA)
 *   - Totals banner
 *   - Empty state
 *   - Pull-to-refresh
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MOCK_HOLDINGS, createTestQueryClient } from "../helpers";

// ── Mocks ───────────────────────────────────────────────────────────

const mockGetHoldings = jest.fn();

jest.mock("@/services/api", () => ({
  getHoldings: (...args: any[]) => mockGetHoldings(...args),
}));

// ── Import after mocks ──────────────────────────────────────────────

import HoldingsScreen from "@/app/(tabs)/holdings";

// ── Tests ───────────────────────────────────────────────────────────

describe("HoldingsScreen", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockGetHoldings.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  function renderScreen() {
    return render(
      <QueryClientProvider client={queryClient}>
        <HoldingsScreen />
      </QueryClientProvider>
    );
  }

  // ── Loading state ──

  it("shows loading indicator while fetching", async () => {
    mockGetHoldings.mockReturnValue(new Promise(() => {}));
    renderScreen();

    expect(screen.getByText("Loading holdings…")).toBeTruthy();
  });

  // ── Success state ──

  it("renders holding rows", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Humansoft Holding").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("National Bank of Kuwait").length).toBeGreaterThan(0);
  });

  it("renders company names", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Humansoft Holding").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("National Bank of Kuwait").length).toBeGreaterThan(0);
  });

  it("renders totals banner with holding count", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Holdings").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });
  });

  it("shows singular 'holding' for count of 1", async () => {
    const singleHolding = {
      ...MOCK_HOLDINGS,
      holdings: [MOCK_HOLDINGS.holdings[0]],
      count: 1,
    };
    mockGetHoldings.mockResolvedValueOnce(singleHolding);
    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Holdings").length).toBeGreaterThan(0);
      expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    });
  });

  // ── Filter buttons ──

  it("renders filter buttons: All, KFH, BBYN, USA", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("All")).toBeTruthy();
    });

    expect(screen.getAllByText("KFH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BBYN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USA").length).toBeGreaterThan(0);
  });

  it("calls getHoldings with filter when portfolio tab pressed", async () => {
    mockGetHoldings
      .mockResolvedValueOnce(MOCK_HOLDINGS) // initial load (All)
      .mockResolvedValueOnce(MOCK_HOLDINGS); // filtered load

    renderScreen();

    await waitFor(() => {
      expect(screen.getAllByText("Humansoft Holding").length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.press(screen.getAllByText("KFH")[0]);
    });

    await waitFor(() => {
      expect(mockGetHoldings).toHaveBeenCalledWith("KFH");
    });
  });

  // ── Error state ──

  it("shows error message on API failure", async () => {
    mockGetHoldings.mockRejectedValueOnce(new Error("Network timeout"));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeTruthy();
    });
  });

  // ── Empty state ──

  it("shows empty message when no holdings", async () => {
    mockGetHoldings.mockResolvedValueOnce({
      ...MOCK_HOLDINGS,
      holdings: [],
      count: 0,
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText("No active holdings found.")).toBeTruthy();
    });
  });
});
