import { useIsFocused as useNavIsFocused } from "@react-navigation/core";

/** True while the current screen/tab is focused. */
export function useIsFocused(): boolean {
  return useNavIsFocused();
}
