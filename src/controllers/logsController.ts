import { Request, Response } from "express";
import { BadRequestError } from "../errors/badRequest.js";
import { isValidLogEntry } from "../services/ingestionLogs.js";
import { db, pool } from "../db/index.js";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { and, desc } from "drizzle-orm";
import { logs } from "../db/schema.js";
import { queryLogsHandler } from "../services/queryLogs.js";
import { aggregateLogsHandler } from "../services/aggregateLogs.js";
import { from } from "pg-copy-streams";

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


function escapeCsv(value: string): string {
  return value.replace(/"/g, '""');
}

export async function insertLogs(req: Request, res: Response) {
  const client = await pool.connect();

  try {
    const rejectedLogs: RejectedLogEntry[] = [];
    const acceptedLogs: AcceptedLogEntry[] = [];

    if (!Array.isArray(req.body.logs)) {
      throw new BadRequestError("logs must be an array");
    }

    for (let i = 0; i < req.body.logs.length; i++) {
      const result = isValidLogEntry(req.body.logs[i]);
      if (!result.success) {
        rejectedLogs.push({ index: i, reason: result.reason });
      } else {
        acceptedLogs.push(req.body.logs[i]);
      }
    }

    if (acceptedLogs.length === 0) {
      return res.status(400).json({
        accepted: acceptedLogs.length,
        rejected: rejectedLogs,
      });
    }

    const copyStream = client.query(
      from(`
        COPY logs (id, timestamp, level, service, message, attributes)
        FROM STDIN WITH (FORMAT csv)
      `),
    );

    await new Promise<void>((resolve, reject) => {
      copyStream.on("finish", resolve);
      copyStream.on("error", reject);

      for (const log of acceptedLogs) {
        const id = uuidv7();
        copyStream.write(
          `${id},${log.timestamp},${log.level},${log.service},${escapeCsv(log.message)},"${escapeCsv(JSON.stringify(log.attributes ?? {}))}"\n`,
        );
      }
      copyStream.end();
    });

    return res.status(200).json({
      accepted: acceptedLogs.length,
      rejected: rejectedLogs,
    });
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
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
