import { ScrollView, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { ComponentProps } from "react";
import { RQ } from "./theme";

type IconName = ComponentProps<typeof IconSymbol>["name"];

function MiniBars({ color, values }: { color: string; values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28, opacity: 0.35 }}>
      {values.map((v, i) => (
        <View key={i} style={{ width: 5, height: Math.max(4, (v / max) * 28), borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

function ProgressRing({ pct, color, size = 44 }: { pct: number; color: string; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={RQ.border} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${c}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

interface MetricTileProps {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  accent?: "bars" | "ring";
  ringPct?: number;
  bars?: number[];
}

function MetricTile({ icon, iconColor, iconBg, label, value, sub, accent, ringPct = 0, bars = [2, 5, 3, 7, 4] }: MetricTileProps) {
  return (
    <View style={{ width: 148, backgroundColor: RQ.surface, borderRadius: RQ.radiusMd, borderWidth: 1, borderColor: RQ.border, padding: 14, marginRight: 12, ...RQ.shadow }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name={icon} size={18} color={iconColor} />
        </View>
        {accent === "ring" ? (
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <ProgressRing pct={ringPct} color={iconColor} size={40} />
            <Text style={{ position: "absolute", fontSize: 9, fontWeight: "800", color: iconColor }}>{ringPct}%</Text>
          </View>
        ) : accent === "bars" ? (
          <MiniBars color={iconColor} values={bars} />
        ) : null}
      </View>
      <Text style={{ fontSize: 24, fontWeight: "800", color: RQ.text, marginTop: 12, letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: RQ.text, marginTop: 2 }}>{label}</Text>
      <Text style={{ fontSize: 11, color: RQ.textMuted, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

interface RequestsAnalyticsDashboardProps {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  acceptRate: number;
  todayCount: number;
  weekCount: number;
}

export function RequestsAnalyticsDashboard({
  total,
  pending,
  accepted,
  rejected,
  acceptRate,
  todayCount,
  weekCount,
}: RequestsAnalyticsDashboardProps) {
  const rateLabel = acceptRate >= 90 ? "Excellent" : acceptRate >= 70 ? "Good" : "Needs attention";
  const barSeed = [Math.max(1, pending), Math.max(1, accepted), Math.max(1, rejected), Math.max(1, todayCount), Math.max(1, weekCount)];

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 17, fontWeight: "800", color: RQ.text }}>Activity Summary</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RQ.greenSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: RQ.green }} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: RQ.green }}>Live</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 8, paddingBottom: 4 }}>
        <MetricTile icon="car.fill" iconColor={RQ.blue} iconBg="#EFF6FF" label="Total Requests" value={String(total)} sub="All time" accent="bars" bars={barSeed} />
        <MetricTile icon="bell.fill" iconColor={RQ.orange} iconBg={RQ.orangeSoft} label="Pending" value={String(pending)} sub="Waiting for response" accent="bars" bars={[pending, 2, 4, 3, pending + 1]} />
        <MetricTile icon="checkmark.circle.fill" iconColor={RQ.green} iconBg={RQ.greenSoft} label="Accepted" value={String(accepted)} sub="Approved riders" />
        <MetricTile icon="xmark.circle.fill" iconColor={RQ.red} iconBg={RQ.redSoft} label="Rejected" value={String(rejected)} sub="Declined requests" />
        <MetricTile icon="chart.line.uptrend.xyaxis" iconColor={RQ.green} iconBg={RQ.greenSoft} label="Accept Rate" value={`${acceptRate}%`} sub={rateLabel} accent="ring" ringPct={acceptRate} />
        <MetricTile icon="clock.fill" iconColor={RQ.purple} iconBg={RQ.purpleSoft} label="Today" value={String(todayCount)} sub="Requests today" />
        <MetricTile icon="calendar" iconColor={RQ.blue} iconBg="#EFF6FF" label="This Week" value={String(weekCount)} sub="Last 7 days" />
      </ScrollView>
    </View>
  );
}
