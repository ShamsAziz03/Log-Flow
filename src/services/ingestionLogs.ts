type ResultLogEntry = { success: boolean; reason: string };

type LogEntry = {
  timestamp?: string;
  level?: string;
  message?: string;
  service?: string;
  attributes?: Record<string, string | boolean | number>;
};

export function validateTimestamp(timestamp: unknown): string | null {
  if (typeof timestamp !== "string") {
    return "timestamp must be a string";
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return "timestamp must be a valid date string";
  }

  //to check if it iso
  const iso8601Regex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  if (!iso8601Regex.test(timestamp)) {
    return "timestamp must be a valid ISO 8601 timestamp";
  }

  //to check if it not exceed 5 mins from now
  const timeNow = Date.now();
  if (date.getTime() > timeNow + 5 * 60 * 1000)
    return "timestamp must not exceed 5 minutes from now";

  return null; // valid
}

export function validateLevel(level: string | undefined): string | null {
  if (typeof level !== "string") {
    return "level must be a string";
  }

  if (
    level !== "debug" &&
    level !== "info" &&
    level !== "warn" &&
    level !== "error"
  ) {
    return `Invalid Level: ${level}. Must be one of: debug, info, warn, error`;
  }

  return null; // valid
}

export function validateService(service: string | undefined): string | null {
  if (typeof service !== "string") {
    return "service must be a string";
  }

  if (service.trim() === "") {
    return "service must be a non-empty string";
  }

  return null; // valid
}

export function validateMessage(message: string | undefined): string | null {
  if (typeof message !== "string") {
    return "message must be a string";
  }

  if (message.trim() === "") {
    return "message must be a non-empty string";
  }

  return null; // valid
}

export function validateAttributes(
  attributes: Record<string, boolean | string | number> | undefined,
): string | null {
  if (typeof attributes !== "object" || attributes === null) {
    return "invalid attributes: must be an object";
  }

  for (let key in attributes) {
    let value = attributes[key];
    if (value === null || typeof value === "object" || Array.isArray(value)) {
      return "invalid attribute value: must be an flat object";
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return "invalid attribute value: must be a string, number, or boolean";
    }
  }
  return null; // valid
}

export function isValidLogEntry(log: LogEntry): ResultLogEntry {
  if (typeof log !== "object" || log === null || Array.isArray(log)) {
    return {
      success: false,
      reason: "Invalid Log structure: log must be an object",
    };
  }
  //check other data
  if (
    !Object.hasOwn(log, "timestamp") ||
    !Object.hasOwn(log, "level") ||
    !Object.hasOwn(log, "service") ||
    !Object.hasOwn(log, "message")
  ) {
    let missing;

    if (!Object.hasOwn(log, "timestamp")) {
      missing = "timestamp";
    } else if (!Object.hasOwn(log, "level")) {
      missing = "level";
    } else if (!Object.hasOwn(log, "service")) {
      missing = "service";
    } else missing = "message";

    return {
      success: false,
      reason: `Missing required field: ${missing}`,
    };
  }

  //check time
  const time = validateTimestamp(log.timestamp);
  if (time) {
    return { success: false, reason: time };
  }

  //check level
  const level = validateLevel(log.level);
  if (level) {
    return { success: false, reason: level };
  }

  //check service
  const service = validateService(log.service);
  if (service) {
    return { success: false, reason: service };
  }

  //check message
  const message = validateMessage(log.message);
  if (message) {
    return { success: false, reason: message };
  }

  //check attributes
  if (Object.hasOwn(log, "attributes")) {
    const att = validateAttributes(log.attributes);
    if (att) {
      return { success: false, reason: att };
    }
  }

  return { success: true, reason: "Valid log entry" };
}
