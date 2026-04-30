import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pacengineRouter from "./pacengine";
import rendererRouter from "./renderer";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pacengineRouter);
router.use(rendererRouter);

export default router;
