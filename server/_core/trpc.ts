import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Per-user rate limiter: 100 requests per 60 s (in-memory, resets on restart)
const USER_RATE_LIMIT = 100;
const USER_RATE_WINDOW_MS = 60_000;
const userRateLimitMap = new Map<number, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of userRateLimitMap) {
    if (now > entry.resetAt) userRateLimitMap.delete(uid);
  }
}, 60_000);

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const now = Date.now();
  const uid = ctx.user.id;
  let entry = userRateLimitMap.get(uid);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + USER_RATE_WINDOW_MS };
    userRateLimitMap.set(uid, entry);
  } else {
    entry.count += 1;
    if (entry.count > USER_RATE_LIMIT) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please slow down.",
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Driver-only procedure — caller must have approved driver access.
 */
export const driverProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    const { getDriverAccessStatus, driverAccessDeniedMessage } = await import(
      "../services/driverAccessService.js"
    );
    const access = await getDriverAccessStatus(ctx.user.id);

    if (!access.canAccessDriverMode) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: driverAccessDeniedMessage(access),
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        driverAccess: access,
      },
    });
  }),
);
