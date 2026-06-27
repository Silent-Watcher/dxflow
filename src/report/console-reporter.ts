import type { ScenarioReport, StepResult } from "../types.js";

const SYMBOLS = { pass: "✓", fail: "✗" } as const;

/**
 * Renders a single completed step as a one-line console message, suitable
 * for live progress output as the scenario runs.
 */
export function renderStepLine(
	result: StepResult,
	index: number,
	total: number,
): string {
	const symbol = result.success ? SYMBOLS.pass : SYMBOLS.fail;
	const label = result.name ?? result.id;
	const status = result.response ? `${result.response.status}` : "ERR";
	const duration = `${result.timing.durationMs}ms`;
	const failureNote = result.error ? ` — ${result.error}` : "";
	return `[${index + 1}/${total}] ${symbol} ${label} (${status}, ${duration})${failureNote}`;
}

/**
 * Renders the full scenario report as a multi-line console summary,
 * including a per-step table and aggregate timing stats.
 */
export function renderConsoleReport(report: ScenarioReport): string {
	const lines: string[] = [];

	lines.push("");
	lines.push(`Scenario: ${report.scenarioName}`);
	lines.push(`Manifest: ${report.manifestPath}`);
	lines.push(`Result:   ${report.success ? "PASSED" : "FAILED"}`);
	lines.push("");

	for (const [index, step] of report.steps.entries()) {
		lines.push(renderStepLine(step, index, report.steps.length));
		for (const expectation of step.expectations.filter(
			(expectation) => !expectation.passed,
		)) {
			lines.push(
				`      ${SYMBOLS.fail} ${expectation.description}${expectation.details ? ` (${expectation.details})` : ""}`,
			);
		}
	}

	lines.push("");
	lines.push("Summary");
	lines.push(`  Total steps:    ${report.summary.totalSteps}`);
	lines.push(`  Passed:         ${report.summary.passedSteps}`);
	lines.push(`  Failed:         ${report.summary.failedSteps}`);
	lines.push(
		`  Avg duration:   ${report.summary.averageDurationMs.toFixed(1)}ms`,
	);
	if (report.summary.slowestStep) {
		lines.push(
			`  Slowest step:   ${report.summary.slowestStep.id} (${report.summary.slowestStep.durationMs}ms)`,
		);
	}
	if (report.summary.fastestStep) {
		lines.push(
			`  Fastest step:   ${report.summary.fastestStep.id} (${report.summary.fastestStep.durationMs}ms)`,
		);
	}
	lines.push(`  Total time:     ${report.totalDurationMs}ms`);
	lines.push("");

	return lines.join("\n");
}
