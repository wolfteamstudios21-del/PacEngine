import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/admin/users", requireAdmin, async (_req: Request, res: Response) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json({ users });
});

export default router;
