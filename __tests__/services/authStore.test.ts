const mockGetToken = jest.fn();
const mockSetToken = jest.fn();
const mockRemoveToken = jest.fn();
const mockGetRefreshToken = jest.fn();
const mockSetRefreshToken = jest.fn();
const mockRemoveRefreshToken = jest.fn();
const mockIsTokenExpired = jest.fn();

jest.mock("@/services/tokenStorage", () => ({
  getToken: (...args: any[]) => mockGetToken(...args),
  setToken: (...args: any[]) => mockSetToken(...args),
  removeToken: (...args: any[]) => mockRemoveToken(...args),
  getRefreshToken: (...args: any[]) => mockGetRefreshToken(...args),
  setRefreshToken: (...args: any[]) => mockSetRefreshToken(...args),
  removeRefreshToken: (...args: any[]) => mockRemoveRefreshToken(...args),
  isTokenExpired: (...args: any[]) => mockIsTokenExpired(...args),
}));

jest.mock("@/constants/Config", () => ({
  API_BASE_URL: "http://localhost:8002",
}));

jest.mock("@/services/authErrors", () => ({
  logAuthError: jest.fn(),
  mapAuthError: jest.fn((error: any) => ({
    code: "auth/test-error",
    message: error?.message ?? "Auth failed",
    severity: "error",
  })),
}));

import { useAuthStore } from "@/services/authStore";

const initialState = {
  token: null,
  refreshToken: null,
  expiresIn: null,
  userId: null,
  username: null,
  name: null,
  isAdmin: false,
  isLoading: true,
  error: null,
  lastAuthError: null,
  isRefreshing: false,
  refreshAttemptCount: 0,
  refreshAttempts: 0,
};

describe("authStore hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as any;
    mockSetToken.mockResolvedValue(undefined);
    mockRemoveToken.mockResolvedValue(undefined);
    mockSetRefreshToken.mockResolvedValue(undefined);
    mockRemoveRefreshToken.mockResolvedValue(undefined);
    mockIsTokenExpired.mockReturnValue(false);
    useAuthStore.setState(initialState);
  });

  it("restores a complete authenticated state when the stored token is valid", async () => {
    mockGetToken.mockResolvedValue("stored-access-token");
    mockGetRefreshToken.mockResolvedValue("stored-refresh-token");
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: "success",
        data: { user_id: 42, username: "sager", name: "Sager", is_admin: true },
      }),
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({
        token: "stored-access-token",
        refreshToken: "stored-refresh-token",
        userId: 42,
        username: "sager",
        name: "Sager",
        isAdmin: true,
        isLoading: false,
        error: null,
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8002/api/v1/auth/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer stored-access-token" },
      }),
    );
    expect(mockRemoveToken).not.toHaveBeenCalled();
    expect(mockRemoveRefreshToken).not.toHaveBeenCalled();
  });

  it("clears stored tokens and logs out when hydration token validation fails", async () => {
    mockGetToken.mockResolvedValue("expired-access-token");
    mockGetRefreshToken.mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ detail: "unauthorized" }),
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toEqual(
      expect.objectContaining({
        token: null,
        refreshToken: null,
        expiresIn: null,
        userId: null,
        username: null,
        name: null,
        isLoading: false,
      }),
    );
    expect(mockRemoveToken).toHaveBeenCalledTimes(1);
    expect(mockRemoveRefreshToken).toHaveBeenCalledTimes(1);
  });
});