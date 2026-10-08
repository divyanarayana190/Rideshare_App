import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";

export { trpc };

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: `${getApiBaseUrl()}/api/trpc`,
        async headers() {
          const token = await getSessionToken();
          if (token) {
            return { Authorization: `Bearer ${token}` };
          }
          return {};
        },
        fetch(url, options) {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(new Error("Request timed out. Is the server running?")),
            15000,
          );
          // Deliberately do NOT forward options.signal — tRPC/React Query aborts
          // the batch signal when any query in the batch is cancelled (e.g. on
          // component unmount or Strict-Mode double-effects). Forwarding it causes
          // every request in that batch, including mutations, to fail with
          // "signal is aborted without reason". Our timeout is the only kill-switch.
          return fetch(url, {
            ...options,
            credentials: "include",
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));
        },
      }),
    ],
  });
}
