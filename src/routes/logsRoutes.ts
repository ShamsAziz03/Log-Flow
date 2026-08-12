import { Router } from "express";
import { insertLogs } from "../controllers/logsController.js";

const logsRouter = Router();

logsRouter.post("/logs", insertLogs);

export default logsRouter;
