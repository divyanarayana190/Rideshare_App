import React from "react";
import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

type ScreenContainerProps = React.PropsWithChildren<
  ViewProps & {
    edges?: Edge[];
    className?: string;
    containerClassName?: string;
    safeAreaClassName?: string;
  }
>;

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  return (
    <View
      {...props}
      style={[{ flex: 1 }, style]}
      className={cn("bg-background", containerClassName)}
    >
      <SafeAreaView
        edges={edges}
        style={{ flex: 1 }}
        className={cn(safeAreaClassName)}
      >
        <View style={{ flex: 1 }} className={cn(className)}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

export type { ScreenContainerProps };
