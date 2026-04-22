/**
 * useTransactionMutations — unit tests for create/update/delete with
 * optimistic cache behaviour and invalidation fan-out.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
} from "@/hooks/queries/useTransactionMutations";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/api", () => ({
  createTransaction: (...a: unknown[]) =>
    (mockCreate as (...a: unknown[]) => unknown)(...a),
  updateTransaction: (...a: unknown[]) =>
    (mockUpdate as (...a: unknown[]) => unknown)(...a),
  deleteTransaction: (...a: unknown[]) =>
    (mockDelete as (...a: unknown[]) => unknown)(...a),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useCreateTransaction", () => {
  beforeEach(() => mockCreate.mockReset());

  it("optimistically increments cached list count, then invalidates", async () => {
    mockCreate.mockResolvedValue({ id: 99 });
    const client = makeClient();

    const listKey = ["transactions", { page: 1 }];
    client.setQueryData(listKey, { count: 5, transactions: [] });

    const invalSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateTransaction(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      const p = result.current.mutateAsync({
        symbol: "BBYN",
        portfolio: "KFH",
      } as never);
      // After onMutate runs, optimistic count should be +1
      await waitFor(() => {
        const data = client.getQueryData<{ count: number }>(listKey);
        expect(data?.count).toBe(6);
      });
      await p;
    });

    // Fan-out invalidations
    const invalidatedKeys = invalSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        "transactions",
        "portfolio-overview",
        "holdings",
        "cash-balances",
      ]),
    );
  });

  it("rolls back optimistic update on error", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    const client = makeClient();

    const listKey = ["transactions", { page: 1 }];
    client.setQueryData(listKey, { count: 5, transactions: [] });

    const { result } = renderHook(() => useCreateTransaction(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({} as never);
      } catch {
        // expected
      }
    });

    const data = client.getQueryData<{ count: number }>(listKey);
    expect(data?.count).toBe(5);
  });
});

describe("useUpdateTransaction", () => {
  beforeEach(() => mockUpdate.mockReset());

  it("forwards id + payload and invalidates dependents", async () => {
    mockUpdate.mockResolvedValue({ id: 7 });
    const client = makeClient();
    const invalSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTransaction(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 7,
        payload: { symbol: "NBK" } as never,
      });
    });

    expect(mockUpdate).toHaveBeenCalledWith(7, { symbol: "NBK" });
    const invalidatedKeys = invalSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining(["transactions", "portfolio-overview", "holdings"]),
    );
  });
});

describe("useDeleteTransaction", () => {
  beforeEach(() => mockDelete.mockReset());

  it("optimistically removes the row and decrements count", async () => {
    mockDelete.mockResolvedValue({});
    const client = makeClient();

    const listKey = ["transactions", { page: 1 }];
    client.setQueryData(listKey, {
      count: 2,
      transactions: [{ id: 1 }, { id: 2 }],
    });

    const { result } = renderHook(() => useDeleteTransaction(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      const p = result.current.mutateAsync(1);
      await waitFor(() => {
        const data = client.getQueryData<{
          count: number;
          transactions: { id: number }[];
        }>(listKey);
        expect(data?.count).toBe(1);
        expect(data?.transactions.map((r) => r.id)).toEqual([2]);
      });
      await p;
    });
  });

  it("rolls back on error", async () => {
    mockDelete.mockRejectedValue(new Error("nope"));
    const client = makeClient();

    const listKey = ["transactions", { page: 1 }];
    const original = { count: 2, transactions: [{ id: 1 }, { id: 2 }] };
    client.setQueryData(listKey, original);

    const { result } = renderHook(() => useDeleteTransaction(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync(1);
      } catch {
        // expected
      }
    });

    const data = client.getQueryData<typeof original>(listKey);
    expect(data?.count).toBe(2);
    expect(data?.transactions.map((r) => r.id)).toEqual([1, 2]);
  });
});
