export const DRIVER_STAT_RANGES = ["today", "week", "month", "all_time"] as const;
export type DriverStatRange = (typeof DRIVER_STAT_RANGES)[number];

export const DRIVER_RIDE_TABS = ["upcoming", "active", "completed", "missed", "cancelled"] as const;
export type DriverRideTab = (typeof DRIVER_RIDE_TABS)[number];

export const DRIVER_EARNINGS_RANGES = ["today", "week", "month", "all_time"] as const;
export type DriverEarningsRange = (typeof DRIVER_EARNINGS_RANGES)[number];
