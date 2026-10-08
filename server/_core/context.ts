import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import logger from "../logger";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext(opts: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error: any) {
    const msg = String(error?.message || "").toLowerCase();
    if (
      msg.includes("missing session cookie") ||
      msg.includes("invalid session cookie") ||
      msg.includes("unauthorized")
    ) {
      user = null;
    } else {
      logger.error({ err: error }, "[auth] authenticateRequest error");
      user = null;
    }
  }

  return { req: opts.req, res: opts.res, user };
}
