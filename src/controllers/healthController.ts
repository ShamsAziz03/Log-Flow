import { Request, Response } from "express";
import { appState } from "../states.js";

export function getHealth(req: Request, res: Response) {
  if (appState.dbReady) {
    res.status(200).json({ status: "ok" });
  } else {
    res.status(503).json({ status: "not ready" });
  }
}