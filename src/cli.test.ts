import { test, describe, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseCliArgs, executeCli, CliArgumentError } from "./cli.js";
import { ManifestLoadError } from "./manifest/loader.js";

const originalFetch = globalThis.fetch;

describe("parseCliArgs", () => {
  test("parses the basic 'run <manifest>' form", () => {
    const options = parseCliArgs(["run", "scenario.yaml"]);
    assert.deepEqual(options, {
      manifestPath: "scenario.yaml",
      jsonOutputPath: undefined,
      htmlOutputPath: undefined,
      quiet: false,
    });
  });

  test("parses --json and --html output paths", () => {
    const options = parseCliArgs(["run", "scenario.yaml", "--json", "out.json", "--html", "out.html"]);
    assert.equal(options.jsonOutputPath, "out.json");
    assert.equal(options.htmlOutputPath, "out.html");
  });

  test("parses --quiet flag", () => {
    const options = parseCliArgs(["run", "scenario.yaml", "--quiet"]);
    assert.equal(options.quiet, true);
  });

  test("parses options in any order relative to the manifest path", () => {
    const options = parseCliArgs(["run", "--quiet", "--json", "out.json", "scenario.yaml"]);
    assert.equal(options.manifestPath, "scenario.yaml");
    assert.equal(options.jsonOutputPath, "out.json");
    assert.equal(options.quiet, true);
  });

  test("throws CliArgumentError for an unknown command", () => {
    assert.throws(() => parseCliArgs(["explode", "scenario.yaml"]), CliArgumentError);
  });

  test("throws CliArgumentError for a missing command", () => {
    assert.throws(() => parseCliArgs([]), CliArgumentError);
  });

  test("throws CliArgumentError when manifest path is missing", () => {
    assert.throws(() => parseCliArgs(["run", "--quiet"]), CliArgumentError);
  });

  test("throws CliArgumentError for an unrecognized flag", () => {
    assert.throws(() => parseCliArgs(["run", "scenario.yaml", "--bogus"]), CliArgumentError);
  });
});

describe("executeCli", () => {
  let workDir: string;

  before(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dx-flow-cli-test-"));
  });

  after(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  test("runs a simple manifest end-to-end and returns a successful report", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "content-type": "application/json" } }),
    ) as unknown as typeof fetch;

    const manifestPath = join(workDir, "simple.yaml");
    await writeFile(
      manifestPath,
      "name: Simple flow\nbaseUrl: https://api.example.com\nsteps:\n  - id: ping\n    method: GET\n    path: /ping\n",
      "utf-8",
    );

    const logs: string[] = [];
    const report = await executeCli(
      { manifestPath, jsonOutputPath: undefined, htmlOutputPath: undefined, quiet: true },
      (msg) => logs.push(msg),
    );

    assert.equal(report.success, true);
    assert.equal(report.steps.length, 1);
    // quiet: true means no console output for the progress/summary lines.
    assert.equal(logs.length, 0);
  });

  test("logs step lines and the summary report when quiet is false", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    ) as unknown as typeof fetch;

    const manifestPath = join(workDir, "verbose.yaml");
    await writeFile(
      manifestPath,
      "name: Verbose flow\nbaseUrl: https://api.example.com\nsteps:\n  - id: ping\n    method: GET\n    path: /ping\n",
      "utf-8",
    );

    const logs: string[] = [];
    await executeCli(
      { manifestPath, jsonOutputPath: undefined, htmlOutputPath: undefined, quiet: false },
      (msg) => logs.push(msg),
    );

    assert.ok(logs.some((line) => line.includes("ping")));
    assert.ok(logs.some((line) => line.includes("Verbose flow")));
  });

  test("writes JSON and HTML report files when paths are given", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    ) as unknown as typeof fetch;

    const manifestPath = join(workDir, "with-outputs.yaml");
    await writeFile(
      manifestPath,
      "name: Output flow\nbaseUrl: https://api.example.com\nsteps:\n  - id: ping\n    method: GET\n    path: /ping\n",
      "utf-8",
    );

    const jsonOutputPath = join(workDir, "report.json");
    const htmlOutputPath = join(workDir, "report.html");

    await executeCli(
      { manifestPath, jsonOutputPath, htmlOutputPath, quiet: true },
      () => {},
    );

    const jsonContents = await readFile(jsonOutputPath, "utf-8");
    const htmlContents = await readFile(htmlOutputPath, "utf-8");
    assert.match(jsonContents, /"scenarioName": "Output flow"/);
    assert.match(htmlContents, /Output flow/);
  });

  test("propagates ManifestLoadError for an invalid manifest", async () => {
    const manifestPath = join(workDir, "invalid.yaml");
    await writeFile(manifestPath, "name: No steps\nsteps: []\n", "utf-8");

    await assert.rejects(
      () => executeCli({ manifestPath, jsonOutputPath: undefined, htmlOutputPath: undefined, quiet: true }, () => {}),
      ManifestLoadError,
    );
  });

  test("a scenario with a failing step yields a report with success: false", async () => {
    globalThis.fetch = mock.fn(
      async () => new Response(JSON.stringify({}), { status: 500, headers: { "content-type": "application/json" } }),
    ) as unknown as typeof fetch;

    const manifestPath = join(workDir, "failing.yaml");
    await writeFile(
      manifestPath,
      [
        "name: Failing flow",
        "baseUrl: https://api.example.com",
        "steps:",
        "  - id: ping",
        "    method: GET",
        "    path: /ping",
        "    expect:",
        "      status: 200",
      ].join("\n"),
      "utf-8",
    );

    const report = await executeCli(
      { manifestPath, jsonOutputPath: undefined, htmlOutputPath: undefined, quiet: true },
      () => {},
    );

    assert.equal(report.success, false);
  });
});

describe("built CLI binary invoked through a symlink (simulates npm's bin mechanism)", () => {
  const distCliPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.mjs");
  let workDir: string;

  before(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dx-flow-symlink-test-"));
  });

  after(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test("runs main() when invoked via a symlink, not just when run directly", async (t) => {
    try {
      await access(distCliPath);
    } catch {
      t.skip("dist/cli.mjs not built — run `npm run build` first");
      return;
    }

    // npm creates node_modules/.bin/dxflow as a symlink to dist/cli.mjs. Earlier
    // versions of the direct-execution check compared process.argv[1] to
    // import.meta.url with a naive string comparison, which never matched
    // through a symlink, so main() silently never ran. This reproduces that
    // exact invocation shape against the real built artifact.
    const symlinkPath = join(workDir, "dxflow-symlink");
    await symlink(distCliPath, symlinkPath);

    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolvePromise) => {
        const child = spawn(process.execPath, [symlinkPath], { cwd: workDir });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("close", (code) => resolvePromise({ stdout, stderr, code }));
      },
    );

    // With no arguments, the CLI should print the usage error to stderr and exit 1 —
    // proof that main() actually executed, rather than silently exiting 0 having done nothing.
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Usage: dxflow run <manifest>/);
  });
});
