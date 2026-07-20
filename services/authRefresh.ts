import { API_BASE_URL } from "@/constants/Config";
import {
  getRefreshToken,
  setTokens,
} from "@/services/tokenStorage";

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

type RefreshError = Error & { status?: number };

let refreshPromise: Promise<SessionTokens> | null = null;

async function performRefresh(): Promise<SessionTokens> {
  const refresh = await getRefreshToken();
  if (!refresh) {
    const error = new Error("No refresh token available") as RefreshError;
    error.status = 401;
    throw error;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch (cause) {
    const error = new Error("Refresh request failed") as RefreshError;
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Refresh failed (${response.status})`) as RefreshError;
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const accessToken = data.access_token as string;
  const refreshToken = (data.refresh_token as string | undefined) ?? refresh;
  const expiresIn = data.expires_in as number | undefined;

  await setTokens(accessToken, refreshToken, expiresIn);
  return { accessToken, refreshToken, expiresIn };
}

export function refreshSession(): Promise<SessionTokens> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export function isDefinitiveRefreshRejection(error: unknown): boolean {
  const status = (error as RefreshError | undefined)?.status;
  return status === 400 || status === 401;
}
