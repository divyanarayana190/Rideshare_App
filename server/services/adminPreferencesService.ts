/**
 * Per-admin saved filters and dashboard widget layout — stored in platform_config (no new tables).
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { platformConfig } from "../../drizzle/schema";

export type SavedFilter = {
  id: string;
  name: string;
  page: string;
  filters: Record<string, string | boolean | number>;
  createdAt: string;
};

export type DashboardWidget = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: "kpi_revenue", label: "Revenue KPIs", enabled: true, order: 0 },
  { id: "kpi_rides", label: "Ride KPIs", enabled: true, order: 1 },
  { id: "kpi_users", label: "User KPIs", enabled: true, order: 2 },
  { id: "kpi_safety", label: "Safety & Support", enabled: true, order: 3 },
  { id: "revenue_chart", label: "Revenue Chart", enabled: true, order: 4 },
  { id: "rides_pie", label: "Rides by Status", enabled: true, order: 5 },
  { id: "activity_feed", label: "Recent Activity", enabled: true, order: 6 },
  { id: "top_drivers", label: "Top Drivers", enabled: true, order: 7 },
  { id: "safety_alerts", label: "Safety Alerts", enabled: true, order: 8 },
  { id: "ai_insights", label: "AI Insights", enabled: true, order: 9 },
];

function filtersKey(adminId: number) {
  return `admin_saved_filters_${adminId}`;
}

function widgetsKey(adminId: number) {
  return `admin_dashboard_widgets_${adminId}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
  if (!row?.value) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown, description: string) {
  const payload = JSON.stringify(value);
  const [existing] = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
  if (existing) {
    await db.update(platformConfig).set({ value: payload, type: "json" }).where(eq(platformConfig.key, key));
  } else {
    await db.insert(platformConfig).values({ key, value: payload, description, type: "json" });
  }
}

export async function listSavedFilters(adminId: number, page?: string) {
  const all = await readJson<SavedFilter[]>(filtersKey(adminId), []);
  return page ? all.filter((f) => f.page === page) : all;
}

export async function saveFilter(adminId: number, input: { name: string; page: string; filters: Record<string, unknown> }) {
  const all = await readJson<SavedFilter[]>(filtersKey(adminId), []);
  const entry: SavedFilter = {
    id: `sf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    page: input.page,
    filters: input.filters as SavedFilter["filters"],
    createdAt: new Date().toISOString(),
  };
  all.unshift(entry);
  await writeJson(filtersKey(adminId), all.slice(0, 50), "Admin saved list filters");
  return entry;
}

export async function deleteSavedFilter(adminId: number, filterId: string) {
  const all = await readJson<SavedFilter[]>(filtersKey(adminId), []);
  const next = all.filter((f) => f.id !== filterId);
  await writeJson(filtersKey(adminId), next, "Admin saved list filters");
  return { deleted: all.length - next.length };
}

export async function getDashboardWidgets(adminId: number) {
  const saved = await readJson<DashboardWidget[]>(widgetsKey(adminId), []);
  if (saved.length === 0) return DEFAULT_DASHBOARD_WIDGETS;
  const map = Object.fromEntries(saved.map((w) => [w.id, w]));
  return DEFAULT_DASHBOARD_WIDGETS.map((d) => map[d.id] ?? d).sort((a, b) => a.order - b.order);
}

export async function saveDashboardWidgets(adminId: number, widgets: DashboardWidget[]) {
  await writeJson(widgetsKey(adminId), widgets, "Admin dashboard widget layout");
  return widgets;
}
