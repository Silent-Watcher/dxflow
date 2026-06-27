import type { ManifestConfig } from "../manifest/schema.js";
import type { ScenarioReport, StepResult, TransformFn } from "../types.js";
import { createInitialContext, withStepResult } from "./context.js";
import { runStep } from "./step-runner.js";

export interface ScenarioRunOptions {
	manifestPath: string;
	/** Loads a transform module given its raw manifest reference string. */
	loadTransform?: (ref: string) => Promise<TransformFn>;
	/** Optional hook invoked after each step completes, useful for live CLI output. */
	onStepComplete?: (
		result: StepResult,
		stepIndex: number,
		totalSteps: number,
	) => void;
	/** Injectable sleep function, primarily for testing delayMs behavior quickly. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes every step in the manifest in order, threading response data
 * forward via the run context, and returns a complete scenario report.
 *
 * By default, a step failure (request error or failed expectation) halts
 * the scenario unless that step sets `continueOnFailure: true`.
 */
export async function runScenario(
	manifest: ManifestConfig,
	options: ScenarioRunOptions,
): Promise<ScenarioReport> {
	const sleep = options.sleep ?? defaultSleep;
	const startedAt = Date.now();

	let context = createInitialContext(
		manifest.name,
		manifest.baseUrl,
		manifest.vars,
	);
	const results: StepResult[] = [];

	for (let index = 0; index < manifest.steps.length; index++) {
		const step = manifest.steps[index];
		if (!step) continue;

		if (step.delayMs) {
			await sleep(step.delayMs);
		}

		const outcome = await runStep(
			step,
			context,
			manifest.baseUrl,
			manifest.defaultHeaders,
			options.loadTransform,
		);

		results.push(outcome.result);
		options.onStepComplete?.(outcome.result, index, manifest.steps.length);

		if (outcome.contextEntry) {
			context = withStepResult(context, step.id, outcome.contextEntry);
		}

		const shouldHalt = !outcome.result.success && !step.continueOnFailure;
		if (shouldHalt) {
			break;
		}
	}

	const endedAt = Date.now();
	return buildReport(
		manifest,
		options.manifestPath,
		results,
		startedAt,
		endedAt,
	);
}

function buildReport(
	manifest: ManifestConfig,
	manifestPath: string,
	steps: StepResult[],
	startedAt: number,
	endedAt: number,
): ScenarioReport {
	const passedSteps = steps.filter((step) => step.success).length;
	const failedSteps = steps.length - passedSteps;

	const durations = steps.map((step) => step.timing.durationMs);
	const averageDurationMs =
		durations.length > 0
			? durations.reduce((sum, value) => sum + value, 0) / durations.length
			: 0;

	const slowestStep = findExtremeStep(
		steps,
		(a, b) => a.timing.durationMs > b.timing.durationMs,
	);
	const fastestStep = findExtremeStep(
		steps,
		(a, b) => a.timing.durationMs < b.timing.durationMs,
	);

	return {
		scenarioName: manifest.name,
		manifestPath,
		startedAt,
		endedAt,
		totalDurationMs: endedAt - startedAt,
		success: failedSteps === 0 && steps.length === manifest.steps.length,
		steps,
		summary: {
			totalSteps: steps.length,
			passedSteps,
			failedSteps,
			averageDurationMs,
			slowestStep: slowestStep
				? { id: slowestStep.id, durationMs: slowestStep.timing.durationMs }
				: undefined,
			fastestStep: fastestStep
				? { id: fastestStep.id, durationMs: fastestStep.timing.durationMs }
				: undefined,
		},
	};
}

function findExtremeStep(
	steps: StepResult[],
	isMoreExtreme: (a: StepResult, b: StepResult) => boolean,
): StepResult | undefined {
	if (steps.length === 0) return undefined;
	return steps.reduce((best, current) =>
		isMoreExtreme(current, best) ? current : best,
	);
}
