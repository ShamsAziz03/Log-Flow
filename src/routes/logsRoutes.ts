import { Router } from "express";
import {
  insertLogs,
  queryLogs,
  aggregateLogs,
} from "../controllers/logsController.js";

const logsRouter = Router();

logsRouter.post("/logs", insertLogs);
logsRouter.get("/logs", queryLogs);
logsRouter.get("/logs/aggregate", aggregateLogs);

export default logsRouter;
