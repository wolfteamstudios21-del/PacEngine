import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signToken, verifyToken, requireAuth, cookieOptions } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const RegisterBody = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscores"),
  password: z.string().min(8).max(128),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/register", authLimiter, async (req: Request, res: Response) => {
  const parse = RegisterBody.safeParse(req.body);
  if (!parse.success) {
    res.status(422).json({ error: "Validation error", details: parse.error.issues });
    return;
  }
  const { username, password } = parse.data;

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  await db.insert(usersTable).values({ id, username, passwordHash, role: "user" });

  const user = { id, username, role: "user" as const };
  const token = signToken(user);
  res.cookie("pac_token", token, cookieOptions());
  logger.info({ username }, "New user registered");
  res.status(201).json({ user: { id, username, role: "user" } });
});

router.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(422).json({ error: "Validation error", details: parse.error.issues });
    return;
  }
  const { username, password } = parse.data;

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  const dbUser = rows[0];
  if (!dbUser) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, dbUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const user = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
  const token = signToken(user);
  res.cookie("pac_token", token, cookieOptions());
  logger.info({ username }, "User logged in");
  res.json({ user });
});

router.post("/auth/logout", authLimiter, (_req: Request, res: Response) => {
  res.clearCookie("pac_token", { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", (req: Request, res: Response) => {
  const token = req.cookies?.["pac_token"] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  res.json({ user });
});

export default router;
