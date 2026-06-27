import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildUrl } from "./url.js";

describe("buildUrl", () => {
	test("joins a base URL and a relative path with a leading slash", () => {
		assert.equal(
			buildUrl("https://api.example.com", "/users", undefined),
			"https://api.example.com/users",
		);
	});

	test("joins a base URL and a relative path without a leading slash", () => {
		assert.equal(
			buildUrl("https://api.example.com", "users", undefined),
			"https://api.example.com/users",
		);
	});

	test("avoids a double slash when base ends with '/'", () => {
		assert.equal(
			buildUrl("https://api.example.com/", "/users", undefined),
			"https://api.example.com/users",
		);
	});

	test("preserves a base path prefix", () => {
		assert.equal(
			buildUrl("https://api.example.com/v2", "/users", undefined),
			"https://api.example.com/v2/users",
		);
	});

	test("uses an absolute path as-is, ignoring baseUrl", () => {
		assert.equal(
			buildUrl(
				"https://api.example.com",
				"https://other-host.com/ping",
				undefined,
			),
			"https://other-host.com/ping",
		);
	});

	test("throws when path is relative and no baseUrl is given", () => {
		assert.throws(() => buildUrl(undefined, "/users", undefined), /baseUrl/);
	});

	test("appends query params", () => {
		const url = buildUrl("https://api.example.com", "/users", {
			page: "2",
			limit: "10",
		});
		const parsed = new URL(url);
		assert.equal(parsed.searchParams.get("page"), "2");
		assert.equal(parsed.searchParams.get("limit"), "10");
	});

	test("ignores an empty query object", () => {
		assert.equal(
			buildUrl("https://api.example.com", "/users", {}),
			"https://api.example.com/users",
		);
	});

	test("encodes special characters in query values", () => {
		const url = buildUrl("https://api.example.com", "/search", {
			q: "hello world & friends",
		});
		const parsed = new URL(url);
		assert.equal(parsed.searchParams.get("q"), "hello world & friends");
	});
});
