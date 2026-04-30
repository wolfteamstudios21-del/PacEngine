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

// Fork one worker per CPU core for API autoscaling.
// NOTE: The /api/renderer/* routes hold process-local state in the native
// addon bridge (when compiled). In stub mode (default on Replit), all workers
// are stateless and clustering is safe. If the native renderer is enabled,
// use a load balancer with sticky-session routing pointed at this cluster.
const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  logger.info({ workers: numCPUs }, "Primary process starting cluster");

  seedAdminUser().catch((err) => logger.error({ err }, "Seed error"));

  for (let i = 0; i < numCPUs; i++) {
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
