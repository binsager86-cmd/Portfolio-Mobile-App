/**
 * [4.5] TanStack Query default options.
 *
 * Provides a single canonical set of QueryClient defaults so every
 * `useQuery` / `useMutation` call in the app shares the same cache
 * lifetime, retry strategy, and focus-refetch behaviour without
 * having to repeat options at each call site.
 *
 * Usage:
 *   import { defaultQueryOptions } from "@/hooks/useDefaultQueryOptions";
 *
 *   const { data } = useQuery({ ...defaultQueryOptions, queryKey: [...], queryFn: ... });
 *
 * Or to configure the QueryClient once at the root:
 *   const queryClient = new QueryClient({ defaultOptions: { queries: defaultQueryOptions } });
 */

/**
 * Default options shared across all `useQuery` calls.
 *
 * - staleTime 5 min  → skip refetch if data is fresh enough.
 * - gcTime 30 min    → keep inactive query data in the cache for 30 min.
 * - refetchOnWindowFocus false → avoid jarring re-fetches when the user
 *   switches apps (important on mobile).
 * - structuralSharing true  → prevents unnecessary re-renders when the
 *   new response is deeply equal to the cached one.
 * - retry 2          → retry failed requests twice before surfacing the error.
 * - retryDelay       → exponential back-off capped at 10 s.
 */
export const defaultQueryOptions = {
  staleTime: 5 * 60_000,        // 5 minutes
  gcTime: 30 * 60_000,          // 30 minutes
  refetchOnWindowFocus: false,
  structuralSharing: true,
  retry: 2,
  retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 10_000),
} as const;
