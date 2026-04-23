/**
 * useAdminQueries — unit tests for admin query hooks and mutations.
 *
 * Covers:
 *   - adminKeys factory stability
 *   - useAdminUsers (enabled gate, fetcher wired)
 *   - useAdminActivities (params forwarded with snake_case mapping, default per_page)
 *   - useAdminCreateUser / useAdminUpdateUsername / useAdminUpdatePassword /
 *     useAdminDeleteUser (mutation invokes API and invalidates users query)
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  adminKeys,
  useAdminUsers,
  useAdminActivities,
  useAdminCreateUser,
  useAdminUpdateUsername,
  useAdminUpdatePassword,
  useAdminDeleteUser,
} from "@/hooks/queries/useAdminQueries";

const mockFetchAdminUsers = jest.fn();
const mockFetchAdminActivities = jest.fn();
const mockAdminCreateUser = jest.fn();
const mockAdminUpdateUsername = jest.fn();
const mockAdminUpdatePassword = jest.fn();
const mockAdminDeleteUser = jest.fn();

jest.mock("@/services/api", () => ({
  fetchAdminUsers: (...a: unknown[]) =>
    (mockFetchAdminUsers as (...a: unknown[]) => unknown)(...a),
  fetchAdminActivities: (...a: unknown[]) =>
    (mockFetchAdminActivities as (...a: unknown[]) => unknown)(...a),
  adminCreateUser: (...a: unknown[]) =>
    (mockAdminCreateUser as (...a: unknown[]) => unknown)(...a),
  adminUpdateUsername: (...a: unknown[]) =>
    (mockAdminUpdateUsername as (...a: unknown[]) => unknown)(...a),
  adminUpdatePassword: (...a: unknown[]) =>
    (mockAdminUpdatePassword as (...a: unknown[]) => unknown)(...a),
  adminDeleteUser: (...a: unknown[]) =>
    (mockAdminDeleteUser as (...a: unknown[]) => unknown)(...a),
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

describe("adminKeys", () => {
  it("namespaces under 'admin'", () => {
    expect(adminKeys.users()[0]).toBe("admin");
    expect(adminKeys.activities()[0]).toBe("admin");
  });

  it("differentiates activity keys when params change", () => {
    const base = adminKeys.activities(1);
    expect(adminKeys.activities(2)).not.toEqual(base);
    expect(adminKeys.activities(1, 5)).not.toEqual(base);
    expect(adminKeys.activities(1, undefined, "buy")).not.toEqual(base);
  });
});

describe("useAdminUsers", () => {
  beforeEach(() => mockFetchAdminUsers.mockReset());

  it("does not fetch when disabled", () => {
    renderHook(() => useAdminUsers(false), { wrapper: makeWrapper(makeClient()) });
    expect(mockFetchAdminUsers).not.toHaveBeenCalled();
  });

  it("fetches when enabled (default)", async () => {
    mockFetchAdminUsers.mockResolvedValue({ count: 1, users: [] });
    const { result } = renderHook(() => useAdminUsers(), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchAdminUsers).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ count: 1, users: [] });
  });
});

describe("useAdminActivities", () => {
  beforeEach(() => mockFetchAdminActivities.mockReset());

  it("does not fetch when enabled is false", () => {
    renderHook(() => useAdminActivities({ page: 1, enabled: false }), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(mockFetchAdminActivities).not.toHaveBeenCalled();
  });

  it("forwards params using snake_case and defaults per_page to 50", async () => {
    mockFetchAdminActivities.mockResolvedValue({ activities: [], total: 0 });
    const { result } = renderHook(
      () =>
        useAdminActivities({
          page: 2,
          userId: 7,
          txnType: "buy",
          stockSymbol: "BBYN",
          dateFrom: "2025-01-01",
          dateTo: "2025-12-31",
        }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchAdminActivities).toHaveBeenCalledWith({
      page: 2,
      per_page: 50,
      user_id: 7,
      txn_type: "buy",
      stock_symbol: "BBYN",
      date_from: "2025-01-01",
      date_to: "2025-12-31",
    });
  });

  it("honours an explicit perPage", async () => {
    mockFetchAdminActivities.mockResolvedValue({ activities: [], total: 0 });
    const { result } = renderHook(
      () => useAdminActivities({ page: 1, perPage: 200 }),
      { wrapper: makeWrapper(makeClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchAdminActivities).toHaveBeenCalledWith(
      expect.objectContaining({ per_page: 200 }),
    );
  });
});

describe("admin mutations invalidate users", () => {
  beforeEach(() => {
    mockFetchAdminUsers.mockReset();
    mockAdminCreateUser.mockReset();
    mockAdminUpdateUsername.mockReset();
    mockAdminUpdatePassword.mockReset();
    mockAdminDeleteUser.mockReset();
  });

  it("useAdminCreateUser invokes API and invalidates users query", async () => {
    mockAdminCreateUser.mockResolvedValue({ id: 5 });
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdminCreateUser(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ username: "u", password: "p" });
    });
    expect(mockAdminCreateUser).toHaveBeenCalledWith({ username: "u", password: "p" });
    expect(spy).toHaveBeenCalledWith({ queryKey: adminKeys.users() });
  });

  it("useAdminUpdateUsername forwards args and invalidates", async () => {
    mockAdminUpdateUsername.mockResolvedValue({});
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdminUpdateUsername(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ userId: 3, username: "new" });
    });
    expect(mockAdminUpdateUsername).toHaveBeenCalledWith(3, "new");
    expect(spy).toHaveBeenCalledWith({ queryKey: adminKeys.users() });
  });

  it("useAdminUpdatePassword forwards args and invalidates", async () => {
    mockAdminUpdatePassword.mockResolvedValue({});
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdminUpdatePassword(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ userId: 4, password: "secret" });
    });
    expect(mockAdminUpdatePassword).toHaveBeenCalledWith(4, "secret");
    expect(spy).toHaveBeenCalledWith({ queryKey: adminKeys.users() });
  });

  it("useAdminDeleteUser forwards id and invalidates", async () => {
    mockAdminDeleteUser.mockResolvedValue({});
    const client = makeClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdminDeleteUser(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync(9);
    });
    expect(mockAdminDeleteUser).toHaveBeenCalledWith(9);
    expect(spy).toHaveBeenCalledWith({ queryKey: adminKeys.users() });
  });
});
