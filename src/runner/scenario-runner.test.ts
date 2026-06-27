import { test, describe, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { runScenario } from "./scenario-runner.js";
import type { ManifestConfig } from "../manifest/schema.js";

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function baseManifest(overrides: Partial<ManifestConfig> = {}): ManifestConfig {
  return {
    name: "Test scenario",
    baseUrl: "https://api.example.com",
    steps: [
      { id: "stepA", method: "GET", path: "/a" },
      { id: "stepB", method: "GET", path: "/b" },
    ],
    ...overrides,
  };
}

describe("runScenario", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.reset();
  });

  test("runs all steps in order and reports overall success", async () => {
    let callOrder: string[] = [];
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      callOrder.push(url.toString());
      return jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;

    const report = await runScenario(baseManifest(), { manifestPath: "scenario.yaml" });

    assert.equal(report.success, true);
    assert.equal(report.steps.length, 2);
    assert.deepEqual(callOrder, ["https://api.example.com/a", "https://api.example.com/b"]);
  });

  test("threads response data from step A into step B via templates", async () => {
    let secondRequestUrl: string | undefined;
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/a") {
        return jsonResponse(200, { id: 123 });
      }
      secondRequestUrl = url.toString();
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const manifest = baseManifest({
      steps: [
        { id: "stepA", method: "GET", path: "/a" },
        { id: "stepB", method: "GET", path: "/items/{{steps.stepA.body.id}}" },
      ],
    });

    await runScenario(manifest, { manifestPath: "scenario.yaml" });
    assert.equal(secondRequestUrl, "https://api.example.com/items/123");
  });

  test("halts after a failing step by default and does not run subsequent steps", async () => {
    const calledPaths: string[] = [];
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      calledPaths.push(url.toString());
      if (new URL(url).pathname === "/a") {
        return jsonResponse(500, { error: "boom" });
      }
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const manifest = baseManifest({
      steps: [
        { id: "stepA", method: "GET", path: "/a", expect: { status: 200 } },
        { id: "stepB", method: "GET", path: "/b" },
      ],
    });

    const report = await runScenario(manifest, { manifestPath: "scenario.yaml" });

    assert.equal(report.success, false);
    assert.equal(report.steps.length, 1);
    assert.equal(calledPaths.length, 1);
  });

  test("continues past a failing step when continueOnFailure is set", async () => {
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      if (new URL(url).pathname === "/a") {
        return jsonResponse(500, { error: "boom" });
      }
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const manifest = baseManifest({
      steps: [
        { id: "stepA", method: "GET", path: "/a", expect: { status: 200 }, continueOnFailure: true },
        { id: "stepB", method: "GET", path: "/b" },
      ],
    });

    const report = await runScenario(manifest, { manifestPath: "scenario.yaml" });

    assert.equal(report.steps.length, 2);
    assert.equal(report.summary.failedSteps, 1);
    assert.equal(report.summary.passedSteps, 1);
    assert.equal(report.success, false);
  });

  test("invokes onStepComplete after each step with correct index/total", async () => {
    globalThis.fetch = mock.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const calls: Array<{ id: string; index: number; total: number }> = [];

    await runScenario(baseManifest(), {
      manifestPath: "scenario.yaml",
      onStepComplete: (result, index, total) => {
        calls.push({ id: result.id, index, total });
      },
    });

    assert.deepEqual(calls, [
      { id: "stepA", index: 0, total: 2 },
      { id: "stepB", index: 1, total: 2 },
    ]);
  });

  test("waits for delayMs before sending a step's request, using the injected sleep fn", async () => {
    globalThis.fetch = mock.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const sleepCalls: number[] = [];
    const sleep = mock.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    const manifest = baseManifest({
      steps: [{ id: "stepA", method: "GET", path: "/a", delayMs: 250 }],
    });

    await runScenario(manifest, { manifestPath: "scenario.yaml", sleep });
    assert.deepEqual(sleepCalls, [250]);
  });

  test("computes summary stats: average, slowest, fastest", async () => {
    let callCount = 0;
    globalThis.fetch = mock.fn(async () => {
      callCount += 1;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const report = await runScenario(baseManifest(), { manifestPath: "scenario.yaml" });

    assert.equal(callCount, 2);
    assert.equal(report.summary.totalSteps, 2);
    assert.ok(report.summary.slowestStep !== undefined);
    assert.ok(report.summary.fastestStep !== undefined);
    assert.ok(report.summary.averageDurationMs >= 0);
  });

  test("passes the manifestPath through into the report", async () => {
    globalThis.fetch = mock.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const report = await runScenario(baseManifest(), { manifestPath: "/tmp/my-scenario.yaml" });
    assert.equal(report.manifestPath, "/tmp/my-scenario.yaml");
  });

  test("reports success: false when a network error occurs mid-scenario", async () => {
    globalThis.fetch = mock.fn(async (url: string | URL) => {
      if (new URL(url).pathname === "/a") {
        throw new Error("connection refused");
      }
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const report = await runScenario(baseManifest(), { manifestPath: "scenario.yaml" });

    assert.equal(report.success, false);
    assert.equal(report.steps[0]?.error, "connection refused");
  });

  test("passes loadTransform through to steps that declare a transform", async () => {
    globalThis.fetch = mock.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    const loadTransform = mock.fn(async () => () => ({ body: { injected: true } }));

    const manifest = baseManifest({
      steps: [{ id: "stepA", method: "POST", path: "/a", transform: "./fake.ts#fn" }],
    });

    await runScenario(manifest, { manifestPath: "scenario.yaml", loadTransform });
    assert.equal(loadTransform.mock.calls.length, 1);
  });

  test("returns an empty-success-false-compatible report shape with zero steps run if first step throws synchronously in setup", async () => {
    // Sanity: a manifest always has at least one step per schema, but the runner itself
    // should handle a context-resolution failure on step 1 without throwing out of runScenario.
    const manifest = baseManifest({
      steps: [{ id: "stepA", method: "GET", path: "{{steps.nonexistent.body.x}}" }],
    });

    const report = await runScenario(manifest, { manifestPath: "scenario.yaml" });
    assert.equal(report.success, false);
    assert.equal(report.steps.length, 1);
  });
});
