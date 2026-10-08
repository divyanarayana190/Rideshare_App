import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";
import { useToastStore } from "@/lib/stores";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

type Purpose = "community_logo" | "community_banner";

export function useCommunityImageUpload(purpose: Purpose) {
  const toast = useToastStore((s) => s.show);
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = useCallback(async (): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Photo library permission is required", "error");
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: purpose === "community_logo" ? [1, 1] : [16, 9],
      quality: 0.85,
    });

    if (result.canceled) return null;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const token = await getSessionToken();
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, asset.fileName ?? "image.jpg");
      } else {
        const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName ?? `image.${ext}`,
          type: asset.mimeType ?? "image/jpeg",
        } as any);
      }
      formData.append("purpose", purpose);

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
      return key as string;
    } catch (err: any) {
      toast(err?.message ?? "Upload failed", "error");
      return null;
    } finally {
      setUploading(false);
    }
  }, [purpose, toast]);

  return { pickAndUpload, uploading };
}
