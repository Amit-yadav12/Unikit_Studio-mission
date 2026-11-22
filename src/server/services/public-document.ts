/** Bounded public-document transport shared with the upstream Unikit auditor. */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import { limits } from "@/server/config/env";
import { unprocessable, badRequest } from "@/server/http/errors";
import {
  assertPublicHostname,
  assertPublicIp,
  parseHttpUrl,
} from "@/server/security/ssrf";
const UA =
  "UnikitStudio-Audit/2.0 (static page audit; fetches the HTML document and the assets it names)";

type PublicFetchResult = {
  status: number;
  contentType: string | null;
  body: Buffer;
  finalUrl: string;
  location?: string;
};

/**
 * Resolve again at the actual socket-creation boundary and pin the connection to
 * a validated public address. This narrows DNS-rebinding risk versus validating
 * DNS and then letting fetch resolve the hostname a second time.
 */
const pinnedPublicLookup: NonNullable<http.RequestOptions["lookup"]> = (
  hostname,
  options,
  callback,
) => {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  if (isIP(normalized)) {
    try {
      assertPublicIp(normalized);
      const address = { address: normalized, family: isIP(normalized) };
      if ("all" in options && options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    } catch {
      callback(
        Object.assign(
          new Error("Private network addresses cannot be audited."),
          { code: "EACCES" },
        ),
        "",
        0,
      );
    }
    return;
  }

  void lookup(normalized, { all: true, verbatim: true })
    .then((records) => {
      if (records.length === 0)
        throw new Error("No DNS records were returned.");
      // Reject mixed public/private answers rather than selecting the public one
      // and accidentally permitting an ambiguous or rebinding DNS response.
      records.forEach((record) => assertPublicIp(record.address));
      if ("all" in options && options.all) callback(null, records);
      else callback(null, records[0].address, records[0].family);
    })
    .catch(() => {
      callback(
        Object.assign(new Error("Public DNS resolution failed."), {
          code: "ENOTFOUND",
        }),
        "",
        0,
      );
    });
};

async function withinDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("AUDIT_TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AUDIT_TIMEOUT")), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requestPublicOnce(
  url: URL,
  maxBytes: number,
  timeoutMs: number,
): Promise<PublicFetchResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const resolveOnce = (value: PublicFetchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const rejectOnce = (reason: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(reason);
    };

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const requestOptions: http.RequestOptions = {
      hostname,
      port: url.port ? Number(url.port) : undefined,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      headers: { accept: "*/*", "user-agent": UA, host: url.host },
      lookup: pinnedPublicLookup,
      agent: false,
      maxHeaderSize: 16 * 1024,
    };

    const onResponse = (response: http.IncomingMessage) => {
      const status = response.statusCode ?? 0;
      const rawType = response.headers["content-type"];
      const contentType = typeof rawType === "string" ? rawType : null;
      const rawLocation = response.headers.location;
      const location =
        typeof rawLocation === "string"
          ? rawLocation
          : Array.isArray(rawLocation)
            ? rawLocation[0]
            : undefined;

      if (status >= 300 && status < 400) {
        response.destroy();
        resolveOnce({
          status,
          contentType,
          body: Buffer.alloc(0),
          finalUrl: url.href,
          location,
        });
        return;
      }

      const rawLength = response.headers["content-length"];
      const declared = typeof rawLength === "string" ? Number(rawLength) : NaN;
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.destroy();
        request.destroy(new Error("AUDIT_SIZE_LIMIT"));
        rejectOnce(new Error("AUDIT_SIZE_LIMIT"));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > maxBytes) {
          response.destroy();
          request.destroy(new Error("AUDIT_SIZE_LIMIT"));
          rejectOnce(new Error("AUDIT_SIZE_LIMIT"));
          return;
        }
        chunks.push(bytes);
      });
      response.on("end", () =>
        resolveOnce({
          status,
          contentType,
          body: Buffer.concat(chunks, size),
          finalUrl: url.href,
          location,
        }),
      );
      response.on("error", (error) =>
        rejectOnce(timedOut ? new Error("AUDIT_TIMEOUT") : error),
      );
    };

    const request =
      url.protocol === "https:"
        ? https.request(requestOptions, onResponse)
        : http.request(requestOptions, onResponse);

    const timer = setTimeout(
      () => {
        timedOut = true;
        request.destroy(new Error("AUDIT_TIMEOUT"));
      },
      Math.max(1, timeoutMs),
    );
    request.on("error", (error) =>
      rejectOnce(timedOut ? new Error("AUDIT_TIMEOUT") : error),
    );
    request.end();
  });
}

export async function fetchPublic(
  url: URL,
  maxBytes: number,
  deadline: number = Date.now() + limits.auditTimeoutMs,
  reserveMs = 0,
): Promise<{
  status: number;
  contentType: string | null;
  body: Buffer;
  finalUrl: string;
}> {
  let current = url;
  for (let hop = 0; hop <= 3; hop += 1) {
    const remainingMs = deadline - Date.now() - reserveMs;
    if (remainingMs <= 100)
      throw unprocessable(
        "The audit reached its overall time budget.",
        "Reduce the audit scope or retry with fewer resources.",
      );
    try {
      await withinDeadline(
        assertPublicHostname(current.hostname),
        deadline - reserveMs,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "AUDIT_TIMEOUT") {
        throw unprocessable(
          "The website audit reached its overall time budget while resolving DNS.",
          "Retry the audit or reduce its scope.",
        );
      }
      throw error;
    }
    let response: PublicFetchResult;
    try {
      response = await requestPublicOnce(
        current,
        maxBytes,
        Math.min(limits.auditTimeoutMs, remainingMs),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "AUDIT_SIZE_LIMIT") {
        throw unprocessable(
          `The response is larger than the ${(maxBytes / 1024).toFixed(0)} KB audit limit.`,
        );
      }
      if (message === "AUDIT_TIMEOUT") {
        throw unprocessable(
          "The remote host exceeded the audit time budget.",
          "Try a faster public page or reduce the audit scope.",
        );
      }
      throw unprocessable(
        "The remote host could not be reached.",
        "Check the public URL and try again.",
      );
    }

    if (response.status >= 300 && response.status < 400) {
      if (!response.location)
        throw unprocessable(
          "The remote host returned a redirect without a Location header.",
        );
      current = parseHttpUrl(new URL(response.location, current).href);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw badRequest("Redirected to a non-http URL.");
      }
      continue;
    }

    return {
      status: response.status,
      contentType: response.contentType,
      body: response.body,
      finalUrl: current.href,
    };
  }
  throw unprocessable("Too many redirects.");
}
