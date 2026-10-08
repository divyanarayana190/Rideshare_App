import { createExpressMiddleware } from "@trpc/server/adapters/express";
import compression from "compression";
import cookieParser from "cookie-parser";
import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createServer, type Server } from "http";
import {
  addRidePassenger,
  cancelStrandedRides,
  closeDbPool,
  createRide,
  getActiveRecurringRides,
  getRide,
  getRidePassengers,
  getRidesDepartingSoon,
  updateRide,
} from "../db";
import logger from "../logger";
import { closeRedis, isRedisAvailable, redis } from "../redis";
import { appRouter } from "../routers";
import adminRouter from "../routes/admin";
import advancedRouter from "../routes/admin-advanced";
import mapsRouter from "../routes/maps";
import { startDriverExpiryCron } from "../services/driverExpiryCron";
import { dispatchQueue } from "../services/driverMatcher";
import {
  notificationBus,
  pushRideStatusUpdate,
} from "../services/notificationService";
import { startMissedRideCron } from "../services/rideExpiryCron";
import { rideMonitor } from "../services/rideMonitor";
import { logDriverSchemaHealthOnStartup } from "../services/schemaHealth";
import {
  notifyDriverRideReminder,
  notifyUser,
} from "../services/userNotifications";
import { initializeWebSocket } from "../services/websocket";
import { recordRequest } from "../services/requestMetricsService";
import { createContext } from "./context";
import { ENV } from "./env";

import { registerOAuthRoutes } from "./oauth";
import { sdk } from "./sdk";

// ── Track active SSE connections for cleanup ──────────────────────────────────
const activeSseConnections = new Set<Response>();

let httpServer: Server | null = null;
let isShuttingDown = false;

async function startServer() {
  await logDriverSchemaHealthOnStartup();

  // ── Startup safety checks ───────────────────────────────────────────────────
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32 || jwtSecret === "supersecret_dev_key_change_me") {
    if (process.env.NODE_ENV === "production") {
      logger.fatal(
        "JWT_SECRET is missing or uses a placeholder value — refusing to start in production",
      );
      process.exit(1);
    } else {
      logger.warn(
        "JWT_SECRET is weak or a placeholder — replace before deploying to production",
      );
    }
  }

  const app = express();
  const server = createServer(app);
  httpServer = server;

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // In production CORS_ALLOWED_ORIGINS must be set (enforced above); in dev allow all.
  const wsCorsOrigins = corsOrigins.length
    ? corsOrigins
    : process.env.NODE_ENV === "production"
      ? []
      : ["*"];
  initializeWebSocket(server, wsCorsOrigins);

  // Broadcast infra snapshot to connected admin clients every 10s
  setInterval(async () => {
    try {
      const { getWebSocketManager } = await import("../services/websocket");
      const { getInfraCommandCenter } = await import("../services/infraOpsService");
      const ws = getWebSocketManager();
      if (!ws) return;
      const snapshot = await getInfraCommandCenter();
      ws.broadcastToAdmin("infra:update", {
        operations: snapshot.operations,
        system: snapshot.system,
        timestamp: snapshot.timestamp,
      });
    } catch {
      /* non-fatal */
    }
  }, 10_000);

  // ── 0) Compression ──────────────────────────────────────────────────────
  app.use(compression());

  // ── 1) Security Headers ───────────────────────────────────────────────────
  // Only enable helmet in production — it can interfere with Expo Web dev server
  if (process.env.NODE_ENV === "production") {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            frameSrc: [
              "'self'",
              "blob:",
              "https://js.stripe.com",
              "https://hooks.stripe.com",
              "https://connect.stripe.com",
            ],
            connectSrc: [
              "'self'",
              "https://api.stripe.com",
              "https://*.basemaps.cartocdn.com",
              "https://router.project-osrm.org",
              "https://nominatim.openstreetmap.org",
              "https://places.googleapis.com",
              "https://routes.googleapis.com",
            ],
            imgSrc: ["'self'", "data:", "https:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
          },
        },
        crossOriginEmbedderPolicy: false, // Required for Stripe iframe
        crossOriginResourcePolicy: { policy: "cross-origin" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      }),
    );
  }

  // ── 2) CORS ───────────────────────────────────────────────────────────────
  const CORS_ALLOWED_ORIGINS = ENV.corsAllowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isProduction = process.env.NODE_ENV === "production";

  // In production, CORS_ALLOWED_ORIGINS must be set — fail fast rather than
  // silently allowing all origins.
  if (isProduction && CORS_ALLOWED_ORIGINS.length === 0) {
    logger.fatal(
      "CORS_ALLOWED_ORIGINS is empty in production — refusing to start. Set it to your app's domain.",
    );
    process.exit(1);
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed = isProduction
        ? CORS_ALLOWED_ORIGINS.includes(origin)
        : CORS_ALLOWED_ORIGINS.includes(origin) ||
          origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1");
      if (isAllowed) {
        res.header("Access-Control-Allow-Origin", origin);
      }
    }
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Idempotency-Key",
    );
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // ── 3) Graceful shutdown guard ────────────────────────────────────────────
  app.use((req, res, next) => {
    if (isShuttingDown) {
      res.status(503).json({ error: "Server is shutting down" });
      return;
    }
    next();
  });

  // ── 4) Rate Limiting (Redis-backed with in-memory fallback) ───────────────
  const rateLimitFallback = new Map<
    string,
    { count: number; resetAt: number }
  >();
  const RATE_LIMIT_MAP_MAX = 10_000; // cap in-memory map to prevent unbounded growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitFallback) {
      if (now > entry.resetAt) rateLimitFallback.delete(ip);
    }
    // Safety eviction: if still over limit, remove oldest entries
    if (rateLimitFallback.size > RATE_LIMIT_MAP_MAX) {
      const toDelete = rateLimitFallback.size - RATE_LIMIT_MAP_MAX;
      let deleted = 0;
      for (const key of rateLimitFallback.keys()) {
        rateLimitFallback.delete(key);
        if (++deleted >= toDelete) break;
      }
    }
  }, 120_000);

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path === "/healthz" ||
      req.path === "/api/health" ||
      req.path === "/api/events" ||
      req.path === "/api/webhooks/stripe"
    ) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const WINDOW = 60; // seconds
    const MAX = 2000; // requests per window

    try {
      const redisUp = await isRedisAvailable();
      if (redisUp) {
        const key = `ratelimit:ip:${ip}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, WINDOW);
        const ttl = await redis.ttl(key);
        const resetAt = Math.ceil(Date.now() / 1000) + (ttl > 0 ? ttl : WINDOW);
        const remaining = Math.max(0, MAX - count);
        res.setHeader("RateLimit-Limit", MAX);
        res.setHeader("RateLimit-Remaining", remaining);
        res.setHeader("RateLimit-Reset", resetAt);
        if (count > MAX) {
          logger.warn({ ip, count }, "Rate limit exceeded");
          res
            .status(429)
            .json({ error: "Too many requests. Please slow down." });
          return;
        }
      } else {
        // Fallback to in-memory
        const now = Date.now();
        let entry = rateLimitFallback.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + WINDOW * 1000 };
          rateLimitFallback.set(ip, entry);
        }
        entry.count++;
        const remaining = Math.max(0, MAX - entry.count);
        const resetSec = Math.ceil(entry.resetAt / 1000);
        res.setHeader("RateLimit-Limit", MAX);
        res.setHeader("RateLimit-Remaining", remaining);
        res.setHeader("RateLimit-Reset", resetSec);
        if (entry.count > MAX) {
          res
            .status(429)
            .json({ error: "Too many requests. Please slow down." });
          return;
        }
      }
    } catch {
      // Rate limit check failed — allow request (fail open)
    }
    next();
  });

  // ── 5) Stripe Webhook (MUST be before body parsing — needs raw body) ─────
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) {
        res.status(400).json({ error: "Missing stripe-signature" });
        return;
      }

      try {
        const {
          constructWebhookEvent,
          storeWebhookEvent,
          isWebhookProcessed,
          processWebhookEvent,
          markWebhookProcessed,
          markWebhookFailed,
        } = await import("../services/stripeService");

        const event = constructWebhookEvent(req.body as Buffer, sig);

        // Idempotency check
        if (await isWebhookProcessed(event.id)) {
          res.json({ received: true, duplicate: true });
          return;
        }

        // Store and acknowledge immediately
        await storeWebhookEvent(event);
        res.json({ received: true });

        // Process async
        try {
          await processWebhookEvent(event);
          await markWebhookProcessed(event.id);
        } catch (err) {
          logger.error(
            { err, eventId: event.id },
            "[stripe-webhook] Failed to process event",
          );
          await markWebhookFailed(event.id, String(err));
        }
      } catch (err) {
        logger.error({ err }, "[stripe-webhook] Signature verification failed");
        res.status(400).json({ error: "Invalid webhook signature" });
      }
    },
  );

  // ── 6) Parse cookies ──────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 7) Body parsing (reduced limits for security) ─────────────────────────
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // ── 7) Request logging + metrics ────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const level =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info";
      if (req.path !== "/healthz" && req.path !== "/api/health") {
        recordRequest(req.path, res.statusCode, duration);
        logger[level]({
          type: "request",
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
        });
      }
    });
    next();
  });

  // ── 8) OAuth / cookie-setting routes ──────────────────────────────────────
  registerOAuthRoutes(app);

  // ── 9) Health Check (production-grade) ────────────────────────────────────
  app.get("/healthz", async (_req, res) => {
    const checks: Record<string, boolean | string> = {
      server: true,
      uptime: `${Math.round(process.uptime())}s`,
    };

    let healthy = true;

    // Check MySQL
    try {
      await import("../db");
      checks.mysql = true;
    } catch {
      checks.mysql = false;
      healthy = false;
    }

    // Schema drift (required tables for credits, legal, push, passenger requests)
    if (checks.mysql) {
      try {
        const { checkProductionSchemaHealth } =
          await import("../services/schemaHealth");
        const schema = await checkProductionSchemaHealth();
        checks.schema = schema.ok;
        if (!schema.ok) {
          healthy = false;
          if (schema.missingTables.length > 0) {
            checks.schemaMissingTables = schema.missingTables.join(",");
          }
          if (schema.warnings.length > 0) {
            checks.schemaWarnings = schema.warnings.join(";");
          }
        }
      } catch {
        checks.schema = false;
        healthy = false;
      }
    }

    // Check Redis
    try {
      checks.redis = await isRedisAvailable();
    } catch {
      checks.redis = false;
      // Redis failure is non-fatal — degrade, don't die
    }

    checks.sseConnections = activeSseConnections.size.toString();
    checks.dispatchQueue = dispatchQueue.getQueueSize().toString();

    try {
      const { getRedisTelemetry, getRedisUrlAudit } = await import("../redis");
      const redisTelemetry = await getRedisTelemetry(dispatchQueue.getQueueSize());
      checks.redisUrlFromEnv = String(getRedisUrlAudit().configuredViaEnv);
      checks.redisConnected = String(redisTelemetry.connected);
      if (redisTelemetry.pingMs != null) checks.redisPingMs = String(redisTelemetry.pingMs);
      if (redisTelemetry.keysCount != null) checks.redisKeys = String(redisTelemetry.keysCount);
    } catch {
      checks.redisConnected = "false";
    }

    res.status(healthy ? 200 : 503).json(checks);
  });

  // Keep legacy health endpoint for backward compatibility
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: Date.now(),
      dispatchQueueSize: dispatchQueue.getQueueSize(),
      sseClients: activeSseConnections.size,
    });
  });

  // ── 9.5) File Upload Route (multipart → R2) ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const multer = require("multer") as typeof import("multer");
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type not allowed. Accepted: ${allowed.join(", ")}`));
      }
    },
  });

  app.post(
    "/api/upload",
    (req: Request, res: Response, next: NextFunction) => {
      upload.single("file")(req as any, res as any, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            res
              .status(400)
              .json({ error: "File too large. Maximum size is 10MB" });
          } else if (err.message?.includes("File type not allowed")) {
            res.status(400).json({ error: err.message });
          } else {
            res.status(400).json({ error: err.message || "Upload error" });
          }
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req as any);
        if (!user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = (req as any).file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }

        const purpose = (req as any).body?.purpose || "misc";
        const validPurposes = [
          "profile_photo",
          "license_front",
          "license_back",
          "insurance_doc",
          "vehicle_photo",
          "vehicle_registration",
          "community_logo",
          "community_banner",
          "misc",
        ];
        if (!validPurposes.includes(purpose)) {
          res.status(400).json({ error: "Invalid purpose" });
          return;
        }

        const { saveUploadedFile } =
          await import("../services/fileUploadService");
        const result = await saveUploadedFile({
          userId: (user as any).id ?? 0,
          purpose: purpose as any,
          fileBuffer: file.buffer,
          originalName: file.originalname || "upload",
          mimeType: file.mimetype,
        });

        res.json({
          success: true,
          uploadId: result.uploadId,
          key: result.key,
          originalFileName: file.originalname || "upload",
          contentType: file.mimetype,
          size: file.size,
        });
      } catch (err: any) {
        logger.error({ err }, "[upload] Error");
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    },
  );

  // ── 9.6) Signed URL endpoint (user-facing) ─────────────────────────────
  app.get("/api/files/signed-url", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req as any);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
      if (!key) {
        res.status(400).json({ error: "Missing key parameter" });
        return;
      }

      const { getFileOwner } = await import("../services/fileUploadService");
      const { getSignedDownloadUrl } = await import("../services/r2Service");

      const userId = (user as any).id as number;
      const userRole = (user as any).role as string | undefined;

      // Admins can access any file; users can only access their own
      if (userRole !== "admin") {
        const ownerUserId = await getFileOwner(key);
        if (ownerUserId === null || ownerUserId !== userId) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
      }

      const signedUrl = await getSignedDownloadUrl(key, 300);
      res.json({ signedUrl, expiresInSeconds: 300 });
    } catch (err: any) {
      logger.error({ err }, "[signed-url] Error");
      res
        .status(500)
        .json({ error: err.message || "Failed to generate signed URL" });
    }
  });

  // ── 10) Maps routes ───────────────────────────────────────────────────────
  app.use("/api/maps", mapsRouter);

  // ── 10c) Analytics event ingestion ────────────────────────────────────────
  // Lightweight fire-and-forget endpoint. Writes structured log lines — no DB.
  app.post("/api/analytics/event", (req: Request, res: Response) => {
    const { name, props, ts } = req.body ?? {};
    if (name) {
      logger.info({ event: name, props, ts, ip: req.ip }, "[analytics]");
    }
    res.status(204).end();
  });

  // ── 10b) Admin routes ──────────────────────────────────────────────────────
  app.use("/admin", adminRouter);
  app.use("/admin", advancedRouter);

  // ── 11) SSE — Real-time push notifications & ride updates ─────────────────
  app.get("/api/events", async (req: Request, res: Response) => {
    let userId: number | null = null;
    try {
      // EventSource API cannot send custom headers, so we accept the JWT as
      // a ?token= query param and inject it as a Bearer Authorization header.
      const qToken =
        typeof req.query.token === "string" ? req.query.token : null;
      if (qToken && !req.headers.authorization) {
        (req as any).headers = {
          ...req.headers,
          authorization: `Bearer ${qToken}`,
        };
      }
      const user = await sdk.authenticateRequest(req as any);
      if (user?.id) userId = user.id;
    } catch {
      /* unauthenticated */
    }

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

    // Track this connection for graceful shutdown
    activeSseConnections.add(res);

    const writer = (data: string) => {
      try {
        res.write(data);
      } catch {
        /* client gone */
      }
    };
    notificationBus.registerSseClient(userId, writer);

    // 25s heartbeat to keep connections alive through proxies/load balancers
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      activeSseConnections.delete(res);
      notificationBus.unregisterSseClient(userId!, writer);
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
  });

  // ── 12) tRPC ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // ── 13) Global error handler ──────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  // ── Dispatch queue event logging ──────────────────────────────────────────
  dispatchQueue.removeAllListeners("dispatch:accepted");
  dispatchQueue.removeAllListeners("dispatch:failed");
  dispatchQueue.removeAllListeners("dispatch:timeout");
  dispatchQueue.removeAllListeners("driver:request");

  dispatchQueue.on("dispatch:accepted", ({ rideId, driverId }) => {
    logger.info({ rideId, driverId }, "Ride accepted by driver");
    import("../services/dispatchMetricsService").then(({ recordDispatchAccepted }) => recordDispatchAccepted(rideId));
    import("../services/socketMetricsService").then(({ recordSocketEvent }) => recordSocketEvent("ride_accepted"));
  });
  dispatchQueue.on("dispatch:failed", ({ rideId }) => {
    logger.warn({ rideId }, "No drivers found for ride");
    import("../services/dispatchMetricsService").then(({ recordDispatchFailed }) => recordDispatchFailed(rideId));
  });
  dispatchQueue.on("dispatch:timeout", ({ rideId, driverId }) => {
    logger.info({ rideId, driverId }, "Driver timed out — trying next");
    import("../services/dispatchMetricsService").then(({ recordDispatchTimeout }) => recordDispatchTimeout(rideId));
  });
  dispatchQueue.on("driver:request", ({ rideId, driverId }) => {
    logger.info({ rideId, driverId }, "Dispatching ride to driver");
    import("../services/socketMetricsService").then(({ recordSocketEvent }) => recordSocketEvent("ride_request"));
  });

  // ── Start Server ──────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT || "3001", 10);

  // Log Redis status
  const redisOk = await isRedisAvailable();
  logger.info({ redis: redisOk ? "connected" : "unavailable" }, "Redis status");

  server.maxConnections = 15000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.listen(port, async () => {
    logger.info({ port }, "Server listening");
    logger.info("SSE  → GET /api/events");
    logger.info("tRPC → /api/trpc");
    logger.info("Health → GET /healthz");
    try {
      const { ensureLegalPolicyVersionsSeeded } =
        await import("../services/legalService");
      await ensureLegalPolicyVersionsSeeded();
    } catch (err) {
      logger.warn({ err }, "Legal policy version seed skipped");
    }
    // Recover rides stranded in finding_driver from a previous server process
    try {
      const stranded = await cancelStrandedRides();
      if (stranded.length > 0) {
        logger.warn(
          { count: stranded.length },
          "[startup] Cancelled stranded rides from previous process",
        );
        for (const r of stranded) {
          try {
            const passengers = await getRidePassengers(r.id);
            const passengerIds = passengers.map((p) => p.passengerId);
            if (passengerIds.length > 0) {
              pushRideStatusUpdate(r.rideId, "cancelled", passengerIds, {
                rideId: r.rideId,
                reason: "Server restarted — please book a new ride",
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      logger.warn({ err }, "[startup] Stranded ride recovery failed");
    }
  });

  // ── Recurring-rides cron ─────────────────────────────────────────────────
  // Runs once per hour; only materialises instances for the next `daysAhead`
  // days so we never double-create a ride that already exists for a given date.
  startRecurringRidesCron();

  // ── Ride reminder cron ───────────────────────────────────────────────────
  // Sends push notification ~30 min before each scheduled / recurring ride.
  startRideReminderCron();

  // ── Missed ride cron ─────────────────────────────────────────────────────
  // Marks expired searching rides and driver no-shows as missed.
  startMissedRideCron();

  // ── Driver expiry cron ───────────────────────────────────────────────────
  // Daily: warns drivers 60d/30d before document expiry; auto-suspends on expiry.
  startDriverExpiryCron();

  // ── Alert engine cron ────────────────────────────────────────────────────
  // Evaluates alert rules every 5 min; dispatches to webhooks + admin notifications.
  const { startAlertEngineCron } = await import("../services/alertEngineService");
  startAlertEngineCron();

  // ── RideMonitor geofence: auto-confirm driver arrival ────────────────────
  // When the driver's GPS enters the 50 m pickup geofence, automatically
  // advance the ride step to "driver_arrived" and notify the passenger.
  rideMonitor.onGeofenceArrival = async (rideDbId, _driverId) => {
    try {
      const ride = await getRide(rideDbId);
      if (!ride || ride.rideStep === "driver_arrived") return;

      await updateRide(rideDbId, { rideStep: "driver_arrived" } as any);
      rideMonitor.updateRideStep(ride.rideId, "driver_arrived");

      const passengers = await getRidePassengers(rideDbId);
      const passengerIds = passengers.map((p) => p.passengerId);
      pushRideStatusUpdate(ride.rideId, "driver_arrived", passengerIds, {
        rideId: ride.rideId,
      });

      logger.info(
        { rideId: ride.rideId },
        "[geofence] Driver arrived auto-confirmed",
      );
    } catch (e) {
      logger.warn(
        { rideDbId, err: e },
        "[geofence] Failed to auto-confirm driver arrival",
      );
    }
  };

  rideMonitor.start();
}

// Track which (recurringId, date) pairs have already been created this server
// process lifetime, so a rapid restart doesn't double-create.
const _recurringCreatedCache = new Set<string>();

async function runRecurringRidesCron() {
  try {
    const schedules = await getActiveRecurringRides();
    if (schedules.length === 0) return;

    const DAYS_AHEAD = 2; // create instances for today + tomorrow

    for (const rec of schedules) {
      const daysOfWeek = (rec.daysOfWeek as (number | string)[]).map((d) =>
        typeof d === "number"
          ? d
          : ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[d] ??
            -1),
      );
      const [hh, mm] = rec.departureTimeOfDay.split(":").map(Number);

      // Count how many instances have already been created for this recurring schedule
      const createdCount = [..._recurringCreatedCache].filter((k) =>
        k.startsWith(`${rec.recurringId}:`),
      ).length;

      for (let offset = 0; offset < DAYS_AHEAD; offset++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + offset);
        const dayOfWeek = targetDate.getDay();

        if (!daysOfWeek.includes(dayOfWeek)) continue;

        // Respect endDate if set
        if ((rec as any).endDate && targetDate > new Date((rec as any).endDate))
          continue;

        // Respect maxOccurrences if set
        if (
          (rec as any).maxOccurrences &&
          createdCount >= (rec as any).maxOccurrences
        )
          continue;

        targetDate.setHours(hh!, mm!, 0, 0);
        if (targetDate <= new Date()) continue; // already passed

        // Dedup key: recurringId + YYYY-MM-DD
        const dateKey = targetDate.toISOString().slice(0, 10);
        const cacheKey = `${rec.recurringId}:${dateKey}`;
        if (_recurringCreatedCache.has(cacheKey)) continue;

        // Retry up to 3 times with exponential backoff
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const rideId = `ride_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const ride = await createRide({
              rideId,
              driverId: 0,
              mode: "share",
              status: "searching",
              rideStep: "finding_driver",
              pickupLat: rec.pickupLat,
              pickupLng: rec.pickupLng,
              pickupAddress: rec.pickupAddress,
              dropoffLat: rec.dropoffLat,
              dropoffLng: rec.dropoffLng,
              dropoffAddress: rec.dropoffAddress,
              distanceKm: rec.distanceKm ?? "10",
              estimatedMinutes: rec.estimatedMinutes ?? 30,
              totalFare: String(Number(rec.pricePerSeat) * rec.totalSeats),
              pricePerSeat: rec.pricePerSeat,
              totalSeats: rec.totalSeats,
              departureTime: targetDate,
              safetyMode: rec.safetyMode,
              approvalRequired: rec.approvalRequired,
              carpoolTitle: rec.title,
              recurringRideId: rec.id,
            });

            // Re-add the schedule creator as a passenger
            try {
              await addRidePassenger({
                rideId: ride.id,
                passengerId: rec.creatorId,
                status: "joined",
                pickupLat: rec.pickupLat,
                pickupLng: rec.pickupLng,
                pickupAddress: rec.pickupAddress,
                dropoffLat: rec.dropoffLat,
                dropoffLng: rec.dropoffLng,
                dropoffAddress: rec.dropoffAddress,
                fareShare: rec.pricePerSeat,
              } as any);
            } catch {
              /* non-critical */
            }

            _recurringCreatedCache.add(cacheKey);
            logger.info(
              {
                recurringId: rec.recurringId,
                rideId: ride.rideId,
                date: dateKey,
              },
              "[cron] Created recurring ride instance",
            );
            lastErr = undefined;
            break; // success — exit retry loop
          } catch (e) {
            lastErr = e;
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 1000)); // 1s, 2s backoff
            }
          }
        }
        if (lastErr) {
          logger.warn(
            { recurringId: rec.recurringId, dateKey, err: lastErr },
            "[cron] Failed to create instance after 3 attempts",
          );
        }
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "[cron] runRecurringRidesCron failed");
  }
}

function startRecurringRidesCron() {
  // Run immediately on boot (catches missed instances if server was down overnight)
  runRecurringRidesCron();
  // Then run every hour
  const interval = setInterval(runRecurringRidesCron, 60 * 60 * 1000);
  // Allow the process to exit even if this interval is active
  (interval as any).unref?.();
  logger.info("[cron] Recurring-rides cron started (hourly)");
}

// ── Ride Reminder Cron ────────────────────────────────────────────────────────

// Tracks which (rideId, userId) pairs have already received a reminder this cycle
// to avoid duplicate notifications if the cron fires more than once within the window.
const _reminderSentCache = new Set<string>();

async function runRideReminderCron() {
  try {
    const now = Date.now();
    // Window: rides departing 25–35 minutes from now
    const windowStart = now + 25 * 60 * 1000;
    const windowEnd = now + 35 * 60 * 1000;

    const upcoming = await getRidesDepartingSoon(windowStart, windowEnd);
    if (upcoming.length === 0) return;

    for (const entry of upcoming) {
      const cacheKey = `${entry.rideId}:${entry.userId}`;
      if (_reminderSentCache.has(cacheKey)) continue;
      _reminderSentCache.add(cacheKey);

      const minsAway = Math.round(
        (entry.departureTime.getTime() - now) / 60_000,
      );
      const pickup = entry.pickupAddress ?? "your pickup";
      const dropoff = entry.dropoffAddress ?? "your destination";

      if (entry.recipientRole === "driver") {
        await notifyDriverRideReminder(entry.userId, {
          rideId: entry.rideId,
          pickupAddress: pickup,
          departureTime: entry.departureTime,
          minutesAway: minsAway,
        }).catch((e) =>
          logger.warn(
            { err: e, rideId: entry.rideId },
            "[cron] driver reminder failed",
          ),
        );
      } else {
        await notifyUser({
          userId: entry.userId,
          recipientRole: "passenger",
          type: "system",
          title: `Ride starts in ${minsAway} minutes`,
          body: `Your ride from ${pickup} to ${dropoff} departs soon. Be ready!`,
          data: { rideId: entry.rideId, notificationType: "ride_starts_soon" },
          deepLink: "/active-ride",
        }).catch((e) =>
          logger.warn(
            { err: e, rideId: entry.rideId },
            "[cron] passenger reminder failed",
          ),
        );
      }

      logger.info(
        { rideId: entry.rideId, userId: entry.userId, minsAway },
        "[cron] Ride reminder sent",
      );
    }

    // Prune old cache entries every 1000 entries to avoid unbounded growth
    if (_reminderSentCache.size > 1000) _reminderSentCache.clear();
  } catch (e) {
    logger.warn({ err: e }, "[cron] runRideReminderCron failed");
  }
}

function startRideReminderCron() {
  // Run every 5 minutes — fine-grained enough to catch rides in the 25–35 min window
  const interval = setInterval(runRideReminderCron, 5 * 60 * 1000);
  (interval as any).unref?.();
  logger.info("[cron] Ride-reminder cron started (every 5 min)");
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // In dev mode, exit immediately — tsx watch needs fast restarts
  if (isDev) {
    process.exit(0);
  }

  logger.info({ signal }, "Graceful shutdown initiated");

  // 1. Stop accepting new connections
  if (httpServer) {
    httpServer.close(() => logger.info("HTTP server closed"));
  }

  // 2. Close all SSE connections
  for (const res of activeSseConnections) {
    try {
      res.end();
    } catch {
      /* already closed */
    }
  }
  activeSseConnections.clear();

  // 3. Stop ride monitor and dispatch queue
  rideMonitor.stop();
  dispatchQueue.shutdown();

  // 4. Close all SSE notification bus clients
  notificationBus.closeAll();

  // 5. Wait for in-flight requests (max 10s)
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 10_000);
    (timeout as any).unref?.();
    if (httpServer) {
      httpServer.close(() => resolve());
    } else {
      resolve();
    }
  });

  // 6. Close Redis
  await closeRedis();

  // 7. Close DB pool last
  await closeDbPool();

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  gracefulShutdown("uncaughtException");
});

startServer().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});

// ── Multipart Parser ─────────────────────────────────────────────────────────

interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
  value?: string;
}

function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const parts: MultipartPart[] = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const bodyStr = body.toString("binary");
  let pos = bodyStr.indexOf(boundaryBuf.toString("binary"));
  if (pos === -1) return parts;

  while (pos < body.length) {
    pos += boundaryBuf.length;
    if (pos >= body.length) break;
    const nextTwo = bodyStr.substring(pos, pos + 2);
    if (nextTwo === "--") break;
    if (bodyStr.substring(pos, pos + 2) === "\r\n") pos += 2;

    const headerEnd = bodyStr.indexOf("\r\n\r\n", pos);
    if (headerEnd === -1) break;

    const headerSection = bodyStr.substring(pos, headerEnd);
    pos = headerEnd + 4;

    const nameMatch = headerSection.match(/name="([^"]+)"/);
    const filenameMatch = headerSection.match(/filename="([^"]+)"/);
    const ctMatch = headerSection.match(/Content-Type:\s*(.+)/i);

    const name = nameMatch?.[1] || "";
    const filename = filenameMatch?.[1];
    const contentType = ctMatch?.[1]?.trim();

    const nextBoundary = bodyStr.indexOf(boundaryBuf.toString("binary"), pos);
    if (nextBoundary === -1) break;

    let dataEnd = nextBoundary - 2;
    if (dataEnd < pos) dataEnd = pos;
    const data = body.subarray(pos, dataEnd);

    if (filename) {
      parts.push({ name, filename, contentType, data });
    } else {
      parts.push({ name, value: data.toString("utf-8") });
    }
    pos = nextBoundary;
  }
  return parts;
}
