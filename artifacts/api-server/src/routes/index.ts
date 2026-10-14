import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nalamRouter from "./nalam";
import { requireAuthenticated } from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthenticated);
router.use(nalamRouter);

export default router;
