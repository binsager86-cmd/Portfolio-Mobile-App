/**
 * useAdminGate — server-verified admin check.
 *
 * Calls GET /api/v1/auth/me and verifies `is_admin === true`.
 * Prevents client-only isAdmin spoofing from granting access.
 */

import { API_BASE_URL } from "@/constants/Config";
import { useAuthStore } from "@/services/authStore";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/services/tokenStorage";

function asAdminFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function useAdminGate() {
  const clientIsAdmin = useAuthStore((s) => s.isAdmin);
  const userId = useAuthStore((s) => s.userId);
  const token = useAuthStore((s) => s.token);

  const hasSession = Boolean(token);

  const { data: serverIsAdmin, isLoading } = useQuery({
    queryKey: ["admin-gate", userId ?? 0],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return false;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const json = await res.json();
      const me = json.data ?? json;
      return asAdminFlag(me.is_admin);
    },
    enabled: hasSession,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  return {
    isAdmin: serverIsAdmin === true || (clientIsAdmin && !hasSession),
    isLoading: hasSession && isLoading,
  };
}
