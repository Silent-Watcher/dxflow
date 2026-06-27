import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { ScenarioReport, StepResult } from "../types.js";
import { renderHtmlReport, writeHtmlReport } from "./html-reporter.js";

function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
	return {
		id: "createUser",
		name: undefined,
		success: true,
		error: undefined,
		request: {
			method: "POST",
			url: "https://api.example.com/users",
			headers: {},
			body: undefined,
		},
		response: {
			status: 201,
			statusText: "Created",
			headers: {},
			body: { id: 1 },
			isJson: true,
		},
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

describe("renderHtmlReport", () => {
	test("produces a well-formed standalone HTML document", () => {
		const html = renderHtmlReport(makeReport());
		assert.match(html, /^<!DOCTYPE html>/);
		assert.match(html, /<\/html>\s*$/);
		assert.match(html, /<style>/);
	});

	test("includes the scenario name and PASSED/FAILED badge", () => {
		const passing = renderHtmlReport(makeReport({ success: true }));
		assert.match(passing, /Checkout flow/);
		assert.match(passing, /badge passed">PASSED/);

		const failing = renderHtmlReport(makeReport({ success: false }));
		assert.match(failing, /badge failed">FAILED/);
	});

	test("escapes HTML special characters in scenario name and URLs", () => {
		const report = makeReport({
			scenarioName: '<script>alert("xss")</script>',
		});
		const html = renderHtmlReport(report);
		assert.doesNotMatch(html, /<script>alert/);
		assert.match(html, /&lt;script&gt;/);
	});

	test("escapes HTML special characters in step error messages", () => {
		const report = makeReport({
			steps: [
				makeStepResult({
					success: false,
					error: '<img src=x onerror="alert(1)">',
				}),
			],
		});
		const html = renderHtmlReport(report);
		assert.doesNotMatch(html, /<img src=x/);
	});

	test("renders one table row per step with method, url, status, duration", () => {
		const report = makeReport({
			steps: [
				makeStepResult({ id: "a" }),
				makeStepResult({ id: "b", success: false, error: "boom" }),
			],
		});
		const html = renderHtmlReport(report);
		assert.match(html, /<td>POST<\/td>/);
		assert.match(html, /https:\/\/api\.example\.com\/users/);
		assert.match(html, /PASS/);
		assert.match(html, /FAIL/);
		assert.match(html, /boom/);
	});

	test("renders an SVG timing chart with one bar per step", () => {
		const report = makeReport({
			steps: [makeStepResult({ id: "a" }), makeStepResult({ id: "b" })],
		});
		const html = renderHtmlReport(report);
		const rectMatches = html.match(/<rect/g) ?? [];
		assert.equal(rectMatches.length, 2);
	});

	test("handles a report with zero steps without throwing", () => {
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
		assert.doesNotThrow(() => renderHtmlReport(report));
		const html = renderHtmlReport(report);
		assert.match(html, /No steps were executed/);
	});

	test("colors failing-step bars differently from passing-step bars", () => {
		const report = makeReport({
			steps: [
				makeStepResult({ id: "ok", success: true }),
				makeStepResult({ id: "bad", success: false }),
			],
		});
		const html = renderHtmlReport(report);
		assert.match(html, /#16a34a/); // pass color
		assert.match(html, /#dc2626/); // fail color
	});
});

describe("writeHtmlReport", () => {
	let workDir: string;

	after(async () => {
		if (workDir) await rm(workDir, { recursive: true, force: true });
	});

	test("writes the rendered HTML to the given file path", async () => {
		workDir = await mkdtemp(join(tmpdir(), "dx-flow-html-report-test-"));
		const outputPath = join(workDir, "report.html");
		await writeHtmlReport(makeReport(), outputPath);

		const contents = await readFile(outputPath, "utf-8");
		assert.match(contents, /<!DOCTYPE html>/);
		assert.match(contents, /Checkout flow/);
	});
});
