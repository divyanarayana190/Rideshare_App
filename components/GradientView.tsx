/**
 * GradientView — THE single gradient component for YOO.
 * Native: solid #1E88FF fallback (add expo-linear-gradient to upgrade).
 * Web: resolved via GradientView.web.tsx which uses CSS gradient.
 */
import { View, type ViewStyle } from "react-native";
import { GRADIENT_START } from "@/constants/design";

interface GradientViewProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function GradientView({ children, style }: GradientViewProps) {
  return (
    <View style={[{ backgroundColor: GRADIENT_START }, style]}>
      {children}
    </View>
  );
}
