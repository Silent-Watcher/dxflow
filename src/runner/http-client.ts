import type { JsonValue } from "../types.js";

export interface HttpRequestInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: JsonValue | undefined;
  timeoutMs: number;
}

export interface HttpResponseOutput {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: JsonValue | string | undefined;
  isJson: boolean;
}

export interface TimedHttpResult {
  response: HttpResponseOutput;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

/**
 * Performs an HTTP request via the native fetch API, measuring wall-clock
 * timing and normalizing the response body (parsed as JSON when possible,
 * otherwise returned as text).
 */
export async function sendHttpRequest(input: HttpRequestInput): Promise<TimedHttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  const startedAt = Date.now();
  try {
    const fetchResponse = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body === undefined ? undefined : serializeBody(input.body, input.headers),
      signal: controller.signal,
    });

    const responseHeaders: Record<string, string> = {};
    fetchResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const rawText = await fetchResponse.text();
    const { body, isJson } = parseResponseBody(rawText, responseHeaders);

    const endedAt = Date.now();
    return {
      response: {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body,
        isJson,
      },
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
    };
  } catch (error) {
    const endedAt = Date.now();
    if (controller.signal.aborted) {
      throw new HttpTimeoutError(
        `Request to "${input.url}" timed out after ${input.timeoutMs}ms`,
        endedAt - startedAt,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class HttpTimeoutError extends Error {
  constructor(
    message: string,
    public readonly elapsedMs: number,
  ) {
    super(message);
    this.name = "HttpTimeoutError";
  }
}

function serializeBody(body: JsonValue, headers: Record<string, string>): string {
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
  if (!hasContentType) {
    headers["Content-Type"] = "application/json";
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

function parseResponseBody(
  rawText: string,
  headers: Record<string, string>,
): { body: JsonValue | string | undefined; isJson: boolean } {
  if (rawText.length === 0) {
    return { body: undefined, isJson: false };
  }

  const contentType = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type",
  )?.[1];
  const looksLikeJson = contentType?.includes("application/json") ?? false;

  try {
    const parsed = JSON.parse(rawText) as JsonValue;
    return { body: parsed, isJson: true };
  } catch {
    if (looksLikeJson) {
      // Server claimed JSON but body didn't parse; surface as text rather than failing the step.
      return { body: rawText, isJson: false };
    }
    return { body: rawText, isJson: false };
  }
}
