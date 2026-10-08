import logger from "../logger";
import { reconcileAllExpiredRides } from "./rideExpiryReconciliation";

/** Background cron — delegates to shared reconciliation logic. */
export async function runMissedRideCron(): Promise<void> {
  await reconcileAllExpiredRides();
}

export function startMissedRideCron(): void {
  void runMissedRideCron();
  const interval = setInterval(runMissedRideCron, 5 * 60 * 1000);
  (interval as any).unref?.();
  logger.info("[cron] Missed-ride cron started (every 5 min)");
}
