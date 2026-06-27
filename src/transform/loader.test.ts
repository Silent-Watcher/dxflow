import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTransform, parseTransformRef, manifestDirOf, TransformLoadError } from "./loader.js";

describe("parseTransformRef", () => {
  test("splits a valid reference into file path and export name", () => {
    const result = parseTransformRef("./transforms/foo.ts#buildBody");
    assert.deepEqual(result, { filePath: "./transforms/foo.ts", exportName: "buildBody" });
  });

  test("handles nested paths with multiple slashes", () => {
    const result = parseTransformRef("a/b/c/foo.js#myExport");
    assert.deepEqual(result, { filePath: "a/b/c/foo.js", exportName: "myExport" });
  });

  test("throws when there is no '#' separator", () => {
    assert.throws(() => parseTransformRef("./transforms/foo.ts"), TransformLoadError);
  });

  test("throws when the export name is empty (trailing '#')", () => {
    assert.throws(() => parseTransformRef("./transforms/foo.ts#"), TransformLoadError);
  });

  test("throws when the file path is empty (leading '#')", () => {
    assert.throws(() => parseTransformRef("#exportName"), TransformLoadError);
  });
});

describe("manifestDirOf", () => {
  test("returns the directory containing the manifest file", () => {
    const dir = manifestDirOf("/some/path/to/manifest.yaml");
    assert.equal(dir, "/some/path/to");
  });
});

describe("loadTransform", () => {
  let workDir: string;

  before(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dx-flow-transform-test-"));
    await writeFile(
      join(workDir, "transforms.mjs"),
      [
        "export function buildBody(ctx) {",
        "  return { body: { fromTransform: true, scenario: ctx.scenarioName } };",
        "}",
        "export const notAFunction = 42;",
      ].join("\n"),
      "utf-8",
    );
  });

  after(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test("loads a transform function from a relative path", async () => {
    const fn = await loadTransform("./transforms.mjs#buildBody", workDir);
    const result = await fn({ scenarioName: "test", baseUrl: undefined, steps: {}, vars: {} });
    assert.deepEqual(result, { body: { fromTransform: true, scenario: "test" } });
  });

  test("throws TransformLoadError when the module file does not exist", async () => {
    await assert.rejects(
      () => loadTransform("./does-not-exist.mjs#buildBody", workDir),
      TransformLoadError,
    );
  });

  test("throws TransformLoadError when the named export does not exist", async () => {
    await assert.rejects(
      () => loadTransform("./transforms.mjs#missingExport", workDir),
      TransformLoadError,
    );
  });

  test("throws TransformLoadError when the named export is not a function", async () => {
    await assert.rejects(
      () => loadTransform("./transforms.mjs#notAFunction", workDir),
      TransformLoadError,
    );
  });

  test("supports absolute file paths", async () => {
    const absolutePath = join(workDir, "transforms.mjs");
    const fn = await loadTransform(`${absolutePath}#buildBody`, "/irrelevant/dir");
    const result = await fn({ scenarioName: "abs-test", baseUrl: undefined, steps: {}, vars: {} });
    assert.deepEqual(result, { body: { fromTransform: true, scenario: "abs-test" } });
  });
});
