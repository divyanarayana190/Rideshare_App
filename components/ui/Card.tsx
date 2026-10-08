import { D, SHADOW_CARD } from "@/constants/design";
import { useColors } from "@/hooks/use-colors";
import { View, type ViewProps } from "react-native";

interface CardProps extends ViewProps {
  children: React.ReactNode;
  elevated?: boolean;
}

/** Premium rounded card with subtle shadow */
export function Card({ children, elevated, style, ...rest }: CardProps) {
  const colors = useColors();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: D.radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: D.spacing.md,
          ...(elevated ? SHADOW_CARD : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
