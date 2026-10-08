import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { resolveDriverAccess } from "@/lib/driver-access";
import { useAuth } from "@/lib/auth-context-v2";

/**
 * Unified driver access hook — wraps `driver.getAccessStatus`.
 * Invalidates when auth user refreshes.
 */
export function useDriverAccess(enabled = true) {
  const { isSignedIn, user } = useAuth();
  const queryEnabled = enabled && isSignedIn;

  const query = trpc.driver.getAccessStatus.useQuery(undefined, {
    enabled: queryEnabled,
    staleTime: 30_000,
    refetchInterval: queryEnabled ? 60_000 : false,
    retry: false,
  });

  const resolved = resolveDriverAccess(query.data ?? null);

  // If auth.me says isDriver but access query is stale, refetch once.
  // Skip when the query already errored to avoid an infinite retry loop.
  useEffect(() => {
    if (!queryEnabled || !user?.isDriver || query.isLoading || query.isError) return;
    if (query.data?.canAccessDriverMode) return;
    void query.refetch();
  }, [queryEnabled, user?.isDriver, query.data?.canAccessDriverMode, query.isLoading, query.isError]);

  return {
    ...resolved,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
