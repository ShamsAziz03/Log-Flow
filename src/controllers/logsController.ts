import { Request, Response } from "express";
import { BadRequestError } from "../errors/badRequest.js";
import { isValidLogEntry } from "../services/ingestionLogs.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { logs } from "../db/schema.js";
import { uuidv7 } from "uuidv7";

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

function toSqlArray(values: any[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]`;
}

export async function insertLogs(req: Request, res: Response) {
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
  const ids = acceptedLogs.map(() => uuidv7());
  await db.execute(sql`
  INSERT INTO logs (
    id,
    timestamp,
    level,
    service,
    message,
    attributes
  )
  SELECT *
  FROM unnest(
    ${toSqlArray(ids)}::uuid[],
    ${toSqlArray(acceptedLogs.map((x) => x.timestamp))}::timestamptz[],
    ${toSqlArray(acceptedLogs.map((x) => x.level))}::log_level[],
    ${toSqlArray(acceptedLogs.map((x) => x.service))}::text[],
    ${toSqlArray(acceptedLogs.map((x) => x.message))}::text[],
    ${toSqlArray(acceptedLogs.map((x) => JSON.stringify(x.attributes ?? {})))}::jsonb[]
  );
`);

  //send response
  return res.status(200).json({
    accepted: acceptedLogs.length,
    rejected: rejectedLogs,
  });
}
