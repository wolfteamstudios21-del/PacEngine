import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_USERNAME = "WolfTeam19";

export async function seedAdminUser(): Promise<void> {
  const adminPassword = process.env["ADMIN_PASSWORD"];
  if (!adminPassword) {
    logger.warn("ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }

  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, ADMIN_USERNAME))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ username: ADMIN_USERNAME }, "Admin user already exists — skipping seed");
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await db.insert(usersTable).values({
      id: randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash,
      role: "admin",
    });
    logger.info({ username: ADMIN_USERNAME }, "Admin user seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
