import { beforeAll, describe, expect, it } from "vitest";
import {
  buildQuery,
  eventually,
  http,
  makeTimes,
  waitForHealth,
} from "./helpers";

describe("smoke: core required API contract", () => {
  const times = makeTimes();

  const runId = `${"local"}-${Math.random().toString(16).slice(2)}`;
  const SVC = `smoke-${runId}`;
  const SVC2 = `smoke2-${runId}`;

  beforeAll(async () => {
    await waitForHealth();
  });

  it("GET /health returns 200", async () => {
    const r = await http("GET", "/health");
    expect(r.status).toBe(200);
  });

  it("POST /logs accepts a valid batch", async () => {
    const payload = {
      logs: [
        {
          timestamp: times.T_A,
          level: "info",
          service: SVC,
          message: "hello world",
          attributes: {
            user_id: "42",
            region: "eu-west",
            retries: 3,
            success: true,
          },
        },
        {
          timestamp: times.T_B,
          level: "error",
          service: SVC,
          message: "payment declined",
          attributes: { user_id: "42", request_id: "r1" },
        },
        {
          timestamp: times.T_C,
          level: "warn",
          service: SVC,
          message: "timeout talking to downstream",
          attributes: { user_id: "7" },
        },
        {
          timestamp: times.T_SAME,
          level: "debug",
          service: SVC,
          message: "same timestamp A",
          attributes: { k: "v1" },
        },
        {
          timestamp: times.T_SAME,
          level: "debug",
          service: SVC,
          message: "same timestamp B",
          attributes: { k: "v2" },
        },
        {
          timestamp: times.T_B,
          level: "info",
          service: SVC2,
          message: "other service log",
          attributes: { user_id: "42" },
        },
      ],
    };

    const r = await http("POST", "/logs", {
      body: JSON.stringify(payload),
    });

    expect(r.status).toBe(200);
    expect(r.json).not.toBeNull();
    expect(r.json.accepted).toBe(6);
    expect(Array.isArray(r.json.rejected ?? [])).toBe(true);
  });

  it("GET /logs returns logs for a service; sorted by timestamp desc", async () => {
    const path = buildQuery("/logs", { service: SVC, limit: 1000 });

    const r = await eventually(
      () => http("GET", path),
      (resp) =>
        resp.status === 200 &&
        Array.isArray(resp.json?.logs) &&
        resp.json.logs.length === 5,
    );

    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.logs)).toBe(true);
    expect(r.json.logs).toHaveLength(5);

    for (const log of r.json.logs) {
      expect(typeof log.id).toBe("string");
      expect(log.id.length).toBeGreaterThan(0);
      expect(typeof log.timestamp).toBe("string");
      expect(log.service).toBe(SVC);
    }

    // Check timestamp descending (ISO strings compare lexicographically correctly)
    const ts = r.json.logs.map((l: any) => l.timestamp);
    for (let i = 0; i < ts.length - 1; i++) {
      expect(ts[i] >= ts[i + 1]).toBe(true);
    }
  });

  it("GET /logs ordering is deterministic when timestamps are equal", async () => {
    const path = buildQuery("/logs", { service: SVC, limit: 1000 });

    const r1 = await http("GET", path);
    const r2 = await http("GET", path);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const ids1 = r1.json.logs.map((l: any) => l.id);
    const ids2 = r2.json.logs.map((l: any) => l.id);
    expect(ids1).toEqual(ids2);
  });

  it("GET /logs supports filters: level, q, attr.<key>, since/until", async () => {
    // level=error
    {
      const r = await http(
        "GET",
        buildQuery("/logs", { service: SVC, level: "error", limit: 1000 }),
      );
      expect(r.status).toBe(200);
      expect(r.json.logs).toHaveLength(1);
      expect(r.json.logs[0].level).toBe("error");
    }

    // q=DECLINED (case-insensitive substring)
    {
      const r = await http(
        "GET",
        buildQuery("/logs", { service: SVC, q: "DECLINED", limit: 1000 }),
      );
      expect(r.status).toBe(200);
      expect(r.json.logs).toHaveLength(1);
    }

    // attr.user_id=42 (string compare)
    {
      const r = await http(
        "GET",
        `${buildQuery("/logs", { service: SVC, limit: 1000 })}&attr.user_id=42`,
      );
      console.log("status:", r.status);
      console.log("body:", JSON.stringify(r.json, null, 2));
      expect(r.status).toBe(200);
      expect(r.json.logs.length).toBe(2);
    }

    // numeric attribute compared as string: retries=3
    {
      const r = await http(
        "GET",
        `${buildQuery("/logs", { service: SVC, limit: 1000 })}&attr.retries=3`,
      );
      expect(r.status).toBe(200);
      expect(r.json.logs.length).toBe(1);
    }

    // boolean attribute compared as string: success=true
    {
      const r = await http(
        "GET",
        `${buildQuery("/logs", { service: SVC, limit: 1000 })}&attr.success=true`,
      );
      expect(r.status).toBe(200);
      expect(r.json.logs.length).toBe(1);
    }

    // since/until range
    {
      const r = await http(
        "GET",
        buildQuery("/logs", {
          service: SVC,
          since: times.T_A,
          until: times.UNTIL,
          limit: 1000,
        }),
      );
      expect(r.status).toBe(200);
      expect(Array.isArray(r.json.logs)).toBe(true);
      expect(r.json.logs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("GET /logs cursor pagination works (opaque cursor, no overlap)", async () => {
    const page1 = await http(
      "GET",
      buildQuery("/logs", { service: SVC, limit: 2 }),
    );
    expect(page1.status).toBe(200);
    expect(page1.json.logs).toHaveLength(2);
    expect(typeof page1.json.next_cursor).toBe("string");
    expect(page1.json.next_cursor.length).toBeGreaterThan(0);

    const cursor = page1.json.next_cursor as string;

    const page2 = await http(
      "GET",
      buildQuery("/logs", { service: SVC, limit: 2, cursor }),
    );
    expect(page2.status).toBe(200);
    expect(page2.json.logs).toHaveLength(2);

    const ids1 = new Set(page1.json.logs.map((l: any) => l.id));
    const ids2 = new Set(page2.json.logs.map((l: any) => l.id));
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }
  });

  it("GET /logs invalid params => 400 with {error: string}", async () => {
    const cases = [
      buildQuery("/logs", { since: "not-a-time" }),
      buildQuery("/logs", { since: times.T_B, until: times.T_A }),
      buildQuery("/logs", { level: "critical" }),
      buildQuery("/logs", { limit: "abc" as any }),
      buildQuery("/logs", { limit: 0 }),
      buildQuery("/logs", { limit: 1001 }),
      buildQuery("/logs", { cursor: "***" }),
    ];

    for (const path of cases) {
      const r = await http("GET", path);
      expect(r.status).toBe(400);
      expect(r.json).not.toBeNull();
      expect(typeof r.json.error).toBe("string");
      expect(r.json.error.length).toBeGreaterThan(0);
    }
  });

  it("GET /logs/aggregate works; ordered by bucket start asc; group null when not provided", async () => {
    const r = await http(
      "GET",
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: times.UNTIL,
        bucket: "1m",
        service: SVC,
      }),
    );

    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.buckets)).toBe(true);

    for (const b of r.json.buckets) {
      expect(typeof b.start).toBe("string");
      expect(b.group).toBeNull();
      expect(typeof b.count).toBe("number");
    }

    const starts = r.json.buckets.map((b: any) => b.start);
    for (let i = 0; i < starts.length - 1; i++) {
      expect(starts[i] <= starts[i + 1]).toBe(true);
    }
  });

  it("GET /logs/aggregate group_by=service includes both services", async () => {
    const r = await http(
      "GET",
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: times.UNTIL,
        bucket: "1m",
        group_by: "service",
      }),
    );

    expect(r.status).toBe(200);
    const groups = new Set(r.json.buckets.map((b: any) => b.group));
    expect(groups.has(SVC)).toBe(true);
    expect(groups.has(SVC2)).toBe(true);
  });

  it("GET /logs/aggregate group_by=level returns valid levels", async () => {
    const r = await http(
      "GET",
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: times.UNTIL,
        bucket: "1m",
        service: SVC,
        group_by: "level",
      }),
    );

    expect(r.status).toBe(200);
    const allowed = new Set(["debug", "info", "warn", "error"]);
    for (const b of r.json.buckets) {
      expect(allowed.has(b.group)).toBe(true);
    }
  });

  it("GET /logs/aggregate supports filters (q, attr.<key>)", async () => {
    {
      const r = await http(
        "GET",
        buildQuery("/logs/aggregate", {
          since: times.SINCE,
          until: times.UNTIL,
          bucket: "1m",
          service: SVC,
          q: "declined",
        }),
      );
      expect(r.status).toBe(200);
      expect(Array.isArray(r.json.buckets)).toBe(true);
      expect(r.json.buckets.length).toBeGreaterThanOrEqual(1);
    }

    {
      const r = await http(
        "GET",
        `${buildQuery("/logs/aggregate", {
          since: times.SINCE,
          until: times.UNTIL,
          bucket: "1m",
          service: SVC,
        })}&attr.user_id=42`,
      );
      console.log("status:", r.status);
      console.log("body:", JSON.stringify(r.json, null, 2));
      expect(r.status).toBe(200);
      expect(Array.isArray(r.json.buckets)).toBe(true);
      expect(r.json.buckets.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("GET /logs/aggregate invalid params => 400 with {error: string}", async () => {
    const cases = [
      buildQuery("/logs/aggregate", { until: times.UNTIL, bucket: "1m" }), // missing since
      buildQuery("/logs/aggregate", { since: times.SINCE, bucket: "1m" }), // missing until
      buildQuery("/logs/aggregate", { since: times.SINCE, until: times.UNTIL }), // missing bucket
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: times.UNTIL,
        bucket: "2m",
      }), // bad bucket
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: times.UNTIL,
        bucket: "1m",
        group_by: "nope",
      }),
      buildQuery("/logs/aggregate", {
        since: "bad",
        until: times.UNTIL,
        bucket: "1m",
      }),
      buildQuery("/logs/aggregate", {
        since: times.SINCE,
        until: "bad",
        bucket: "1m",
      }),
    ];

    for (const path of cases) {
      const r = await http("GET", path);
      expect(r.status).toBe(400);
      expect(r.json).not.toBeNull();
      expect(typeof r.json.error).toBe("string");
      expect(r.json.error.length).toBeGreaterThan(0);
    }
  });

  it("POST /logs mixed batch: partial accept; rejected entries include index + reason", async () => {
    const future = new Date(Date.now() + 7 * 60_000).toISOString(); // > 5 minutes in future

    const payload = {
      logs: [
        {
          timestamp: times.T_A,
          level: "critical", // invalid
          service: SVC,
          message: "bad level",
        },
        {
          timestamp: times.T_A,
          level: "info",
          service: SVC,
          message: "this one is valid",
          attributes: { ok: true },
        },
        {
          timestamp: times.T_A,
          level: "info",
          service: SVC,
          message: "nested attrs not allowed",
          attributes: { nested: { a: 1 } }, // invalid (nested object)
        },
        {
          timestamp: future, // invalid (too far future)
          level: "info",
          service: SVC,
          message: "too far in future",
        },
      ],
    };

    const r = await http("POST", "/logs", {
      body: JSON.stringify(payload),
    });

    expect(r.status).toBe(200);
    expect(r.json.accepted).toBe(1);
    expect(Array.isArray(r.json.rejected)).toBe(true);
    expect(r.json.rejected).toHaveLength(3);

    const rejectedIdx = r.json.rejected.map((x: any) => x.index).sort();
    expect(rejectedIdx).toEqual([0, 2, 3]);

    for (const rej of r.json.rejected) {
      expect(typeof rej.reason).toBe("string");
      expect(rej.reason.length).toBeGreaterThan(0);
    }
  });

  it("POST /logs all invalid => 400", async () => {
    const payload = {
      logs: [
        { timestamp: "bad", level: "info", service: "x", message: "bad ts" },
        {
          timestamp: times.T_A,
          level: "nope",
          service: "x",
          message: "bad level",
        },
      ],
    };

    const r = await http("POST", "/logs", {
      body: JSON.stringify(payload),
    });

    expect(r.status).toBe(400);
    if (r.json) {
      expect(Array.isArray(r.json.rejected)).toBe(true);
    }
  });

  it("POST /logs malformed JSON => 400", async () => {
    const r = await http("POST", "/logs", {
      body: `{"logs":[{"timestamp":"${times.T_A}"}]`, // missing closing braces
    });
    expect(r.status).toBe(400);
  });

  it("POST /logs wrong top-level structure => 400", async () => {
    const r = await http("POST", "/logs", {
      body: JSON.stringify({ no_logs_here: [] }),
    });
    expect(r.status).toBe(400);
  });
});
