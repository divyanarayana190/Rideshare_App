/**
 * Infrastructure Operations Command Center — aggregates real production telemetry.
 */
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  sum,
} from "drizzle-orm";
import os from "os";
import {
  driverSessions,
  emergencyAlerts,
  fraudFlags,
  notifications,
  ridePassengers,
  rideRequests,
  rides,
  supportTickets,
  systemAlerts,
  userPreferences,
  userProfiles,
} from "../../drizzle/schema";
import { db, getDbPoolStats } from "../db";
import { getDispatchRuntimeMetrics } from "./dispatchMetricsService";
import { dispatchQueue } from "./driverMatcher";
import { syncInfraAlerts } from "./infraAlertService";
import { listCompanyDomains } from "./marketplaceOpsService";
import { getRequestMetricsSummary } from "./requestMetricsService";
import { probeAllServices, type ServiceProbe } from "./thirdPartyProbeService";
import { getWebSocketManager } from "./websocket";

export const SERVER_STARTED_AT = new Date(
  Date.now() - process.uptime() * 1000,
).toISOString();

type SystemStatus =
  | "healthy"
  | "warning"
  | "partial_degradation"
  | "major_outage"
  | "critical_failure";

function computeHealthScore(
  factors: Array<{ weight: number; score: number }>,
): number {
  const totalWeight = factors.reduce((a, f) => a + f.weight, 0);
  if (totalWeight === 0) return 100;
  const weighted = factors.reduce((a, f) => a + f.weight * f.score, 0);
  return Math.round(weighted / totalWeight);
}

function probeScore(status: ServiceProbe["status"]): number {
  if (status === "healthy") return 100;
  if (status === "degraded") return 60;
  if (status === "unknown") return 70;
  return 0;
}

function statusFromScore(score: number): SystemStatus {
  if (score >= 90) return "healthy";
  if (score >= 75) return "warning";
  if (score >= 55) return "partial_degradation";
  if (score >= 30) return "major_outage";
  return "critical_failure";
}

function envValidation() {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const recommended = [
    "REDIS_URL",
    "STRIPE_SECRET_KEY",
    "GOOGLE_MAPS_API_KEY",
    "TWILIO_ACCOUNT_SID",
  ];
  const missingRequired = required.filter((k) => !process.env[k]);
  const missingRecommended = recommended.filter((k) => !process.env[k]);
  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    status:
      missingRequired.length > 0
        ? "critical"
        : missingRecommended.length > 2
          ? "warning"
          : "healthy",
  };
}

function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result)) return result[0] as T | undefined;
  return (result as { rows?: T[] })?.rows?.[0];
}

export async function getInfraCommandCenter() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const oneHour = new Date(Date.now() - 3600000);

  const queueSize = dispatchQueue.getQueueSize();

  const [services, redis, apiMetrics, dispatchRuntime, poolStats] =
    await Promise.all([
      probeAllServices(),
      import("../redis").then(({ getRedisTelemetry }) =>
        getRedisTelemetry(queueSize),
      ),
      Promise.resolve(getRequestMetricsSummary()),
      Promise.resolve(getDispatchRuntimeMetrics()),
      Promise.resolve(getDbPoolStats()),
    ]);

  // DB health queries
  const dbStart = Date.now();
  const [tableCountRow] = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE()`,
  );
  const dbQueryMs = Date.now() - dbStart;

  let dbSizeMb: number | null = null;
  try {
    const sizeResult = await db.execute(
      sql`SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMb
          FROM information_schema.tables WHERE table_schema = DATABASE()`,
    );
    dbSizeMb = Number(firstRow<{ sizeMb: number }>(sizeResult)?.sizeMb ?? 0);
  } catch {
    dbSizeMb = null;
  }

  const indexResult = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND cardinality = 0`,
  );

  // Matching engine from DB
  const [pendingSearching] = await db
    .select({ c: count() })
    .from(rides)
    .where(eq(rides.status, "searching"));
  const [pendingRequests] = await db
    .select({ c: count() })
    .from(rideRequests)
    .where(eq(rideRequests.status, "pending"));
  const [avgMatchRow] = await db
    .select({
      avgSec: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${rides.createdAt}, ${rides.driverAssignedAt}))`,
    })
    .from(rides)
    .where(
      and(isNotNull(rides.driverAssignedAt), gte(rides.createdAt, oneHour)),
    );
  const [successfulHour] = await db
    .select({ c: count() })
    .from(rides)
    .where(
      and(
        gte(rides.createdAt, oneHour),
        ne(rides.driverId, 0),
        isNotNull(rides.driverAssignedAt),
      ),
    );
  const [failedHour] = await db
    .select({ c: count() })
    .from(rides)
    .where(
      and(
        gte(rides.createdAt, oneHour),
        eq(rides.status, "cancelled"),
        eq(rides.rideStep, "finding_driver"),
      ),
    );

  const avgMatchSec = Number(avgMatchRow?.avgSec ?? 0);
  const matchTotal = Number(successfulHour.c) + Number(failedHour.c);
  const dbMatchSuccessRate =
    matchTotal > 0
      ? Math.round((Number(successfulHour.c) / matchTotal) * 1000) / 10
      : 100;

  const [immediatePending] = await db
    .select({ c: count() })
    .from(rides)
    .where(and(eq(rides.status, "searching"), isNull(rides.departureTime)));
  const [scheduledPending] = await db
    .select({ c: count() })
    .from(rides)
    .where(and(eq(rides.status, "searching"), isNotNull(rides.departureTime)));
  const [womenOnlyPending] = await db
    .select({ c: count() })
    .from(rides)
    .where(and(eq(rides.status, "searching"), ne(rides.safetyMode, "none")));
  const [studentPending] = await db
    .select({ c: count() })
    .from(rides)
    .innerJoin(ridePassengers, eq(ridePassengers.rideId, rides.id))
    .innerJoin(
      userProfiles,
      eq(userProfiles.userId, ridePassengers.passengerId),
    )
    .where(
      and(
        eq(rides.status, "searching"),
        eq(userProfiles.isStudentVerified, true),
      ),
    );

  let corporatePending = 0;
  try {
    const domains = await listCompanyDomains();
    if (domains.length > 0) {
      const domain = domains[0]!;
      const [row] = await db
        .select({ c: count() })
        .from(rides)
        .where(
          and(
            eq(rides.status, "searching"),
            sql`${rides.id} IN (
            SELECT rp.rideId FROM ride_passengers rp
            INNER JOIN users u ON rp.passengerId = u.id
            WHERE SUBSTRING_INDEX(u.email, '@', -1) = ${domain}
          )`,
          ),
        );
      corporatePending = Number(row?.c ?? 0);
    }
  } catch {
    corporatePending = 0;
  }

  // Notifications
  const [notifToday] = await db
    .select({ c: count() })
    .from(notifications)
    .where(gte(notifications.createdAt, todayStart));
  const [pushTokens] = await db
    .select({ c: count() })
    .from(userPreferences)
    .where(
      and(
        isNotNull(userPreferences.pushToken),
        ne(userPreferences.pushToken, ""),
      ),
    );
  const [inAppUnread] = await db
    .select({ c: count() })
    .from(notifications)
    .where(eq(notifications.isRead, false));

  // Operations live counts
  const [liveTrips] = await db
    .select({ c: count() })
    .from(rides)
    .where(
      inArray(rides.status, [
        "matched",
        "driver_arrived",
        "in_progress",
      ] as any),
    );
  const [liveDrivers] = await db
    .select({ c: count() })
    .from(driverSessions)
    .where(inArray(driverSessions.status, ["online", "on_ride"]));
  const [liveRiders] = await db
    .select({ c: count() })
    .from(ridePassengers)
    .innerJoin(rides, eq(rides.id, ridePassengers.rideId))
    .where(
      inArray(rides.status, [
        "matched",
        "driver_arrived",
        "in_progress",
      ] as any),
    );
  const [openSafety] = await db
    .select({ c: count() })
    .from(emergencyAlerts)
    .where(eq(emergencyAlerts.status, "active"));
  const [openFraud] = await db
    .select({ c: count() })
    .from(fraudFlags)
    .where(eq(fraudFlags.status, "open"));
  const [openSupport] = await db
    .select({ c: count() })
    .from(supportTickets)
    .where(inArray(supportTickets.status, ["open", "in_progress"] as any));

  // Socket stats
  const ws = getWebSocketManager();
  const socketStats =
    ws?.getOperationalStats(Number(liveDrivers.c), Number(liveRiders.c)) ??
    null;

  // Cost monitoring
  const [ridesToday] = await db
    .select({ c: count(), revenue: sum(rides.totalFare) })
    .from(rides)
    .where(
      and(gte(rides.createdAt, todayStart), eq(rides.status, "completed")),
    );
  const [ridesWeek] = await db
    .select({ c: count() })
    .from(rides)
    .where(and(gte(rides.createdAt, weekAgo), eq(rides.status, "completed")));
  const [ridesMonth] = await db
    .select({ c: count() })
    .from(rides)
    .where(and(gte(rides.createdAt, monthAgo), eq(rides.status, "completed")));
  const ridesTodayCount = Number(ridesToday.c);
  const revenueToday = Number(ridesToday.revenue ?? 0);

  const mapsApiCostPerRequest = 0.005;
  const smsCostPerMessage = 0.0075;
  const dailyMapsCents = Math.round(
    ridesTodayCount * 3 * mapsApiCostPerRequest * 100,
  );
  const dailySmsCents = Math.round(
    ridesTodayCount * 2 * smsCostPerMessage * 100,
  );
  const stripeCents = Math.round(revenueToday * 0.029 * 100);
  const notifCents = Math.round(ridesTodayCount * 0.002 * 100);
  const storageCents = Math.round(ridesTodayCount * 0.001 * 100);
  const railwayCents = 500; // baseline daily infra estimate when on Railway
  const estimatedDailyCost =
    dailyMapsCents +
    dailySmsCents +
    stripeCents +
    notifCents +
    storageCents +
    railwayCents;
  const costPerRide =
    ridesTodayCount > 0 ? Math.round(estimatedDailyCost / ridesTodayCount) : 0;

  const weeklyCost = estimatedDailyCost * 7;
  const monthlyCost = estimatedDailyCost * 30;

  // Active system alerts
  const activeAlerts = await db
    .select()
    .from(systemAlerts)
    .where(eq(systemAlerts.status, "active"))
    .orderBy(desc(systemAlerts.createdAt))
    .limit(20);

  // Regional health — bucket by pickup lat/lng (1 decimal)

  const regionExpr = sql<string>`
  CONCAT(
    ROUND(${rides.pickupLat}, 1),
    ',',
    ROUND(${rides.pickupLng}, 1)
  )
`;

  const regionalRows = await db
    .select({
      region: regionExpr,
      trips: count(),
      cancelled: sql<number>`
      SUM(
        CASE
          WHEN ${rides.status} = 'cancelled'
          THEN 1
          ELSE 0
        END
      )
    `,
    })
    .from(rides)
    .where(gte(rides.createdAt, oneHour))
    .groupBy(regionExpr)
    .orderBy(desc(count()))
    .limit(8);

  // Hourly demand forecast from last 7 days same hour
  const currentHour = new Date().getHours();
  const [forecastResult] = await Promise.all([
    db.execute(
      sql`SELECT AVG(hourly_cnt) AS avgTrips FROM (
        SELECT DATE(createdAt) AS d, HOUR(createdAt) AS h, COUNT(*) AS hourly_cnt
        FROM rides
        WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND HOUR(createdAt) = ${currentHour}
        GROUP BY DATE(createdAt), HOUR(createdAt)
      ) t`,
    ),
  ]);
  const demandForecast = Math.round(
    Number(firstRow<{ avgTrips: number }>(forecastResult)?.avgTrips ?? 0),
  );

  const [onlineDriversForecast] = await db
    .select({ c: count() })
    .from(driverSessions)
    .where(inArray(driverSessions.status, ["online", "on_ride"]));

  // Health score
  const dbProbe = services.find((s) => s.name === "Database");
  const redisProbe = services.find((s) => s.name === "Redis");
  const factors = [
    { weight: 20, score: probeScore(dbProbe?.status ?? "unknown") },
    { weight: 15, score: redis.connected ? 100 : 40 },
    {
      weight: 10,
      score: probeScore(
        services.find((s) => s.name === "Stripe")?.status ?? "unknown",
      ),
    },
    {
      weight: 8,
      score: probeScore(
        services.find((s) => s.name === "Twilio")?.status ?? "unknown",
      ),
    },
    {
      weight: 8,
      score: probeScore(
        services.find((s) => s.name === "Google Maps")?.status ?? "unknown",
      ),
    },
    {
      weight: 5,
      score: probeScore(
        services.find((s) => s.name === "Expo Push")?.status ?? "unknown",
      ),
    },
    {
      weight: 10,
      score: socketStats
        ? Math.min(100, 100 - socketStats.droppedConnections)
        : 80,
    },
    { weight: 10, score: queueSize < 50 ? 100 : queueSize < 200 ? 70 : 40 },
    { weight: 14, score: Math.max(0, 100 - apiMetrics.errorRate * 5) },
  ];
  let healthScore = computeHealthScore(factors);
  let systemStatus = statusFromScore(healthScore);

  // Redis down → force DEGRADED (partial_degradation) minimum + cap score
  if (!redis.connected) {
    healthScore = Math.min(healthScore, 74);
    if (systemStatus === "healthy" || systemStatus === "warning") {
      systemStatus = "partial_degradation";
    }
  }

  // Sync infra alerts (non-blocking)
  const alertInputs = [];
  if (!redis.connected) {
    alertInputs.push({
      alertKey: "infra_redis_disconnected",
      metric: "redis_status",
      severity: "critical" as const,
      message:
        "Redis disconnected — system health DEGRADED; in-memory fallback active",
      currentValue: 0,
      threshold: 1,
    });
  }
  if ((dbProbe?.latencyMs ?? 0) > 500) {
    alertInputs.push({
      alertKey: "infra_db_latency",
      metric: "db_latency_ms",
      severity: "warning" as const,
      message: `Database latency elevated: ${dbProbe?.latencyMs}ms`,
      currentValue: dbProbe?.latencyMs ?? 0,
      threshold: 500,
    });
  }
  if (queueSize > 100) {
    alertInputs.push({
      alertKey: "infra_queue_backlog",
      metric: "dispatch_queue_size",
      severity: queueSize > 500 ? ("critical" as const) : ("warning" as const),
      message: `Dispatch queue backlog: ${queueSize} rides`,
      currentValue: queueSize,
      threshold: 100,
    });
  }
  if (apiMetrics.errorRate > 5) {
    alertInputs.push({
      alertKey: "infra_api_error_rate",
      metric: "api_error_rate",
      severity: "warning" as const,
      message: `API error rate ${apiMetrics.errorRate}%`,
      currentValue: apiMetrics.errorRate,
      threshold: 5,
    });
  }
  syncInfraAlerts(alertInputs).catch(() => {});

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const envCheck = envValidation();

  // Predictive hints from real trends
  const predictive: string[] = [];
  if (redis.memoryUsagePct != null && redis.memoryUsagePct > 75) {
    predictive.push(
      "Redis memory trending high — consider scaling or TTL review",
    );
  }
  if (dbMatchSuccessRate < 70) {
    predictive.push(
      "Match success rate declining — check driver supply in active regions",
    );
  }
  if (Number(openSupport.c) > 20) {
    predictive.push("Support backlog elevated — consider staffing escalation");
  }

  return {
    timestamp: new Date().toISOString(),
    system: {
      status: systemStatus,
      healthScore,
      label: !redis.connected
        ? "DEGRADED"
        : systemStatus === "healthy"
          ? "Healthy"
          : systemStatus === "warning"
            ? "Warning"
            : systemStatus === "partial_degradation"
              ? "Partial Degradation"
              : systemStatus === "major_outage"
                ? "Major Outage"
                : "Critical Failure",
      servicesHealthy: services.filter((s) => s.status === "healthy").length,
      servicesTotal: services.length,
    },
    railway: {
      serviceStatus: process.env.RAILWAY_ENVIRONMENT ? "healthy" : "unknown",
      deploymentStatus: "active",
      currentVersion:
        process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ??
        process.env.npm_package_version ??
        "dev",
      lastDeploymentTime: process.env.RAILWAY_DEPLOYMENT_ID
        ? SERVER_STARTED_AT
        : null,
      lastSuccessfulDeployment: SERVER_STARTED_AT,
      serverUptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      containerRestarts: null,
      hostname: os.hostname(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? "development",
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT ?? null,
      railwayProjectId: process.env.RAILWAY_PROJECT_ID ?? null,
      envValidation: envCheck,
    },
    redis,
    socket: socketStats,
    matching: {
      pendingRideRequests: Number(pendingSearching.c),
      pendingDriverRequests: Number(pendingRequests.c),
      matchingQueueSize: queueSize,
      avgMatchTimeSeconds: Math.round(avgMatchSec),
      failedMatchesHour: Number(failedHour.c),
      successfulMatchesHour: Number(successfulHour.c),
      matchSuccessRate: dbMatchSuccessRate,
      rideFillRate: dbMatchSuccessRate,
      runtime: dispatchRuntime,
      breakdown: {
        immediate: Number(immediatePending.c),
        scheduled: Number(scheduledPending.c),
        womenOnly: Number(womenOnlyPending.c),
        studentVerified: Number(studentPending.c),
        corporate: corporatePending,
      },
      bottlenecks: [
        ...(queueSize > 20
          ? [`${queueSize} rides in active dispatch queue`]
          : []),
        ...(Number(pendingSearching.c) > 10
          ? [`${pendingSearching.c} rides waiting for driver`]
          : []),
        ...(avgMatchSec > 120
          ? [`Average match time ${Math.round(avgMatchSec)}s exceeds 2min SLA`]
          : []),
      ],
    },
    notifications: {
      sentToday: Number(notifToday.c),
      pushTokensRegistered: Number(pushTokens.c),
      inAppUnread: Number(inAppUnread.c),
      pendingNotifications: Number(inAppUnread.c),
      deliverySuccessRate: null,
      breakdown: {
        expoPush: Number(pushTokens.c),
        sms: ridesTodayCount * 2,
        email: 0,
        inApp: Number(notifToday.c),
      },
      topFailureReasons: [],
    },
    api: apiMetrics,
    database: {
      ...poolStats,
      queryLatencyMs: dbProbe?.latencyMs ?? dbQueryMs,
      dbSizeMb,
      tableCount: Number(firstRow<{ cnt: number }>(tableCountRow)?.cnt ?? 0),
      indexHealthIssues: Number(
        firstRow<{ cnt: number }>(indexResult)?.cnt ?? 0,
      ),
      slowQueries: [],
      failedQueries: 0,
    },
    thirdParty: {
      services,
      dependencyGraph: services.map((s) => ({
        id: s.name,
        status: s.status,
        latencyMs: s.latencyMs,
        dependsOn: s.name === "Database" ? [] : ["Database"],
      })),
    },
    alerts: {
      active: activeAlerts.map((a) => ({
        id: a.id,
        alertKey: a.alertKey,
        metric: a.metric,
        severity: a.severity,
        message: a.message,
        currentValue: a.currentValue,
        threshold: a.threshold,
        createdAt: a.createdAt,
      })),
      operationalFeed: alertInputs.map((a) => ({ ...a, level: a.severity })),
    },
    costs: {
      costPerRideCents: costPerRide,
      dailyCostCents: estimatedDailyCost,
      weeklyCostCents: weeklyCost,
      monthlyCostCents: monthlyCost,
      ridesToday: ridesTodayCount,
      breakdown: {
        railway: railwayCents,
        twilio: dailySmsCents,
        maps: dailyMapsCents,
        stripeFees: stripeCents,
        notifications: notifCents,
        storage: storageCents,
      },
    },
    operations: {
      liveTrips: Number(liveTrips.c),
      liveDrivers: Number(liveDrivers.c),
      liveRiders: Number(liveRiders.c),
      activeMatchingRequests: queueSize + Number(pendingSearching.c),
      openSafetyIncidents: Number(openSafety.c),
      openFraudAlerts: Number(openFraud.c),
      openSupportTickets: Number(openSupport.c),
    },
    regional: regionalRows.map((r) => ({
      region: r.region,
      tripsLastHour: Number(r.trips),
      cancelled: Number(r.cancelled),
      health:
        Number(r.trips) > 0 && Number(r.cancelled) / Number(r.trips) > 0.3
          ? "degraded"
          : "healthy",
    })),
    forecasting: {
      demandForecastTrips: demandForecast,
      driverSupplyForecast: Number(onlineDriversForecast.c),
      capacityUtilization:
        Number(liveDrivers.c) > 0
          ? Math.round((Number(liveTrips.c) / Number(liveDrivers.c)) * 100)
          : 0,
      predictiveWarnings: predictive,
    },
    // Legacy fields for backward compatibility
    services,
    overallStatus:
      systemStatus === "healthy"
        ? "healthy"
        : systemStatus === "warning"
          ? "degraded"
          : "critical",
    costPerRide,
    ridesLast24h: ridesTodayCount,
    estimatedDailyCost,
  };
}
