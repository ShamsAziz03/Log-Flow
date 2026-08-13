import { Router } from "express";
import { insertLogs } from "../controllers/logsController.js";
import { queryLogs } from "../controllers/logsController.js";

const logsRouter = Router();

logsRouter.post("/logs", insertLogs);
logsRouter.get("/logs", queryLogs);

export default logsRouter;
