import { Alert, Platform } from "react-native";
import type { RequestItem } from "./types";

const AVATAR_PALETTE = ["#1E88FF", "#22C55E", "#7C3AED", "#F59E0B", "#EC4899", "#14B8A6", "#10B981"];

export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  const isToday = d.toDateString() === new Date().toDateString();
  const prefix = isToday ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${prefix} ${hh}:${m < 10 ? "0" : ""}${m} ${ampm}`;
}

export function shortAddr(addr: string) {
  return addr ? addr.split(",")[0].trim() : "—";
}

export function showAlert(t: string, m: string) {
  if (Platform.OS === "web") window.alert(`${t}\n${m}`);
  else Alert.alert(t, m);
}

export function matchScore(r: RequestItem) {
  return Math.min(99, Math.round(60 + Math.min(30, (Number(r.passengerRating) - 4) * 15) + Math.min(10, Number(r.passengerRides))));
}

export function matchColor(pct: number) {
  if (pct >= 85) return "#22C55E";
  if (pct >= 65) return "#F59E0B";
  return "#EF4444";
}

export function getItemStatus(r: RequestItem): "pending" | "accepted" | "rejected" {
  if (r.status === "approved") return "accepted";
  if (r.status === "rejected") return "rejected";
  return "pending";
}

export function isWomenOnlyPreference(pref: string | null | undefined) {
  if (!pref) return false;
  const p = pref.toLowerCase();
  return p.includes("women") || p === "women_only" || p === "women_drivers_only" || p === "women_companions_only";
}

export function countSince(requests: RequestItem[], days: number) {
  const cutoff = Date.now() - days * 86400000;
  return requests.filter((r) => new Date(r.createdAt).getTime() >= cutoff).length;
}

export function countToday(requests: RequestItem[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return requests.filter((r) => new Date(r.createdAt) >= start).length;
}
