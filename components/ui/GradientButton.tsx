import { D, SHADOW_BUTTON } from "@/constants/design";
import { GradientView } from "@/components/GradientView";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRef } from "react";

interface GradientButtonProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  showArrow?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function GradientButton({
  label,
  loading = false,
  disabled,
  icon,
  showArrow = false,
  onPress,
  style,
}: GradientButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!isDisabled) {
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <GradientView
        style={{
          borderRadius: D.radius.lg,
          opacity: isDisabled ? 0.6 : 1,
          ...SHADOW_BUTTON,
        }}
      >
        <Pressable
          onPress={onPress}
          disabled={isDisabled}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 18,
            paddingHorizontal: 24,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={20} color="#FFFFFF" /> : null}
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 17 }}>
                {label}
              </Text>
              {showArrow ? (
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              ) : null}
            </>
          )}
        </Pressable>
      </GradientView>
    </Animated.View>
  );
}

/** Secondary text link styled for auth screens */
export function AuthLink({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable onPress={onPress}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: muted ? "500" : "600",
          color: muted ? D.auth.textSubtle : D.blue,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Trust indicators row for auth screens */
export function TrustIndicators() {
  const items = [
    { icon: "shield-checkmark-outline" as const, title: "Safe & Secure", sub: "Your safety is our priority" },
    { icon: "people-outline" as const, title: "Trusted Community", sub: "Verified users, better rides" },
    { icon: "pricetag-outline" as const, title: "Great Prices", sub: "Save more with shared rides" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        marginTop: 36,
        paddingTop: 28,
        borderTopWidth: 1,
        borderTopColor: "rgba(30, 58, 95, 0.6)",
      }}
    >
      {items.map((item, index) => (
        <View
          key={item.title}
          style={{
            flex: 1,
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 4,
            borderLeftWidth: index > 0 ? 1 : 0,
            borderLeftColor: "rgba(30, 58, 95, 0.6)",
          }}
        >
          <Ionicons name={item.icon} size={22} color={D.blue} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: D.auth.text, textAlign: "center" }}>
            {item.title}
          </Text>
          <Text style={{ fontSize: 10, color: D.auth.textSubtle, textAlign: "center", lineHeight: 14 }}>
            {item.sub}
          </Text>
        </View>
      ))}
    </View>
  );
}
