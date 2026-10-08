import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";
import { useEffect, useState } from "react";

async function fetchSignedUrl(key: string): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  try {
    const token = await getSessionToken();
    const res = await fetch(
      `${getApiBaseUrl()}/api/files/signed-url?key=${encodeURIComponent(key)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.signedUrl === "string" ? data.signedUrl : null;
  } catch {
    return null;
  }
}

export function useSignedImage(key?: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    fetchSignedUrl(key).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return url;
}
