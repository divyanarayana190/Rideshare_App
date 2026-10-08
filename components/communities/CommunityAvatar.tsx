import { memo, useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { C } from "@/components/communities/communityTheme";
import { useSignedImage } from "@/hooks/use-signed-image";

export type CommunityAvatarSize = "list" | "grid" | "detail";

const SIZE_MAP: Record<CommunityAvatarSize, number> = {
  list: 64,
  grid: 72,
  detail: 96,
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  university: "school",
  company: "business",
  city: "location",
  apartment: "home",
  event: "calendar",
  travel: "airplane",
  private_group: "lock-closed",
  custom: "people",
};

type Props = {
  logoKey?: string | null;
  name?: string;
  category?: string;
  size?: CommunityAvatarSize | number;
  tint?: string | null;
};

function toInitials(name?: string): string {
  if (!name?.trim()) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function initialsFontSize(box: number, chars: number): number {
  return Math.round(box * (chars > 1 ? 0.3 : 0.36));
}

/** ui-avatars.com PNGs clip badly inside circular views on Android — render native initials instead. */
function isSyntheticAvatarUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "ui-avatars.com" || host.endsWith(".ui-avatars.com");
  } catch {
    return false;
  }
}

function parseUiAvatarsBackground(url: string): string | null {
  try {
    const bg = new URL(url).searchParams.get("background");
    if (!bg) return null;
    return bg.startsWith("#") ? bg : `#${bg}`;
  } catch {
    return null;
  }
}

function InitialsCircle({
  box,
  label,
  accent,
}: {
  box: number;
  label: string;
  accent: string;
}) {
  const fontSize = initialsFontSize(box, label.length);

  return (
    <View
      style={[
        s.initialsCircle,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          backgroundColor: accent,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          s.initials,
          {
            fontSize,
            lineHeight: Platform.OS === "android" ? fontSize + 2 : fontSize,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export const CommunityAvatar = memo(function CommunityAvatar({
  logoKey,
  name,
  category,
  size = "list",
  tint,
}: Props) {
  const box = typeof size === "number" ? size : SIZE_MAP[size];
  const signed = useSignedImage(logoKey?.startsWith("http") ? null : logoKey);
  const url = logoKey?.startsWith("http") ? logoKey : signed;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  const syntheticUrl = url && isSyntheticAvatarUrl(url) ? url : null;
  const accent = tint ?? (syntheticUrl ? parseUiAvatarsBackground(syntheticUrl) : null) ?? C.blue;
  const label = useMemo(() => toInitials(name), [name]);
  const icon = CATEGORY_ICONS[category ?? "custom"] ?? "people";
  const showImage = Boolean(url) && !imageFailed && !syntheticUrl;

  if (showImage) {
    return (
      <View style={[s.ring, { width: box, height: box, borderRadius: box / 2 }]}>
        <Image
          source={{ uri: url! }}
          style={{ width: box, height: box }}
          contentFit="cover"
          transition={200}
          onError={() => setImageFailed(true)}
        />
      </View>
    );
  }

  if (label) {
    return <InitialsCircle box={box} label={label} accent={accent} />;
  }

  return (
    <View
      style={[
        s.iconCircle,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          backgroundColor: accent,
        },
      ]}
    >
      <Ionicons name={icon} size={Math.round(box * 0.38)} color="#fff" />
    </View>
  );
});

const s = StyleSheet.create({
  ring: {
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
  },
  initialsCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false,
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
});

/** @deprecated use CommunityAvatar */
export const CommunityLogo = CommunityAvatar;
