import { setTimeout as delay } from "node:timers/promises";

export const BASE_URL = "http://localhost:8080";

export type HttpResult = {
  status: number;
  headers: Headers;
  json: any | null;
};

export async function http(
  method: "GET" | "POST",
  path: string,
  opts?: { headers?: Record<string, string>; body?: string },
): Promise<HttpResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(opts?.headers ?? {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? (opts?.body ?? "") : undefined,
  });

  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  let json: any | null = null;

  if (ct.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { status: res.status, headers: res.headers, json };
}

export async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const r = await http("GET", "/health");
    if (r.status === 200) return;
    if (Date.now() > deadline) {
      throw new Error(
        `/health did not become ready within ${timeoutMs}ms (last=${r.status})`,
      );
    }
    await delay(1000);
  }
}

export function iso(dt: Date): string {
  return dt.toISOString();
}

export function makeTimes() {
  // aligned to minute so aggregation buckets are stable
  const now = new Date();
  const since = new Date(now.getTime() - 4 * 60_000);
  since.setUTCSeconds(0, 0);

  const until = new Date(since.getTime() + 10 * 60_000);

  const tA = new Date(since.getTime() + 1 * 60_000 + 10_000);
  const tB = new Date(since.getTime() + 2 * 60_000 + 20_000);
  const tC = new Date(since.getTime() + 3 * 60_000 + 30_000);
  const tSame = new Date(tC.getTime()); // same timestamp on purpose

  return {
    SINCE: iso(since),
    UNTIL: iso(until),
    T_A: iso(tA),
    T_B: iso(tB),
    T_C: iso(tC),
    T_SAME: iso(tSame),
  };
}

export async function eventually<T>(
  fn: () => Promise<T>,
  predicate: (t: T) => boolean,
  timeoutMs = 20_000,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;

  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await delay(intervalMs);
  }
  return last as T;
}

export function buildQuery(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const u = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    u.searchParams.set(k, String(v));
  }
  return u.pathname + (u.search ? u.search : "");
}
