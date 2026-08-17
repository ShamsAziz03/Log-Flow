import { Request, Response } from "express";
import { BadRequestError } from "../errors/badRequest.js";
import { isValidLogEntry } from "../services/ingestionLogs.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { and, desc } from "drizzle-orm";
import { logs } from "../db/schema.js";
import { queryLogsHandler } from "../services/queryLogs.js";
import { aggregateLogsHandler } from "../services/aggregateLogs.js";

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
type AggregateRow = { start: string | Date; group?: string; count: number };

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

export async function queryLogs(req: Request, res: Response) {
  const queryResult = queryLogsHandler(req);
  const result = await db
    .select()
    .from(logs)
    .where(and(...queryResult.conditions))
    .orderBy(desc(logs.timestamp), desc(logs.id))
    .limit(queryResult.logsLimit + 1);

  if (result.length > queryResult.logsLimit) {
    const lastLog = result[queryResult.logsLimit - 1];
    const nextCursor = `${lastLog.timestamp.toISOString()}_${lastLog.id}`; // Create a cursor based on the last log's timestamp and ID
    return res.status(200).json({
      logs: result.slice(0, queryResult.logsLimit),
      next_cursor: nextCursor,
    });
  }

  return res.status(200).json({ logs: result, next_cursor: null });
}

export async function aggregateLogs(req: Request, res: Response) {
  const { conditions, fullTime, group_by } = aggregateLogsHandler(req);
  //do DB query
  if (group_by === "service" || group_by === "level") {
    let groupByExpr = null;
    if (group_by === "service") {
      groupByExpr = logs.service;
    } else {
      groupByExpr = logs.level;
    }
    const result = await db
      .select({
        start:
          sql<Date>`date_bin(${fullTime}, ${logs.timestamp}, '1970-01-01 00:00:00')`.as(
            "start",
          ),
        group: groupByExpr.as("group"),
        count: sql<number>`count(*)`.as("count"),
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(sql`start`, groupByExpr)
      .orderBy(sql`start ASC`);
    const buckets = result.map((row: AggregateRow) => ({
      start: new Date(row.start).toISOString(),
      group: row.group,
      count: Number(row.count),
    }));
    return res.status(200).json({ buckets });
  } else {
    const result = await db
      .select({
        start:
          sql<Date>`date_bin(${fullTime}, ${logs.timestamp}, '1970-01-01 00:00:00')`.as(
            "start",
          ),
        count: sql<number>`count(*)`.as("count"),
      })
      .from(logs)
      .where(and(...conditions))
      .groupBy(sql`start`)
      .orderBy(sql`start ASC`);

    const buckets = result.map((row: AggregateRow) => ({
      start: new Date(row.start).toISOString(),
      group: null,
      count: Number(row.count),
    }));
    return res.status(200).json({ buckets });
  }
}
