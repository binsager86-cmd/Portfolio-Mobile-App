/**
 * useSettingsQueries — unit tests for me / api-key / rf-rate / ai-status hooks.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  settingsKeys,
  useMe,
  useApiKey,
  useRfRateSetting,
  useAiStatus,
} from "@/hooks/queries/useSettingsQueries";

const mockGetMe = jest.fn();
const mockGetApiKey = jest.fn();
const mockGetRfRate = jest.fn();
const mockGetAIStatus = jest.fn();

jest.mock("@/services/api", () => ({
  getMe: (...a: unknown[]) => (mockGetMe as (...a: unknown[]) => unknown)(...a),
  getApiKey: (...a: unknown[]) => (mockGetApiKey as (...a: unknown[]) => unknown)(...a),
  getRfRate: (...a: unknown[]) => (mockGetRfRate as (...a: unknown[]) => unknown)(...a),
  getAIStatus: (...a: unknown[]) => (mockGetAIStatus as (...a: unknown[]) => unknown)(...a),
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

describe("settingsKeys", () => {
  it("uses stable distinct keys", () => {
    expect(settingsKeys.me()).toEqual(["me"]);
    expect(settingsKeys.apiKey()).toEqual(["api-key"]);
    expect(settingsKeys.rfRate()).toEqual(["rf-rate-setting"]);
    expect(settingsKeys.aiStatus()).toEqual(["ai-status"]);
  });
});

describe("settings query hooks", () => {
  beforeEach(() => {
    mockGetMe.mockReset();
    mockGetApiKey.mockReset();
    mockGetRfRate.mockReset();
    mockGetAIStatus.mockReset();
  });

  it("useMe calls getMe", async () => {
    mockGetMe.mockResolvedValue({ username: "u" });
    const { result } = renderHook(() => useMe(), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetMe).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ username: "u" });
  });

  it("useApiKey calls getApiKey", async () => {
    mockGetApiKey.mockResolvedValue({ has_key: true });
    const { result } = renderHook(() => useApiKey(), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetApiKey).toHaveBeenCalledTimes(1);
  });

  it("useRfRateSetting calls getRfRate", async () => {
    mockGetRfRate.mockResolvedValue({ rf_rate: 0.04 });
    const { result } = renderHook(() => useRfRateSetting(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetRfRate).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ rf_rate: 0.04 });
  });

  it("useAiStatus calls getAIStatus", async () => {
    mockGetAIStatus.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useAiStatus(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
  });
});
