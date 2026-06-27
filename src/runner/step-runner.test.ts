import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import type { StepConfig } from "../manifest/schema.js";
import type { TransformFn } from "../types.js";
import { createInitialContext } from "./context.js";
import { runStep } from "./step-runner.js";

const originalFetch = globalThis.fetch;

function baseStep(overrides: Partial<StepConfig> = {}): StepConfig {
	return {
		id: "createUser",
		method: "POST",
		path: "/users",
		...overrides,
	};
}

describe("runStep", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
		mock.reset();
	});

	test("sends a request to baseUrl + path and records a successful context entry", async () => {
		globalThis.fetch = mock.fn(
			async () =>
				new Response(JSON.stringify({ id: 7 }), {
					status: 201,
					headers: { "content-type": "application/json" },
				}),
		) as unknown as typeof fetch;

		const context = createInitialContext(
			"test scenario",
			"https://api.example.com",
			undefined,
		);
		const outcome = await runStep(
			baseStep(),
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(outcome.result.success, true);
		assert.equal(outcome.result.response?.status, 201);
		assert.equal(
			outcome.contextEntry?.request.url,
			"https://api.example.com/users",
		);
		assert.deepEqual(outcome.contextEntry?.response.body, { id: 7 });
	});

	test("resolves templated headers from prior step context", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedHeaders = init?.headers as Record<string, string>;
				return new Response(JSON.stringify({}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		) as unknown as typeof fetch;

		let context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		context = {
			...context,
			steps: {
				login: {
					id: "login",
					status: 200,
					statusText: "OK",
					headers: {},
					body: { token: "secret-token" },
					isJson: true,
					requestBody: undefined,
					durationMs: 5,
				},
			},
		};

		const step = baseStep({
			headers: { Authorization: "Bearer {{steps.login.body.token}}" },
		});
		await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(capturedHeaders?.["Authorization"], "Bearer secret-token");
	});

	test("resolves templated body values from prior step context", async () => {
		let capturedBody: string | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedBody = init?.body as string;
				return new Response(JSON.stringify({}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		) as unknown as typeof fetch;

		let context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		context = {
			...context,
			steps: {
				createUser: {
					id: "createUser",
					status: 201,
					statusText: "Created",
					headers: {},
					body: { id: 99 },
					isJson: true,
					requestBody: undefined,
					durationMs: 5,
				},
			},
		};

		const step = baseStep({
			id: "createOrder",
			path: "/orders",
			body: { userId: "{{steps.createUser.body.id}}" },
		});
		await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.deepEqual(JSON.parse(capturedBody ?? "{}"), { userId: 99 });
	});

	test("merges defaultHeaders with step-level headers, step-level taking precedence", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedHeaders = init?.headers as Record<string, string>;
				return new Response(JSON.stringify({}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		) as unknown as typeof fetch;

		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const step = baseStep({ headers: { "X-Override": "step-value" } });
		await runStep(
			step,
			context,
			"https://api.example.com",
			{ "X-Override": "default-value", "X-Default-Only": "kept" },
			undefined,
		);

		assert.equal(capturedHeaders?.["X-Override"], "step-value");
		assert.equal(capturedHeaders?.["X-Default-Only"], "kept");
	});

	test("applies a transform override on top of resolved values", async () => {
		let capturedInit: RequestInit | undefined;
		let capturedUrl: string | URL | undefined;
		globalThis.fetch = mock.fn(
			async (url: string | URL, init?: RequestInit) => {
				capturedUrl = url;
				capturedInit = init;
				return new Response(JSON.stringify({}), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		) as unknown as typeof fetch;

		const transformFn: TransformFn = () => ({
			path: "/users/override",
			headers: { "X-From-Transform": "yes" },
			body: { fromTransform: true },
		});
		const loadStepTransform = mock.fn(async (_ref: string) => transformFn);

		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const step = baseStep({ transform: "./fake.ts#fn" });
		await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			loadStepTransform,
		);

		assert.equal(loadStepTransform.mock.calls.length, 1);
		assert.equal(loadStepTransform.mock.calls[0]?.arguments[0], "./fake.ts#fn");
		assert.equal(
			capturedUrl?.toString(),
			"https://api.example.com/users/override",
		);
		assert.equal(
			(capturedInit?.headers as Record<string, string>)["X-From-Transform"],
			"yes",
		);
		assert.deepEqual(JSON.parse(capturedInit?.body as string), {
			fromTransform: true,
		});
	});

	test("fails the step when a transform is declared but no loader is provided", async () => {
		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const step = baseStep({ transform: "./fake.ts#fn" });
		const outcome = await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(outcome.result.success, false);
		assert.match(outcome.result.error ?? "", /no transform loader/);
		assert.equal(outcome.contextEntry, undefined);
	});

	test("marks the step failed when an expectation does not pass", async () => {
		globalThis.fetch = mock.fn(
			async () =>
				new Response(JSON.stringify({}), {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
		) as unknown as typeof fetch;

		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const step = baseStep({ expect: { status: 200 } });
		const outcome = await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(outcome.result.success, false);
		assert.equal(outcome.result.expectations[0]?.passed, false);
		// Even though the expectation failed, the response was received, so context entry is still recorded.
		assert.ok(outcome.contextEntry);
	});

	test("records a failed result with no context entry when the network request throws", async () => {
		globalThis.fetch = mock.fn(async () => {
			throw new Error("network unreachable");
		}) as unknown as typeof fetch;

		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const outcome = await runStep(
			baseStep(),
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(outcome.result.success, false);
		assert.match(outcome.result.error ?? "", /network unreachable/);
		assert.equal(outcome.contextEntry, undefined);
	});

	test("fails gracefully when a template expression cannot be resolved", async () => {
		const context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		const step = baseStep({
			headers: { Authorization: "Bearer {{steps.missing.body.token}}" },
		});
		const outcome = await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		assert.equal(outcome.result.success, false);
		assert.match(outcome.result.error ?? "", /missing/);
	});

	test("resolves query params against context", async () => {
		let capturedUrl: string | URL | undefined;
		globalThis.fetch = mock.fn(async (url: string | URL) => {
			capturedUrl = url;
			return new Response(JSON.stringify({}), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as unknown as typeof fetch;

		let context = createInitialContext(
			"test",
			"https://api.example.com",
			undefined,
		);
		context = {
			...context,
			steps: {
				createUser: {
					id: "createUser",
					status: 201,
					statusText: "Created",
					headers: {},
					body: { id: 5 },
					isJson: true,
					requestBody: undefined,
					durationMs: 1,
				},
			},
		};

		const step = baseStep({
			method: "GET",
			path: "/orders",
			query: { userId: "{{steps.createUser.body.id}}" },
		});
		await runStep(
			step,
			context,
			"https://api.example.com",
			undefined,
			undefined,
		);

		const parsed = new URL(capturedUrl as string);
		assert.equal(parsed.searchParams.get("userId"), "5");
	});
});
