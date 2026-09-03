/**
 * useGoogleSignIn — thin hook over shared Google auth implementation.
 */

import { performGoogleSignIn } from "@/lib/googleAuth";
import { useCallback, useState } from "react";

// ── Result type ─────────────────────────────────────────────────────

export type GoogleSignInResult =
  | { success: true; token: string }
  | { success: false; cancelled: boolean; error?: string };

// ── Hook ────────────────────────────────────────────────────────────

export function useGoogleSignIn() {
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async (): Promise<GoogleSignInResult> => {
    setIsLoading(true);
    try {
      const result = await performGoogleSignIn();
      if (result.success) {
        return { success: true, token: result.idToken };
      }
      return {
        success: false,
        cancelled: result.cancelled,
        error: result.error,
      };
    } catch (err: unknown) {
      if (__DEV__) console.error("[useGoogleSignIn] Error:", err);
      return {
        success: false,
        cancelled: false,
        error: err instanceof Error ? err.message : "Google Sign-In failed unexpectedly.",
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { signIn, isLoading };
}
