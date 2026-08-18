import { BadRequestError } from "../errors/badRequest.js";
import { Request } from "express";
import { logs } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { eq, gte, ilike, lt } from "drizzle-orm";

export function aggregateLogsHandler(req: Request) {
  const { service, level, since, until, q, bucket, group_by } = req.query;

  const conditions = [];

  //check dates
  if (!since || typeof since !== "string") {
    throw new BadRequestError(
      "Since parameter is required and must be a string",
    );
  } else {
    if (isNaN(new Date(since).getTime())) {
      throw new BadRequestError("Invalid 'since' date");
    }
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$/;
    if (!iso8601Regex.test(since)) {
      throw new BadRequestError("Invalid 'since' timestamp, Not ISO format");
    }
  }
  if (!until || typeof until !== "string") {
    throw new BadRequestError(
      "Until parameter is required and must be a string",
    );
  } else {
    if (isNaN(new Date(until).getTime())) {
      throw new BadRequestError("Invalid 'until' date");
    }
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    if (!iso8601Regex.test(until)) {
      throw new BadRequestError("Invalid 'until' timestamp, Not ISO format");
    }
  }
  if (new Date(since).getTime() > new Date(until).getTime()) {
    throw new BadRequestError("'since' date cannot be after 'until' date");
  }

  conditions.push(gte(logs.timestamp, new Date(since)));
  conditions.push(lt(logs.timestamp, new Date(until)));

  //check service and level and q
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
  if (typeof q === "string" && q) {
    if (q.trim() === "") {
      throw new BadRequestError("Query string cannot be empty");
    }
    conditions.push(ilike(logs.message, `%${q}%`));
  }

  //validate attributes
  const jsonToMatch: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith("attr.")) {
      const attrKey = key.split(".")[1];

      if (typeof value !== "string") {
        throw new Error(`Attribute for ${attrKey} must be a string`);
      }
      jsonToMatch[attrKey] = value;
    }
  }
  if (Object.keys(jsonToMatch).length > 0) {
    conditions.push(
      sql`${logs.attributes} @> ${JSON.stringify(jsonToMatch)}::jsonb`,
    );
  }

  //validate bucket
  if (!bucket || typeof bucket !== "string") {
    throw new BadRequestError(
      "Bucket parameter is required and must be a string",
    );
  } else if (
    bucket.trim() !== "1m" &&
    bucket.trim() !== "5m" &&
    bucket.trim() !== "1h" &&
    bucket.trim() !== "1d"
  ) {
    throw new BadRequestError(
      "Invalid 'bucket' value, must be '1m', '5m', '1h', or '1d'",
    );
  }

  const timeUnit = bucket.slice(bucket.length - 1, bucket.length); // Get the last character (m, h, or d)
  const timeValue = parseInt(bucket.slice(0, bucket.length - 1), 10); // Get the numeric part

  let fullTime;
  if (timeUnit === "m") {
    fullTime = `${timeValue} minutes`;
  } else if (timeUnit === "h") {
    fullTime = `${timeValue} hours`;
  } else {
    fullTime = `${timeValue} days`;
  }

  if (typeof group_by === "string" && group_by) {
    if (group_by !== "service" && group_by !== "level") {
      throw new BadRequestError(
        "Invalid 'groupBy' value, must be 'service' or 'level'",
      );
    }
  }

  return { conditions: conditions, fullTime: fullTime, group_by: group_by };
}
