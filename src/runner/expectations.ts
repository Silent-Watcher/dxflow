import type { ExpectConfig } from "../manifest/schema.js";
import type { ExpectationResult } from "../types.js";
import type { HttpResponseOutput } from "./http-client.js";

/**
 * Evaluates the `expect` block (if any) declared on a step against its
 * actual response, returning one ExpectationResult per check performed.
 */
export function evaluateExpectations(
	expect: ExpectConfig | undefined,
	response: HttpResponseOutput | undefined,
): ExpectationResult[] {
	if (!expect) return [];

	const results: ExpectationResult[] = [];

	if (expect.status !== undefined) {
		results.push(evaluateStatusExpectation(expect.status, response));
	}

	if (expect.bodyContains !== undefined) {
		results.push(
			...evaluateBodyContainsExpectation(expect.bodyContains, response),
		);
	}

	return results;
}

function evaluateStatusExpectation(
	expected: number | number[],
	response: HttpResponseOutput | undefined,
): ExpectationResult {
	const expectedList = Array.isArray(expected) ? expected : [expected];
	const description = `status should be ${expectedList.join(" or ")}`;

	if (!response) {
		return { description, passed: false, details: "no response received" };
	}

	const passed = expectedList.includes(response.status);
	return {
		description,
		passed,
		details: passed ? undefined : `received status ${response.status}`,
	};
}

function evaluateBodyContainsExpectation(
	expected: Record<string, unknown>,
	response: HttpResponseOutput | undefined,
): ExpectationResult[] {
	const results: ExpectationResult[] = [];

	for (const [key, expectedValue] of Object.entries(expected)) {
		const description = `body.${key} should equal ${JSON.stringify(expectedValue)}`;

		if (
			!response?.isJson ||
			typeof response.body !== "object" ||
			response.body === null
		) {
			results.push({
				description,
				passed: false,
				details: "response body is not a JSON object",
			});
			continue;
		}

		const actualValue = (response.body as Record<string, unknown>)[key];
		const passed = deepEqual(actualValue, expectedValue);
		results.push({
			description,
			passed,
			details: passed ? undefined : `received ${JSON.stringify(actualValue)}`,
		});
	}

	return results;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (typeof a !== "object" || typeof b !== "object") return false;

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		return a.every((item, index) => deepEqual(item, b[index]));
	}

	const aKeys = Object.keys(a as Record<string, unknown>);
	const bKeys = Object.keys(b as Record<string, unknown>);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) =>
		deepEqual(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
		),
	);
}
