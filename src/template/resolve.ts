import type { JsonValue, RunContext } from "../types.js";

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export class TemplateResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateResolutionError";
  }
}

/**
 * Resolves a single `{{ path.to.value }}` expression against the run context.
 * Supports dot-notation and numeric array indices, e.g.
 * `steps.createUser.body.items.0.id` or `vars.apiKey`.
 */
export function resolvePath(expression: string, context: Readonly<RunContext>): unknown {
  const segments = expression
    .trim()
    .split(".")
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new TemplateResolutionError(`Empty template expression: "${expression}"`);
  }

  let current: unknown = context;
  const visited: string[] = [];

  for (const segment of segments) {
    visited.push(segment);
    if (current === null || current === undefined) {
      throw new TemplateResolutionError(
        `Cannot resolve "${expression}": "${visited.join(".")}" is ${String(current)}`,
      );
    }
    if (typeof current !== "object") {
      throw new TemplateResolutionError(
        `Cannot resolve "${expression}": "${visited.slice(0, -1).join(".")}" is not an object`,
      );
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined) {
    throw new TemplateResolutionError(
      `Template "${expression}" resolved to undefined. Check the step id and response shape.`,
    );
  }

  return current;
}

/**
 * Resolves all `{{...}}` occurrences within a string. If the entire string is
 * a single template expression (e.g. "{{steps.a.body.id}}"), the resolved
 * value's native type is preserved (number stays number, object stays object).
 * Otherwise, resolved values are stringified and interpolated inline.
 */
export function resolveTemplateString(input: string, context: Readonly<RunContext>): unknown {
  const matches = [...input.matchAll(TEMPLATE_PATTERN)];
  if (matches.length === 0) {
    return input;
  }

  const isExactSingleMatch =
    matches.length === 1 && matches[0] !== undefined && matches[0][0] === input.trim();

  if (isExactSingleMatch) {
    const expression = matches[0]?.[1];
    if (expression === undefined) {
      throw new TemplateResolutionError(`Malformed template expression in: "${input}"`);
    }
    return resolvePath(expression, context);
  }

  return input.replace(TEMPLATE_PATTERN, (_full, expression: string) => {
    const value = resolvePath(expression, context);
    return stringifyForInterpolation(value);
  });
}

function stringifyForInterpolation(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

/**
 * Recursively walks a JSON-like structure, resolving any `{{...}}` template
 * strings found in string values. Non-string values (numbers, booleans,
 * nested objects/arrays) are walked but otherwise left untouched.
 */
export function resolveTemplatesDeep(
  value: JsonValue | undefined,
  context: Readonly<RunContext>,
): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return resolveTemplateString(value, context) as JsonValue;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplatesDeep(item, context) as JsonValue);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = resolveTemplatesDeep(nested, context) as JsonValue;
    }
    return result;
  }
  return value;
}

/** Convenience helper specifically for resolving a flat string-to-string record (headers, query). */
export function resolveStringRecord(
  record: Record<string, string> | undefined,
  context: Readonly<RunContext>,
): Record<string, string> {
  if (!record) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const resolved = resolveTemplateString(value, context);
    result[key] = stringifyForInterpolation(resolved);
  }
  return result;
}
