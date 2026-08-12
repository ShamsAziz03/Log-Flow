import { Request, Response } from "express";
import { BadRequestError } from "../errors/badRequest.js";
import { isValidLogEntry } from "../services/ingestionLogs.js";
import { db } from "../db/index.js";

type AcceptedLogEntry = {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
  attributes?: Record<string, string | number | boolean>;
};
type RejectedLogEntry = {
  index: number;
  reason: string;
};

export function insertLogs(req: Request, res: Response) {
  const logs = req.body.logs;
  const rejectedLogs: RejectedLogEntry[] = [];
  const acceptedLogs: AcceptedLogEntry[] = [];

  //check top level logs is an array
  if (!Array.isArray(logs)) {
    throw new BadRequestError("logs must be an array");
  }

  //now check each entry
  for (let i = 0; i < logs.length; i++) {
    const result = isValidLogEntry(logs[i]);

    if (!result.success) {
      rejectedLogs.push({ index: i + 1, reason: result.reason });
    } else {
      acceptedLogs.push(logs[i]);
    }
  }

  //check if all entries were rejected
  if (acceptedLogs.length === 0) {
    return res.status(400).json({
      accepted: acceptedLogs.length,
      rejected: rejectedLogs,
    });
  }

  //add accepted logs to database

  //send response
  return res.status(200).json({
    accepted: acceptedLogs.length,
    rejected: rejectedLogs,
  });
}
