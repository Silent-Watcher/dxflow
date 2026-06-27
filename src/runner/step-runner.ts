import type { StepConfig } from "../manifest/schema.js";
import type { JsonValue, RunContext, StepContextEntry, StepResult } from "../types.js";
import { evaluateExpectations } from "./expectations.js";
import { sendHttpRequest } from "./http-client.js";
import { buildUrl } from "./url.js";
import { resolveStringRecord, resolveTemplatesDeep } from "../template/resolve.js";
import type { TransformFn } from "../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface StepRunOutcome {
  result: StepResult;
  /** The context entry to merge in, present whenever a response was received (even non-2xx). */
  contextEntry: StepContextEntry | undefined;
}

/**
 * Runs a single step: resolves templated headers/body/query/path against the
 * current context, applies an optional transform override, sends the HTTP
 * request, times it, and evaluates any declared expectations.
 */
export async function runStep(
  step: StepConfig,
  context: Readonly<RunContext>,
  baseUrl: string | undefined,
  defaultHeaders: Record<string, string> | undefined,
  loadStepTransform: ((ref: string) => Promise<TransformFn>) | undefined,
): Promise<StepRunOutcome> {
  const startedAt = Date.now();

  try {
    const resolvedHeaders = {
      ...resolveStringRecord(defaultHeaders, context),
      ...resolveStringRecord(step.headers, context),
    };
    const resolvedQuery = resolveStringRecord(step.query, context);
    const resolvedPath = resolveTemplatesDeep(step.path, context) as string;
    const resolvedBody = resolveTemplatesDeep((step.body as JsonValue) ?? undefined, context);

    let finalMethod = step.method;
    let finalPath = resolvedPath;
    let finalHeaders = resolvedHeaders;
    let finalQuery = resolvedQuery;
    let finalBody = resolvedBody;

    if (step.transform) {
      if (!loadStepTransform) {
        throw new Error(
          `Step "${step.id}" declares a transform but no transform loader was provided`,
        );
      }
      const transformFn = await loadStepTransform(step.transform);
      const override = await transformFn(context);
      finalMethod = override.method ?? finalMethod;
      finalPath = override.path ?? finalPath;
      finalHeaders = { ...finalHeaders, ...(override.headers ?? {}) };
      finalQuery = { ...finalQuery, ...(override.query ?? {}) };
      finalBody = override.body ?? finalBody;
    }

    const url = buildUrl(baseUrl, finalPath, finalQuery);

    const timedResult = await sendHttpRequest({
      method: finalMethod,
      url,
      headers: finalHeaders,
      body: finalBody,
      timeoutMs: step.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    const expectations = evaluateExpectations(step.expect, timedResult.response);
    const allExpectationsPassed = expectations.every((expectation) => expectation.passed);

    const contextEntry: StepContextEntry = {
      id: step.id,
      request: { method: finalMethod, url, headers: finalHeaders, body: finalBody },
      response: timedResult.response,
      timing: {
        startedAt: timedResult.startedAt,
        endedAt: timedResult.endedAt,
        durationMs: timedResult.durationMs,
      },
    };

    return {
      contextEntry,
      result: {
        id: step.id,
        name: step.name,
        success: allExpectationsPassed,
        error: undefined,
        request: contextEntry.request,
        response: contextEntry.response,
        timing: contextEntry.timing,
        expectations,
      },
    };
  } catch (error) {
    const endedAt = Date.now();
    const message = error instanceof Error ? error.message : String(error);

    return {
      contextEntry: undefined,
      result: {
        id: step.id,
        name: step.name,
        success: false,
        error: message,
        request: {
          method: step.method,
          url: step.path,
          headers: step.headers ?? {},
          body: (step.body as JsonValue) ?? undefined,
        },
        response: undefined,
        timing: { startedAt, endedAt, durationMs: endedAt - startedAt },
        expectations: [],
      },
    };
  }
}
