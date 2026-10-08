import { useRef } from "react";
import { Animated, Pressable, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function PressableScale({
  style,
  scaleTo = 0.98,
  children,
  onPress,
  disabled,
  accessibilityLabel,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
