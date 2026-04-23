/**
 * useTrackerQueries — unit tests for snapshots list hook.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { trackerKeys, useSnapshots } from "@/hooks/queries/useTrackerQueries";

const mockGetSnapshots = jest.fn();

jest.mock("@/services/api", () => ({
  getSnapshots: (...a: unknown[]) =>
    (mockGetSnapshots as (...a: unknown[]) => unknown)(...a),
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

describe("trackerKeys", () => {
  it("namespaces under 'snapshots'", () => {
    expect(trackerKeys.snapshots()).toEqual(["snapshots"]);
  });
});

describe("useSnapshots", () => {
  beforeEach(() => mockGetSnapshots.mockReset());

  it("calls getSnapshots and returns data", async () => {
    mockGetSnapshots.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useSnapshots(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetSnapshots).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual([{ id: 1 }]);
  });
});
