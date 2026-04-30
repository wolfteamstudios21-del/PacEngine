import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pacengineRouter from "./pacengine";
import rendererRouter from "./renderer";
import authRouter from "./auth";
import adminRouter from "./admin";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(adminRouter);
router.use(healthRouter);
router.use(requireAuth, pacengineRouter);
router.use(requireAuth, rendererRouter);

export default router;
