/**
 * Guarded, lazy access to the native image engine.
 *
 * Why this exists: a static `import sharp from "sharp"` that fails to resolve its
 * native binary throws at *module initialisation*. In that case the framework
 * never reaches the route handler or the central error mapper, so the client
 * receives a bare `text/plain` 500 ("Internal Server Error") which any JSON
 * client rightly reports as an unreadable response.
 *
 * Loading the engine through a dynamic import lets us catch that failure and
 * return the normal JSON error envelope with a request id and a recovery hint.
 */
import { ApiError } from "@/server/http/errors";

type SharpFactory = typeof import("sharp").default;

let cached: SharpFactory | null = null;
let failureReason: string | null = null;
let attempted = false;
let inFlight: Promise<SharpFactory> | null = null;

/**
 * Reduces a native loader failure to a short, non-sensitive category.
 * Never returns filesystem paths, module paths or stack traces.
 */
function categorize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot find module|module not found/i.test(message)) return "native binary not packaged for this runtime";
  if (/invalid elf|wrong elf|not a valid win32|libvips/i.test(message)) return "native binary incompatible with this platform";
  if (/eacces|permission denied/i.test(message)) return "native binary not readable";
  return "image engine failed to initialise";
}

export function imageEngineUnavailable(reason: string): ApiError {
  return new ApiError(503, "image_engine_unavailable", "The image engine is unavailable on this server.", {
    hint: `Image processing cannot run right now (${reason}). Non-image tools still work. Report this with the request id if it persists.`,
  });
}

export async function getSharp(): Promise<SharpFactory> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    attempted = true;
    try {
      const mod = await import("sharp");
      const factory = ((mod as { default?: SharpFactory }).default ?? mod) as SharpFactory;
      // Bound CPU and memory once per runtime instance.
      factory.cache(false);
      factory.concurrency(1);
      cached = factory;
      failureReason = null;
      return factory;
    } catch (error) {
      failureReason = categorize(error);
      console.error(`[image-engine] unavailable: ${failureReason}`);
      throw imageEngineUnavailable(failureReason);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Synchronous status for health reporting; does not trigger a load. */
export function imageEngineStatus(): { available: boolean; state: "unloaded" | "ready" | "failed"; reason: string | null } {
  if (cached) return { available: true, state: "ready", reason: null };
  if (attempted && failureReason) return { available: false, state: "failed", reason: failureReason };
  return { available: false, state: "unloaded", reason: null };
}

/** Used by readiness checks: force a load attempt and report the outcome. */
export async function probeImageEngine(): Promise<{ available: boolean; detail: string | null }> {
  try {
    const factory = await getSharp();
    const versions = factory.versions;
    return { available: true, detail: `sharp ${versions.sharp} (libvips ${versions.vips})` };
  } catch {
    return { available: false, detail: failureReason };
  }
}
