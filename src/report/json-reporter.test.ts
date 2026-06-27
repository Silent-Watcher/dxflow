import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderJsonReport, writeJsonReport } from "./json-reporter.js";
import type { ScenarioReport } from "../types.js";

function makeReport(): ScenarioReport {
  return {
    scenarioName: "Checkout flow",
    manifestPath: "scenario.yaml",
    startedAt: 1000,
    endedAt: 1100,
    totalDurationMs: 100,
    success: true,
    steps: [
      {
        id: "createUser",
        name: undefined,
        success: true,
        error: undefined,
        request: { method: "POST", url: "https://api.example.com/users", headers: {}, body: undefined },
        response: { status: 201, statusText: "Created", headers: {}, body: { id: 1 }, isJson: true },
        timing: { startedAt: 1000, endedAt: 1050, durationMs: 50 },
        expectations: [],
      },
    ],
    summary: {
      totalSteps: 1,
      passedSteps: 1,
      failedSteps: 0,
      averageDurationMs: 50,
      slowestStep: { id: "createUser", durationMs: 50 },
      fastestStep: { id: "createUser", durationMs: 50 },
    },
  };
}

describe("renderJsonReport", () => {
  test("produces valid, pretty-printed JSON that round-trips to an equivalent object", () => {
    const report = makeReport();
    const json = renderJsonReport(report);
    assert.match(json, /\n/); // pretty-printed, not minified
    const parsed = JSON.parse(json);
    // JSON.stringify naturally omits undefined-valued keys (e.g. error, name),
    // so compare against the same lossy round-trip rather than the original object.
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(report)));
  });

  test("preserves all defined scalar and nested values", () => {
    const report = makeReport();
    const parsed = JSON.parse(renderJsonReport(report)) as ScenarioReport;
    assert.equal(parsed.scenarioName, "Checkout flow");
    assert.equal(parsed.success, true);
    assert.equal(parsed.steps[0]?.response?.status, 201);
    assert.equal(parsed.summary.slowestStep?.id, "createUser");
  });
});

describe("writeJsonReport", () => {
  let workDir: string;

  after(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  test("writes the report JSON to the given file path", async () => {
    workDir = await mkdtemp(join(tmpdir(), "dx-flow-json-report-test-"));
    const outputPath = join(workDir, "report.json");
    const report = makeReport();

    await writeJsonReport(report, outputPath);

    const fileContents = await readFile(outputPath, "utf-8");
    assert.deepEqual(JSON.parse(fileContents), JSON.parse(JSON.stringify(report)));
  });
});
