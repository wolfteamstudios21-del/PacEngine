import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pacengineRouter from "./pacengine";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pacengineRouter);

export default router;
