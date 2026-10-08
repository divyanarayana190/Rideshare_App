import { View } from "react-native";
import { RQ } from "./theme";

export function RequestsSkeletonList() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: 140, borderRadius: RQ.radius, backgroundColor: RQ.surfaceMuted, borderWidth: 1, borderColor: RQ.border }} />
      ))}
    </View>
  );
}
