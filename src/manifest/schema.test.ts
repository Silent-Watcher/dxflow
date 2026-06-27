import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	assertUniqueStepIds,
	type ManifestConfig,
	manifestSchema,
} from "./schema.js";

function validManifest(): unknown {
	return {
		name: "Checkout flow",
		baseUrl: "https://api.example.com",
		steps: [
			{
				id: "createUser",
				method: "POST",
				path: "/users",
				body: { name: "Ada" },
			},
			{ id: "createOrder", method: "POST", path: "/orders" },
		],
	};
}

describe("manifestSchema", () => {
	test("accepts a minimal valid manifest", () => {
		const result = manifestSchema.safeParse(validManifest());
		assert.equal(result.success, true);
	});

	test("rejects a manifest with no steps", () => {
		const manifest = {
			...(validManifest() as Record<string, unknown>),
			steps: [],
		};
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("rejects a manifest missing a name", () => {
		const manifest = validManifest() as Record<string, unknown>;
		delete manifest.name;
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("rejects an invalid baseUrl", () => {
		const manifest = {
			...(validManifest() as Record<string, unknown>),
			baseUrl: "not-a-url",
		};
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("baseUrl is optional (absolute step paths can be used instead)", () => {
		const manifest = validManifest() as Record<string, unknown>;
		delete manifest.baseUrl;
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, true);
	});

	test("rejects a step with an invalid id (starts with a digit)", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.id = "1invalid";
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("rejects a step with an unsupported HTTP method", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.method = "TRACE";
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("rejects a transform reference without a '#' separator", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.transform = "./transforms/foo.ts";
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("accepts a valid transform reference", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.transform = "./transforms/foo.ts#buildBody";
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, true);
	});

	test("accepts an expect block with a single status code", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.expect = { status: 201 };
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, true);
	});

	test("accepts an expect block with an array of acceptable status codes", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.expect = { status: [200, 201] };
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, true);
	});

	test("rejects negative delayMs", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.delayMs = -100;
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});

	test("rejects zero or negative timeoutMs", () => {
		const manifest = validManifest() as { steps: Record<string, unknown>[] };
		manifest.steps[0]!.timeoutMs = 0;
		const result = manifestSchema.safeParse(manifest);
		assert.equal(result.success, false);
	});
});

describe("assertUniqueStepIds", () => {
	test("does not throw when all step ids are unique", () => {
		const manifest = manifestSchema.parse(validManifest());
		assert.doesNotThrow(() => assertUniqueStepIds(manifest));
	});

	test("throws when two steps share the same id", () => {
		const manifest = manifestSchema.parse(validManifest()) as ManifestConfig;
		manifest.steps.push({ ...manifest.steps[0]! });
		assert.throws(() => assertUniqueStepIds(manifest), /Duplicate step id/);
	});
});
