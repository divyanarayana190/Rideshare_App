import { D, SHADOW_BUTTON } from "@/constants/design";
import { GradientView } from "@/components/GradientView";
import { useColors } from "@/hooks/use-colors";
import { ActivityIndicator, Animated, Pressable, Text, type ViewStyle } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useRef } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

interface ActionButtonProps {
  label: string;
  onPress?: () => void;
  href?: Href;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function ActionButton({
  label,
  onPress,
  href,
  variant = "primary",
  loading = false,
  disabled = false,
  disabledReason,
  icon,
  style,
}: ActionButtonProps) {
  const colors = useColors();
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading || (!onPress && !href);

  if (__DEV__ && isDisabled && !disabled && !loading && !onPress && !href) {
    console.warn(`[ActionButton] "${label}" has no onPress or href`);
  }

  const handlePress = () => {
    if (isDisabled) return;
    if (onPress) onPress();
    else if (href) router.push(href);
  };

  const handlePressIn = () => {
    if (!isDisabled) {
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const textColor =
    variant === "primary" || variant === "destructive" ? "#fff" :
    variant === "secondary" ? colors.foreground :
    colors.primary;

  const inner = (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={disabledReason ? `${label}. ${disabledReason}` : label}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 52,
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderRadius: D.radius.lg,
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: colors.border,
          backgroundColor:
            variant === "destructive" ? D.red :
            variant === "secondary" ? colors.surface :
            variant === "ghost" ? "transparent" :
            variant === "primary" ? "transparent" :
            undefined,
          opacity: isDisabled ? 0.5 : 1,
        },
        variant !== "primary" ? style : undefined,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>{label}</Text>
        </>
      )}
    </Pressable>
  );

  if (variant === "primary") {
    return (
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        <GradientView
          style={{
            borderRadius: D.radius.lg,
            opacity: isDisabled ? 0.5 : 1,
            ...SHADOW_BUTTON,
          }}
        >
          {inner}
        </GradientView>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {inner}
    </Animated.View>
  );
}
