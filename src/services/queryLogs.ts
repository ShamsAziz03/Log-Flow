import { Request } from "express";
import { BadRequestError } from "../errors/badRequest.js";
import { sql } from "drizzle-orm";
import { eq, gte, lt, ilike } from "drizzle-orm";
import { logs } from "../db/schema.js";

export function queryLogsHandler(req: Request) {
  const { service, level, since, until, q, limit, cursor } = req.query;

  const conditions = [];
  let logsLimit = 100;

  if (typeof service === "string" && service) {
    if (service.length > 100 || service.trim() === "") {
      throw new BadRequestError("Service name not Valid(empty|too long)");
    }
    conditions.push(eq(logs.service, service));
  }

  if (typeof level === "string" && level) {
    if (
      level !== "debug" &&
      level !== "info" &&
      level !== "warn" &&
      level !== "error"
    ) {
      throw new BadRequestError("Invalid log level");
    }
    conditions.push(eq(logs.level, level));
  }

  if (typeof since === "string" && since) {
    if (isNaN(new Date(since).getTime())) {
      throw new BadRequestError("Invalid 'since' date");
    }
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$/;
    if (!iso8601Regex.test(since)) {
      throw new BadRequestError("Invalid 'since' timestamp, Not ISO format");
    }
    conditions.push(gte(logs.timestamp, new Date(since)));
  }

  if (typeof until === "string" && until) {
    if (isNaN(new Date(until).getTime())) {
      throw new BadRequestError("Invalid 'until' date");
    }
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    if (!iso8601Regex.test(until)) {
      throw new BadRequestError("Invalid 'until' timestamp, Not ISO format");
    }
    conditions.push(lt(logs.timestamp, new Date(until)));
  }

  if (
    typeof since === "string" &&
    since &&
    typeof until === "string" &&
    until
  ) {
    if (new Date(since).getTime() > new Date(until).getTime()) {
      throw new BadRequestError("'since' date cannot be after 'until' date");
    }
  }

  if (typeof limit === "string" && limit) {
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 1000) {
      throw new BadRequestError(
        "Invalid 'limit' value, must be a positive integer not exceeding 1000",
      );
    }
    logsLimit = parsedLimit;
  }

  if (typeof q === "string" && q) {
    if (q.trim() === "") {
      throw new BadRequestError("Query string cannot be empty");
    }
    conditions.push(ilike(logs.message, `%${q}%`));
  }

  if (typeof cursor === "string" && cursor) {
    const curesorRegex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})_(.)+$/;
    if (!curesorRegex.test(cursor)) {
      throw new BadRequestError(
        "Invalid cursor format, must be in the format of timestamp_id",
      );
    }
    const [cursorTimestamp, cursorId] = cursor.split("_");
    conditions.push(
      sql`(${logs.timestamp}, ${logs.id}) < (${cursorTimestamp}::timestamptz, ${cursorId}::uuid)`,
    );
  }

  const jsonToMatch: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith("attr.")) {
      const attrKey = key.split(".")[1];

      if (typeof value !== "string") {
        throw new Error(`Attribute for ${attrKey} must be a string`);
      }
      let parsedValue: string | number | boolean = value;
      if (value === "true") parsedValue = true;
      else if (value === "false") parsedValue = false;
      else if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = Number(value);

      jsonToMatch[attrKey] = parsedValue;
    }
  }
  if (Object.keys(jsonToMatch).length > 0) {
    conditions.push(
      sql`${logs.attributes} @> ${JSON.stringify(jsonToMatch)}::jsonb`,
    );
  }

  return { conditions, logsLimit };
}
