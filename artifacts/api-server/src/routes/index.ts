import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import chatRouter from "./chat";
import filesRouter from "./files";
import executeRouter from "./execute";
import projectRouter from "./project";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(chatRouter);
router.use(filesRouter);
router.use(executeRouter);
router.use(projectRouter);

export default router;
