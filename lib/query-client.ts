import { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

/** Shared React Query defaults — reduces duplicate refetches on web refresh. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        // ponytail: never retry 401 — an UNAUTHORIZED response is definitive, retrying just spams the server
        retry: (failureCount: number, error: unknown) => {
          const code = (error as any)?.data?.code;
          if (code === "UNAUTHORIZED") return false;
          return failureCount < 1;
        },
        refetchOnMount: false,
        refetchOnWindowFocus: Platform.OS !== "web",
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
