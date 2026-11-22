import { APP_NAME } from "@/server/config/env";
import { probeImageEngine } from "@/server/services/sharpRuntime";
import { jsonOk, route } from "@/server/http/handler";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { HealthStatus } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health — real dependency probes, not a static string.
 *
 * Returns 503 when the database (a critical dependency) is unreachable, and
 * never exposes connection strings, hostnames or raw driver errors.
 */
export const GET = route(async (_req, ctx) => {
  const started = Date.now();
  let connected = true;
  try {
    await db.execute(sql`select 1`);
  } catch (dbError) {
    connected = false;
    // Log the class of failure server-side only; the response stays generic.
    console.error(
      `[health] database probe failed: ${dbError instanceof Error ? dbError.name : "unknown error"}`,
    );
  }

  // Probing the engine loads it once per runtime instance (cached). A failure
  // here is reported as a degraded dependency, not a 500.
  const engine = await probeImageEngine();

  const ready = connected && engine.available;
  const body: HealthStatus & { degraded?: string } = {
    ok: ready,
    service: APP_NAME,
    version: process.env.npm_package_version ?? "1.0.0",
    database: {
      connected,
      latencyMs: connected ? Date.now() - started : null,
      error: connected ? undefined : "Database unreachable",
    },
    sharp: { available: engine.available, versions: engine.detail ?? undefined },
    degraded: ready
      ? undefined
      : !connected
        ? "database unreachable"
        : `image engine unavailable: ${engine.detail ?? "unknown"}`, 
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  return jsonOk(body, ctx, { status: ready ? 200 : 503 });
});
