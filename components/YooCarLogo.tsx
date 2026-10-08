import { Image } from "expo-image";

/** Pixel-perfect logo extracted from assets/brand/yoo-logo-source.png */
const YOO_LOGO_TRANSPARENT = require("@/assets/brand/yoo-logo-transparent.png");

/** Master SVG (embedded exact bitmap): assets/brand/yoo-logo.svg */
export type YooLogoVariant = "gradient" | "white" | "black" | "flat-blue";

interface Props {
  size?: number;
  variant?: YooLogoVariant;
}

/** Renders the exact YOO brand logo — no hand-drawn vectors. */
export function YooLogoMark({ size = 100, variant = "gradient" }: Props) {
  if (variant !== "gradient") {
    // Mono variants: tint the exact logo shape
    const tint =
      variant === "white" ? "#FFFFFF" :
      variant === "black" ? "#0A0F1E" :
      "#1E88FF";
    return (
      <Image
        source={YOO_LOGO_TRANSPARENT}
        style={{ width: size, height: size, tintColor: tint }}
        contentFit="contain"
        accessibilityLabel="YOO logo"
      />
    );
  }

  return (
    <Image
      source={YOO_LOGO_TRANSPARENT}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="YOO logo"
    />
  );
}

/** Default gradient YOO car logo. */
export default function YooCarLogo({ size = 100 }: Pick<Props, "size">) {
  return <YooLogoMark size={size} variant="gradient" />;
}
