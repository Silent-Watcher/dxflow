import type { JsonValue, RunContext, StepContextEntry } from "../types.js";
import { toTemplateStepView } from "../types.js";

/** Creates the initial, empty run context for a scenario. */
export function createInitialContext(
	scenarioName: string,
	baseUrl: string | undefined,
	vars: Record<string, unknown> | undefined,
): RunContext {
	return {
		scenarioName,
		baseUrl,
		steps: {},
		vars: (vars ?? {}) as Record<string, JsonValue>,
	};
}

/** Returns a new context with the given step entry recorded. Does not mutate the input. */
export function withStepResult(
	context: Readonly<RunContext>,
	stepId: string,
	entry: StepContextEntry,
): RunContext {
	return {
		...context,
		steps: {
			...context.steps,
			[stepId]: toTemplateStepView(entry),
		},
	};
}
