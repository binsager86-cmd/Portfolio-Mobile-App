/**
 * useDepositQueries — unit tests for deposits paginated list hook.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { depositKeys, useDeposits } from "@/hooks/queries/useDepositQueries";

const mockGetDeposits = jest.fn();

jest.mock("@/services/api", () => ({
  getDeposits: (...a: unknown[]) =>
    (mockGetDeposits as (...a: unknown[]) => unknown)(...a),
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

describe("depositKeys", () => {
  it("namespaces under 'deposits' and varies by params", () => {
    expect(depositKeys.list(1)[0]).toBe("deposits");
    expect(depositKeys.list(1, "KFH")).not.toEqual(depositKeys.list(1));
    expect(depositKeys.list(2)).not.toEqual(depositKeys.list(1));
  });
});

describe("useDeposits", () => {
  beforeEach(() => mockGetDeposits.mockReset());

  it("forwards params and defaults page_size to 25", async () => {
    mockGetDeposits.mockResolvedValue({ count: 0, results: [] });
    const { result } = renderHook(
      () => useDeposits({ page: 1, portfolio: "KFH" }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDeposits).toHaveBeenCalledWith({
      page: 1,
      page_size: 25,
      portfolio: "KFH",
    });
  });

  it("honours an explicit pageSize", async () => {
    mockGetDeposits.mockResolvedValue({ count: 0, results: [] });
    const { result } = renderHook(
      () => useDeposits({ page: 3, pageSize: 100 }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDeposits).toHaveBeenCalledWith({
      page: 3,
      page_size: 100,
      portfolio: undefined,
    });
  });
});
