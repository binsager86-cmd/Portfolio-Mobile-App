/**
 * useInsightsQueries — unit tests for Kuwait market insights hook.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { insightsKeys, useKuwaitInsights } from "@/hooks/queries/useInsightsQueries";

const mockGetKuwaitInsights = jest.fn();

jest.mock("@/services/localInsights/boursaKuwait", () => ({
  getKuwaitInsights: (...a: unknown[]) =>
    (mockGetKuwaitInsights as (...a: unknown[]) => unknown)(...a),
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

describe("insightsKeys", () => {
  it("namespaces under 'insights/kuwait'", () => {
    expect(insightsKeys.kuwait()).toEqual(["insights", "kuwait"]);
  });
});

describe("useKuwaitInsights", () => {
  beforeEach(() => mockGetKuwaitInsights.mockReset());

  it("does not fetch when disabled", () => {
    renderHook(() => useKuwaitInsights(false), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(mockGetKuwaitInsights).not.toHaveBeenCalled();
  });

  it("fetches when enabled and returns service data", async () => {
    mockGetKuwaitInsights.mockResolvedValue({ updated_at: "x", indices: [] });
    const { result } = renderHook(() => useKuwaitInsights(true), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetKuwaitInsights).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ updated_at: "x", indices: [] });
  });
});
