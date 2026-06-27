import { z } from "zod";

/**
 * Schema for a single declared expectation/assertion on a step's response.
 * Kept intentionally small: status code and optional JSON-path-lite body checks.
 */
export const expectSchema = z.object({
  status: z
    .union([z.number(), z.array(z.number())])
    .optional()
    .describe("Expected HTTP status code, or one of several acceptable codes."),
  bodyContains: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Shallow key/value pairs that must be present in the JSON response body."),
});

export type ExpectConfig = z.infer<typeof expectSchema>;

/**
 * A transform reference, in the form "relative/path/to/file.ts#exportName".
 * Resolved relative to the manifest file's directory.
 */
export const transformRefSchema = z
  .string()
  .min(1)
  .refine((value) => value.includes("#"), {
    message: "transform must be in the form 'path/to/file.ts#exportName'",
  });

export const stepSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message:
        "step id must start with a letter or underscore and contain only letters, numbers, and underscores",
    }),
  name: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  /** Path to a JS/TS module + export, for steps needing custom request-building logic. */
  transform: transformRefSchema.optional(),
  /** Milliseconds to wait before sending this step's request. */
  delayMs: z.number().nonnegative().optional(),
  /** Request timeout in milliseconds. Defaults to 30000 if unset. */
  timeoutMs: z.number().positive().optional(),
  expect: expectSchema.optional(),
  /** If true, a failed expectation or request error does not abort the scenario. */
  continueOnFailure: z.boolean().optional(),
});

export type StepConfig = z.infer<typeof stepSchema>;

export const manifestSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url().optional(),
  /** Static variables available to all steps via {{vars.x}} templates. */
  vars: z.record(z.string(), z.unknown()).optional(),
  /** Default headers merged into every step (step-level headers take precedence). */
  defaultHeaders: z.record(z.string(), z.string()).optional(),
  steps: z.array(stepSchema).min(1),
});

export type ManifestConfig = z.infer<typeof manifestSchema>;

/**
 * Validates step ids are unique within a manifest, since later steps reference
 * earlier ones by id via templates.
 */
export function assertUniqueStepIds(manifest: ManifestConfig): void {
  const seen = new Set<string>();
  for (const step of manifest.steps) {
    if (seen.has(step.id)) {
      throw new Error(`Duplicate step id "${step.id}" found in manifest "${manifest.name}"`);
    }
    seen.add(step.id);
  }
}
