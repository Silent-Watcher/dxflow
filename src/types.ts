/**
 * Core domain types shared across the manifest, runner, and report modules.
 */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/** A loose JSON-like value, used for request bodies, query params, etc. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Result of one prior step, exposed to templates and transform functions
 * for later steps to read from.
 */
export interface StepContextEntry {
  id: string;
  request: {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    body: JsonValue | undefined;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    /** Parsed JSON body if the response was JSON, otherwise raw text. */
    body: JsonValue | string | undefined;
    /** True if the body was successfully parsed as JSON. */
    isJson: boolean;
  };
  timing: {
    startedAt: number;
    endedAt: number;
    durationMs: number;
  };
}

/**
 * Flattened view of a step's result, as exposed under `context.steps.<id>`
 * for template expressions and transform functions. Flattened (rather than
 * nested under `.response.`) so templates can write the shorter
 * `{{steps.createUser.body.id}}` instead of `{{steps.createUser.response.body.id}}`.
 */
export interface TemplateStepView {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: JsonValue | string | undefined;
  isJson: boolean;
  requestBody: JsonValue | undefined;
  durationMs: number;
}

/** Builds the flattened template view from a full step context entry. */
export function toTemplateStepView(entry: StepContextEntry): TemplateStepView {
  return {
    id: entry.id,
    status: entry.response.status,
    statusText: entry.response.statusText,
    headers: entry.response.headers,
    body: entry.response.body,
    isJson: entry.response.isJson,
    requestBody: entry.request.body,
    durationMs: entry.timing.durationMs,
  };
}

/** The accumulated context available to step N, containing results of steps 1..N-1. */
export interface RunContext {
  scenarioName: string;
  baseUrl: string | undefined;
  /** Keyed by step id. Flattened view — see TemplateStepView. */
  steps: Record<string, TemplateStepView>;
  /** Arbitrary variables declared at the manifest level (static, resolved once). */
  vars: Record<string, JsonValue>;
}


/**
 * The shape a transform function override can return. Any field omitted is
 * left as resolved from the manifest's templated values.
 */
export interface TransformOverride {
  method?: HttpMethod;
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: JsonValue;
}

/** Signature every custom transform module must export. */
export type TransformFn = (
  ctx: Readonly<RunContext>,
) => TransformOverride | Promise<TransformOverride>;

/** Outcome of executing a single step. */
export interface StepResult {
  id: string;
  name: string | undefined;
  success: boolean;
  /** Present when an error occurred (network failure, transform error, etc). */
  error: string | undefined;
  request: StepContextEntry["request"];
  response: StepContextEntry["response"] | undefined;
  timing: StepContextEntry["timing"];
  /** Validation outcomes for this step's `expect` block, if any were declared. */
  expectations: ExpectationResult[];
}

export interface ExpectationResult {
  description: string;
  passed: boolean;
  details: string | undefined;
}

/** Final report produced after running a full scenario. */
export interface ScenarioReport {
  scenarioName: string;
  manifestPath: string;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  success: boolean;
  steps: StepResult[];
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    averageDurationMs: number;
    slowestStep: { id: string; durationMs: number } | undefined;
    fastestStep: { id: string; durationMs: number } | undefined;
  };
}
