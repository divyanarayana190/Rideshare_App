declare module 'react-native' {
  export const ActivityIndicator: any;
  export const Alert: any;
  export const Animated: any;
  export const Appearance: any;
  export const Dimensions: { get(dim: 'window' | 'screen'): { width: number; height: number } };
  export const Easing: { linear: any; ease: any; bezier: (...args: number[]) => any; in: (easing: any) => any; out: (easing: any) => any; inOut: (easing: any) => any; [key: string]: any };
  export const FlatList: any;
  export const KeyboardAvoidingView: any;
  export const Linking: { openURL(url: string): Promise<void>; canOpenURL(url: string): Promise<boolean>; getInitialURL(): Promise<string | null>; [key: string]: any };
  export const Modal: any;
  export const PanResponder: { create(config: any): { panHandlers: any } };
  export const Platform: any;
  export const Pressable: any;
  export const RefreshControl: any;
  export const ScrollView: any;
  export const StyleSheet: any;
  export const Switch: any;
  export const Text: any;
  export const TextInput: any;
  export const TouchableOpacity: any;
  export const Share: any;
  export const View: any;
  export type ViewProps = any;
  export type TextStyle = any;
  export type ViewStyle = any;
  export type StyleProp<T> = any;
  export type OpaqueColorValue = any;
  export function useColorScheme(): 'light' | 'dark' | null;
}

declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export const SafeAreaView: any;
  export const useSafeAreaInsets: any;
  export type Edge = 'top' | 'right' | 'bottom' | 'left';
  export type Metrics = any;
}

declare module 'react-native-gesture-handler' {
  export const GestureHandlerRootView: any;
}

declare module '@react-navigation/native' {
  export const DarkTheme: any;
  export const DefaultTheme: any;
  export const ThemeProvider: any;
}

declare module '@react-navigation/bottom-tabs' {
  export type BottomTabBarButtonProps = any;
}

declare module '@react-navigation/elements' {
  export const useLinkBuilder: any;
}

declare module 'cookie-parser';
declare module '@react-native-async-storage/async-storage';
declare module '@trpc/server/adapters/express';


declare module "@tanstack/react-query" {
  export const QueryClient: any;
  export const QueryClientProvider: any;
}

declare module "expo-router" {
  export const Link: any;
  export const Stack: any;
  export const Tabs: any;
  export const Redirect: any;
  export const Slot: any;
  export const router: any;
  export function useRouter(): any;
  export function useLocalSearchParams<T = Record<string, string | string[] | undefined>>(): T;
  export type Href<T = string> = T;
}

declare module "@react-navigation/elements" {
  export const PlatformPressable: any;
  export const useLinkBuilder: any;
}

declare module "react-native-maps" {
  import { ComponentType } from "react";
  const MapView: ComponentType<any>;
  export default MapView;
  export const Marker: ComponentType<any>;
  export const Polyline: ComponentType<any>;
  export const Circle: ComponentType<any>;
  export const PROVIDER_GOOGLE: string;
}
