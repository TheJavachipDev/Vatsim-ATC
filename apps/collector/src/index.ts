import { createDb } from "@vatsim-atc/core";
import cron from "node-cron";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { Poller } from "./poller.js";
import { syncBookings } from "./bookings.js";
import { refreshHourlyStats } from "./stats-cron.js";

async function main(): Promise<void> {
  const { db, pool } = createDb(config.databaseUrl);
  const poller = new Poller(db);

  logger.info({ pollIntervalMs: config.pollIntervalMs }, "collector starting");

  await poller.recover();

  let running = true;
  let inFlight: Promise<void> = Promise.resolve();

  // Datafeed poll loop: recursive timeout so cycles never overlap.
  const schedulePoll = (): void => {
    if (!running) return;
    setTimeout(() => {
      inFlight = poller
        .runCycle()
        .catch((err) => logger.error({ err }, "unhandled poll cycle error"))
        .finally(schedulePoll);
    }, config.pollIntervalMs);
  };

  // Bookings loop.
  const scheduleBookings = (): void => {
    if (!running) return;
    setTimeout(() => {
      void syncBookings(db)
        .catch((err) => logger.error({ err }, "unhandled bookings error"))
        .finally(scheduleBookings);
    }, config.bookingsIntervalMs);
  };

  // Prime both feeds immediately, then start their loops.
  await poller.runCycle().catch((err) => logger.error({ err }, "initial poll failed"));
  await syncBookings(db).catch((err) => logger.error({ err }, "initial bookings sync failed"));
  await refreshHourlyStats(db).catch((err) => logger.error({ err }, "initial stats refresh failed"));

  schedulePoll();
  scheduleBookings();

  // Hourly stats materialization.
  const statsTask = cron.schedule("0 * * * *", () => {
    void refreshHourlyStats(db).catch((err) => logger.error({ err }, "stats cron error"));
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down; leaving live sessions open");
    running = false;
    statsTask.stop();
    // Let any in-flight DB writes finish before closing the pool.
    await inFlight.catch(() => undefined);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "collector failed to start");
  process.exit(1);
});
