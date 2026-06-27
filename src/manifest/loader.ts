import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { assertUniqueStepIds, manifestSchema, type ManifestConfig } from "./schema.js";

export class ManifestLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ManifestLoadError";
  }
}

/**
 * Reads a manifest file from `filePath`, parsing it as YAML or JSON based on
 * its extension (.yaml/.yml -> YAML, .json -> JSON), then validates it
 * against the manifest schema.
 */
export async function loadManifest(filePath: string): Promise<ManifestConfig> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    throw new ManifestLoadError(`Could not read manifest file at "${filePath}"`, error);
  }

  const parsed = parseManifestSource(raw, filePath);

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ManifestLoadError(`Invalid manifest "${filePath}":\n${issues}`);
  }

  assertUniqueStepIds(result.data);

  return result.data;
}

function parseManifestSource(raw: string, filePath: string): unknown {
  const ext = extname(filePath).toLowerCase();
  try {
    if (ext === ".json") {
      return JSON.parse(raw);
    }
    if (ext === ".yaml" || ext === ".yml") {
      return parseYaml(raw);
    }
  } catch (error) {
    throw new ManifestLoadError(`Failed to parse manifest "${filePath}" as ${ext}`, error);
  }
  throw new ManifestLoadError(
    `Unsupported manifest extension "${ext}" for file "${filePath}". Use .yaml, .yml, or .json`,
  );
}
