import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import { useToastStore } from "@/lib/stores";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

async function fetchSignedUrl(r2Key: string): Promise<string | null> {
  try {
    const token = await getSessionToken();
    const res = await fetch(
      `${getApiBaseUrl()}/api/files/signed-url?key=${encodeURIComponent(r2Key)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.signedUrl === "string" ? data.signedUrl : null;
  } catch {
    return null;
  }
}

/**
 * Manages profile photo upload and display for the logged-in user.
 *
 * Pass `profilePhotoKey` — the R2 key (or direct OAuth URL) stored on the user record.
 * The hook fetches a signed URL when the key is an R2 path, or uses the value
 * directly when it is already an HTTP URL (e.g. Google/Apple OAuth photo).
 */
export function useProfilePhoto(profilePhotoKey?: string | null) {
  const toast = useToastStore((s) => s.show);
  const utils = trpc.useUtils();
  const updatePhotoMut = trpc.user.updateProfilePhoto.useMutation();

  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const currentKey = overrideKey ?? profilePhotoKey ?? null;
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentKey === prevKeyRef.current) return;
    prevKeyRef.current = currentKey;

    if (!currentKey) {
      setPhotoUrl(null);
      return;
    }

    // Direct URL from OAuth provider — use as-is, no signed URL needed
    if (currentKey.startsWith("http")) {
      setPhotoUrl(currentKey);
      return;
    }

    let cancelled = false;
    fetchSignedUrl(currentKey).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentKey]);

  const pickAndUpload = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Permission to access photos is required", "error");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;
    const asset = result.assets[0];

    setIsUploading(true);
    setUploadError(null);

    try {
      const token = await getSessionToken();
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, asset.fileName ?? "photo.jpg");
      } else {
        const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName ?? `photo.${ext}`,
          type: asset.mimeType ?? "image/jpeg",
        } as any);
      }
      formData.append("purpose", "profile_photo");

      const uploadRes = await fetch(`${getApiBaseUrl()}/api/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Upload failed");
      }

      const { key } = await uploadRes.json();

      await updatePhotoMut.mutateAsync({ r2Key: key });

      // Update local key so signed URL is refetched immediately
      setOverrideKey(key);
      prevKeyRef.current = null; // force effect to re-run

      // Eagerly fetch the signed URL and set it
      const newUrl = await fetchSignedUrl(key);
      if (newUrl) setPhotoUrl(newUrl);

      // Refresh auth context so the new key persists across navigation
      await utils.auth.me.invalidate();
      await utils.user.getProfile.invalidate();

      toast("Profile photo updated", "success");
    } catch (err: any) {
      const msg: string = err?.message ?? "Failed to upload photo";
      setUploadError(msg);
      toast(msg, "error");
    } finally {
      setIsUploading(false);
    }
  }, [toast, updatePhotoMut, utils]);

  return { photoUrl, isUploading, uploadError, pickAndUpload };
}
