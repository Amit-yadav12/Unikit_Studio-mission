/** Typed browser client for the /api/v1 contract. Unwraps the response envelope. */

export class ApiClientError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly status: number;
  /** Request id echoed by the API or by the hosting edge, when available. */
  readonly requestId?: string;

  constructor(message: string, options: { code: string; hint?: string; status: number; requestId?: string }) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.hint = options.hint;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

/**
 * Turns a non-JSON platform response (HTML/text 5xx from a proxy, edge, or a
 * function that crashed before reaching our error mapper) into an actionable
 * message instead of "unreadable response".
 */
function platformErrorMessage(status: number, contentType: string, requestId?: string): ApiClientError {
  const suffix = requestId ? ` Reference ${requestId}.` : "";
  if (status === 413) {
    return new ApiClientError("The upload was rejected: it exceeds the server's request-size limit.", {
      code: "payload_too_large",
      hint: "Send fewer or smaller images in one batch, then retry." + suffix,
      status,
      requestId,
    });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ApiClientError(`The API is temporarily unavailable (HTTP ${status}).`, {
      code: "service_unavailable",
      hint: "This is usually a cold start or a degraded dependency. Retry in a few seconds." + suffix,
      status,
      requestId,
    });
  }
  if (status >= 500) {
    return new ApiClientError(`The server failed while handling this request (HTTP ${status}).`, {
      code: "server_error",
      hint:
        `An unexpected error occurred${contentType ? ` (${contentType.split(";")[0]})` : ""}. ` +
        "Your files are still queued — retry, and include the reference if it happens again." +
        suffix,
      status,
      requestId,
    });
  }
  if (status === 401 || status === 403) {
    return new ApiClientError(`Access denied (HTTP ${status}).`, {
      code: "forbidden",
      hint: "Your session may have expired. Reload the page and try again." + suffix,
      status,
      requestId,
    });
  }
  if (status === 404) {
    return new ApiClientError("That endpoint or result could not be found (HTTP 404).", {
      code: "not_found",
      hint: "It may have expired or belong to another session." + suffix,
      status,
      requestId,
    });
  }
  return new ApiClientError(`The request failed (HTTP ${status}).`, {
    code: "bad_response",
    hint: `The server returned a non-JSON response${contentType ? ` (${contentType.split(";")[0]})` : ""}.` + suffix,
    status,
    requestId,
  });
}

type FailureBody = {
  ok: false;
  error: { code: string; message: string; hint?: string; details?: unknown };
};

export type RequestOptions = {
  signal?: AbortSignal;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers:
        init.body instanceof FormData
          ? init.headers
          : { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (error) {
    if (isAbortError(error) || init.signal?.aborted) {
      throw new ApiClientError("The request was cancelled.", {
        code: "cancelled",
        status: 0,
      });
    }
    throw new ApiClientError("The network request could not be completed.", {
      code: "network_error",
      hint: "Check your connection and try again.",
      status: 0,
    });
  }

  // Edge/proxy request ids help support correlate a failure with server logs.
  const edgeRequestId =
    response.headers.get("x-nf-request-id") ??
    response.headers.get("x-vercel-id") ??
    response.headers.get("x-request-id") ??
    undefined;

  const text = await response.text();
  const isJson = (response.headers.get("content-type") ?? "").toLowerCase().includes("json");

  let parsed: unknown = null;
  if (text && isJson) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (parsed === null) {
    // Empty body on success is still a failure for this contract (it always
    // returns an envelope), but report it precisely.
    if (response.ok && !text) {
      throw new ApiClientError("The server returned an empty response.", {
        code: "empty_response",
        hint: "Nothing was saved. Retry the request." + (edgeRequestId ? ` Reference ${edgeRequestId}.` : ""),
        status: response.status,
        requestId: edgeRequestId,
      });
    }
    throw platformErrorMessage(response.status, response.headers.get("content-type") ?? "", edgeRequestId);
  }

  if (!response.ok || (parsed as FailureBody | null)?.ok === false) {
    const failure = parsed as { ok: false; error?: { code: string; message: string; hint?: string }; meta?: { requestId?: string } };
    const requestId = failure.meta?.requestId ?? edgeRequestId;
    throw new ApiClientError(failure.error?.message ?? `The request failed (HTTP ${response.status}).`, {
      code: failure.error?.code ?? "unknown_error",
      hint: failure.error?.hint,
      status: response.status,
      requestId,
    });
  }

  return (parsed as { data: T }).data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: "GET", signal: options?.signal }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "POST",
      signal: options?.signal,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: "PUT", signal: options?.signal, body: JSON.stringify(body) }),
  del: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: "DELETE", signal: options?.signal }),
};

/**
 * URL of a stored artifact.
 * `download` → served as an attachment; otherwise → served inline so it can be
 * used as an <img> preview.
 */
export function artifactUrl(id: string, download = true): string {
  return `/api/v1/artifacts/${id}${download ? "?download=1" : "?inline=1"}`;
}

/** Triggers a browser download for the selected artifacts as one ZIP. */
export async function downloadZip(ids: string[], name = "unikit-results", signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/v1/artifacts/zip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids, name }),
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    let message = "The bundle could not be created.";
    try {
      const body = (await response.json()) as FailureBody;
      message = body.error.message;
    } catch {
      /* keep default */
    }
    throw new ApiClientError(message, { code: "zip_failed", status: response.status });
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  triggerDownload(URL.createObjectURL(blob), match?.[1] ?? `${name}.zip`);
}

export function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click is synchronous for blob: URLs; releasing on the next turn is safe
  // and prevents the object URL from leaking for the life of the tab.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
