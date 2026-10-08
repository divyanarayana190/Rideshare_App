/**
 * GradientView — Web implementation using CSS linear-gradient.
 * 90deg, #1E88FF → #42C7FF — THE ONLY gradient in the app.
 */
import { View, type ViewStyle } from "react-native";
import { GRADIENT_CSS, GRADIENT_START } from "@/constants/design";

interface GradientViewProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function GradientView({ children, style }: GradientViewProps) {
  // React Native Web passes non-standard CSS through style as-is
  const webStyle = {
    backgroundColor: GRADIENT_START,
    // @ts-ignore — background is valid CSS on web, not in RN types
    background: GRADIENT_CSS,
  };
  return (
    <View style={[webStyle as any, style]}>
      {children}
    </View>
  );
}
