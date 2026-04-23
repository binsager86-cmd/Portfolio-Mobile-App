/**
 * usePfmQueries — unit tests for snapshot list and detail (id-gated).
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { pfmKeys, usePfmSnapshots, usePfmSnapshot } from "@/hooks/queries/usePfmQueries";

const mockGetPfmSnapshots = jest.fn();
const mockGetPfmSnapshot = jest.fn();

jest.mock("@/services/api", () => ({
  getPfmSnapshots: (...a: unknown[]) =>
    (mockGetPfmSnapshots as (...a: unknown[]) => unknown)(...a),
  getPfmSnapshot: (...a: unknown[]) =>
    (mockGetPfmSnapshot as (...a: unknown[]) => unknown)(...a),
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

describe("pfmKeys", () => {
  it("differentiates list and detail keys", () => {
    expect(pfmKeys.list()).toEqual(["pfm-snapshots"]);
    expect(pfmKeys.detail(7)).toEqual(["pfm-snapshot", 7]);
    expect(pfmKeys.detail(null)).toEqual(["pfm-snapshot", null]);
  });
});

describe("usePfmSnapshots", () => {
  beforeEach(() => mockGetPfmSnapshots.mockReset());

  it("requests page 1 with page_size 100", async () => {
    mockGetPfmSnapshots.mockResolvedValue({ count: 0, results: [] });
    const { result } = renderHook(() => usePfmSnapshots(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPfmSnapshots).toHaveBeenCalledWith({ page: 1, page_size: 100 });
  });
});

describe("usePfmSnapshot", () => {
  beforeEach(() => mockGetPfmSnapshot.mockReset());

  it("does not fire when id is null", () => {
    renderHook(() => usePfmSnapshot(null), { wrapper: makeWrapper(makeClient()) });
    expect(mockGetPfmSnapshot).not.toHaveBeenCalled();
  });

  it("fetches the right id when provided", async () => {
    mockGetPfmSnapshot.mockResolvedValue({ id: 5 });
    const { result } = renderHook(() => usePfmSnapshot(5), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPfmSnapshot).toHaveBeenCalledWith(5);
  });
});
