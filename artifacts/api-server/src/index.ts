import cluster from "node:cluster";
import os from "node:os";
import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// CLUSTER_WORKERS controls worker count.
// Defaults to 1 (no clustering) because the renderer bridge holds process-local
// state — sticky-session routing is required before running multiple workers.
// Set CLUSTER_WORKERS=auto to fork one worker per CPU core when the renderer
// is not in use, or set CLUSTER_WORKERS=N for an explicit count.
const rawWorkers = process.env["CLUSTER_WORKERS"] ?? "1";
const numCPUs = os.cpus().length;
const numWorkers = rawWorkers === "auto" ? numCPUs : Math.max(1, parseInt(rawWorkers, 10) || 1);

if (cluster.isPrimary) {
  logger.info({ workers: numWorkers, cpus: numCPUs }, "Primary process starting cluster");

  seedAdminUser().catch((err) => logger.error({ err }, "Seed error"));

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, "Worker crashed — restarting");
    cluster.fork();
  });
} else {
  app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port, pid: process.pid }, "Worker listening");
  });
}
