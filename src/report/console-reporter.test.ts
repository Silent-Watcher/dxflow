import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderConsoleReport, renderStepLine } from "./console-reporter.js";
import type { ScenarioReport, StepResult } from "../types.js";

function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    id: "createUser",
    name: undefined,
    success: true,
    error: undefined,
    request: { method: "POST", url: "https://api.example.com/users", headers: {}, body: undefined },
    response: { status: 201, statusText: "Created", headers: {}, body: { id: 1 }, isJson: true },
    timing: { startedAt: 0, endedAt: 42, durationMs: 42 },
    expectations: [],
    ...overrides,
  };
}

function makeReport(overrides: Partial<ScenarioReport> = {}): ScenarioReport {
  const steps = overrides.steps ?? [makeStepResult()];
  return {
    scenarioName: "Checkout flow",
    manifestPath: "scenario.yaml",
    startedAt: 0,
    endedAt: 100,
    totalDurationMs: 100,
    success: true,
    steps,
    summary: {
      totalSteps: steps.length,
      passedSteps: steps.filter((s) => s.success).length,
      failedSteps: steps.filter((s) => !s.success).length,
      averageDurationMs: 42,
      slowestStep: { id: "createUser", durationMs: 42 },
      fastestStep: { id: "createUser", durationMs: 42 },
    },
    ...overrides,
  };
}

describe("renderStepLine", () => {
  test("shows a checkmark and status/duration for a passing step", () => {
    const line = renderStepLine(makeStepResult(), 0, 2);
    assert.match(line, /✓/);
    assert.match(line, /\[1\/2\]/);
    assert.match(line, /201/);
    assert.match(line, /42ms/);
  });

  test("shows an X and error message for a failed step with no response", () => {
    const result = makeStepResult({ success: false, response: undefined, error: "timeout" });
    const line = renderStepLine(result, 1, 3);
    assert.match(line, /✗/);
    assert.match(line, /ERR/);
    assert.match(line, /timeout/);
  });

  test("prefers the step's name over its id when present", () => {
    const result = makeStepResult({ name: "Create the user" });
    const line = renderStepLine(result, 0, 1);
    assert.match(line, /Create the user/);
  });
});

describe("renderConsoleReport", () => {
  test("includes scenario name, manifest path, and PASSED/FAILED label", () => {
    const passing = renderConsoleReport(makeReport({ success: true }));
    assert.match(passing, /Checkout flow/);
    assert.match(passing, /scenario\.yaml/);
    assert.match(passing, /PASSED/);

    const failing = renderConsoleReport(makeReport({ success: false }));
    assert.match(failing, /FAILED/);
  });

  test("lists each step with its result line", () => {
    const report = makeReport({
      steps: [makeStepResult({ id: "a" }), makeStepResult({ id: "b" })],
    });
    const output = renderConsoleReport(report);
    assert.match(output, /\[1\/2\]/);
    assert.match(output, /\[2\/2\]/);
  });

  test("shows failed expectation details indented under the step", () => {
    const report = makeReport({
      steps: [
        makeStepResult({
          success: false,
          expectations: [{ description: "status should be 200", passed: false, details: "received status 500" }],
        }),
      ],
    });
    const output = renderConsoleReport(report);
    assert.match(output, /status should be 200/);
    assert.match(output, /received status 500/);
  });

  test("omits passed expectations from the failure detail list", () => {
    const report = makeReport({
      steps: [
        makeStepResult({
          expectations: [{ description: "status should be 200", passed: true, details: undefined }],
        }),
      ],
    });
    const output = renderConsoleReport(report);
    // The passed expectation's description should not appear as a failure-indented line.
    assert.doesNotMatch(output, /✗ status should be 200/);
  });

  test("includes summary statistics", () => {
    const output = renderConsoleReport(makeReport());
    assert.match(output, /Total steps:\s+1/);
    assert.match(output, /Passed:\s+1/);
    assert.match(output, /Failed:\s+0/);
    assert.match(output, /Avg duration:\s+42\.0ms/);
    assert.match(output, /Total time:\s+100ms/);
  });

  test("handles a report with zero steps gracefully", () => {
    const report = makeReport({
      steps: [],
      summary: {
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        averageDurationMs: 0,
        slowestStep: undefined,
        fastestStep: undefined,
      },
    });
    assert.doesNotThrow(() => renderConsoleReport(report));
  });
});
