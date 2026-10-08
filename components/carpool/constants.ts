export type CarpoolFilterMode =
  | "everyone"
  | "women_only"
  | "women_drivers"
  | "students"
  | "verified"
  | "lowest_price"
  | "best_match";

export type TimeWindow = "now" | "today" | "tomorrow" | "flexible";

export const CARPOOL_FILTERS: {
  value: CarpoolFilterMode;
  label: string;
  icon: "person.3.fill" | "lock.shield.fill" | "shield.fill" | "graduationcap.fill" | "checkmark.seal.fill" | "dollarsign.circle.fill" | "star.fill";
}[] = [
  { value: "everyone", label: "Everyone", icon: "person.3.fill" },
  { value: "women_only", label: "Women Only", icon: "lock.shield.fill" },
  { value: "women_drivers", label: "Women Drivers", icon: "shield.fill" },
  { value: "students", label: "Students", icon: "graduationcap.fill" },
  { value: "verified", label: "Verified Riders", icon: "checkmark.seal.fill" },
  { value: "lowest_price", label: "Lowest Price", icon: "dollarsign.circle.fill" },
  { value: "best_match", label: "Best Match", icon: "star.fill" },
];

export const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "flexible", label: "Flexible" },
];


export function getDepartureWindow(timeWindow: TimeWindow): {
  departureAfter?: string;
  departureBefore?: string;
} {
  const now = new Date();
  if (timeWindow === "flexible") return {};

  if (timeWindow === "now") {
    const after = new Date(now.getTime() - 15 * 60_000);
    const before = new Date(now.getTime() + 3 * 60 * 60_000);
    return { departureAfter: after.toISOString(), departureBefore: before.toISOString() };
  }

  const start = new Date(now);
  const end = new Date(now);
  if (timeWindow === "tomorrow") {
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { departureAfter: start.toISOString(), departureBefore: end.toISOString() };
}

export function apiFilterMode(filter: CarpoolFilterMode): CarpoolFilterMode {
  return filter;
}
