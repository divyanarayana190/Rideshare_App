import { useRouter, type Href } from "expo-router";
import { useCallback } from "react";

export function useSafeRouterPush() {
  const router = useRouter();
  return useCallback(
    (href: Href) => {
      if (!href) {
        if (__DEV__) console.warn("[useSafeRouterPush] Missing route");
        return false;
      }
      router.push(href);
      return true;
    },
    [router],
  );
}

export function useSafeRouterBack() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return true;
    }
    router.replace("/(tabs)" as Href);
    return true;
  }, [router]);
}
