import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RunContext } from "../types.js";
import {
	resolvePath,
	resolveStringRecord,
	resolveTemplateString,
	resolveTemplatesDeep,
	TemplateResolutionError,
} from "./resolve.js";

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
	return {
		scenarioName: "test scenario",
		baseUrl: "https://api.example.com",
		vars: { apiKey: "secret-123" },
		steps: {
			createUser: {
				id: "createUser",
				status: 201,
				statusText: "Created",
				headers: { "content-type": "application/json" },
				body: { id: 42, token: "abc.def.ghi", items: [{ sku: "X1" }] },
				isJson: true,
				requestBody: { name: "Ada" },
				durationMs: 10,
			},
		},
		...overrides,
	};
}

describe("resolvePath", () => {
	test("resolves a nested path through steps and response body", () => {
		const context = makeContext();
		assert.equal(resolvePath("steps.createUser.body.id", context), 42);
	});

	test("resolves array indices", () => {
		const context = makeContext();
		assert.equal(
			resolvePath("steps.createUser.body.items.0.sku", context),
			"X1",
		);
	});

	test("resolves manifest-level vars", () => {
		const context = makeContext();
		assert.equal(resolvePath("vars.apiKey", context), "secret-123");
	});

	test("throws when an intermediate segment is undefined", () => {
		const context = makeContext();
		assert.throws(
			() => resolvePath("steps.nonexistentStep.body.id", context),
			TemplateResolutionError,
		);
	});

	test("throws when the final value is undefined", () => {
		const context = makeContext();
		assert.throws(
			() => resolvePath("steps.createUser.body.missingField", context),
			TemplateResolutionError,
		);
	});

	test("throws on empty expression", () => {
		const context = makeContext();
		assert.throws(() => resolvePath("   ", context), TemplateResolutionError);
	});

	test("throws when traversing into a non-object", () => {
		const context = makeContext();
		assert.throws(
			() => resolvePath("steps.createUser.body.id.nested", context),
			TemplateResolutionError,
		);
	});
});

describe("resolveTemplateString", () => {
	test("returns plain strings unchanged", () => {
		const context = makeContext();
		assert.equal(resolveTemplateString("hello world", context), "hello world");
	});

	test("preserves native type for an exact single-template match", () => {
		const context = makeContext();
		const result = resolveTemplateString(
			"{{steps.createUser.body.id}}",
			context,
		);
		assert.equal(result, 42);
		assert.equal(typeof result, "number");
	});

	test("preserves object type for an exact single-template match", () => {
		const context = makeContext();
		const result = resolveTemplateString(
			"{{steps.createUser.body.items.0}}",
			context,
		);
		assert.deepEqual(result, { sku: "X1" });
	});

	test("stringifies and interpolates when embedded in surrounding text", () => {
		const context = makeContext();
		const result = resolveTemplateString(
			"Bearer {{steps.createUser.body.token}}",
			context,
		);
		assert.equal(result, "Bearer abc.def.ghi");
	});

	test("interpolates multiple templates in one string", () => {
		const context = makeContext();
		const result = resolveTemplateString(
			"/users/{{steps.createUser.body.id}}/items/{{steps.createUser.body.items.0.sku}}",
			context,
		);
		assert.equal(result, "/users/42/items/X1");
	});

	test("handles whitespace inside template braces", () => {
		const context = makeContext();
		const result = resolveTemplateString(
			"{{ steps.createUser.body.id }}",
			context,
		);
		assert.equal(result, 42);
	});
});

describe("resolveTemplatesDeep", () => {
	test("returns undefined for undefined input", () => {
		const context = makeContext();
		assert.equal(resolveTemplatesDeep(undefined, context), undefined);
	});

	test("walks nested objects and arrays, resolving templates within", () => {
		const context = makeContext();
		const result = resolveTemplatesDeep(
			{
				userId: "{{steps.createUser.body.id}}",
				nested: { token: "{{steps.createUser.body.token}}" },
				list: ["{{steps.createUser.body.items.0.sku}}", "static"],
			},
			context,
		);
		assert.deepEqual(result, {
			userId: 42,
			nested: { token: "abc.def.ghi" },
			list: ["X1", "static"],
		});
	});

	test("leaves non-string primitives untouched", () => {
		const context = makeContext();
		assert.equal(resolveTemplatesDeep(123, context), 123);
		assert.equal(resolveTemplatesDeep(true, context), true);
		assert.equal(resolveTemplatesDeep(null, context), null);
	});
});

describe("resolveStringRecord", () => {
	test("returns empty object for undefined input", () => {
		const context = makeContext();
		assert.deepEqual(resolveStringRecord(undefined, context), {});
	});

	test("resolves each value in the record, stringifying non-string results", () => {
		const context = makeContext();
		const result = resolveStringRecord(
			{
				Authorization: "Bearer {{steps.createUser.body.token}}",
				"X-User-Id": "{{steps.createUser.body.id}}",
			},
			context,
		);
		assert.deepEqual(result, {
			Authorization: "Bearer abc.def.ghi",
			"X-User-Id": "42",
		});
	});
});
