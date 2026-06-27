import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { HttpTimeoutError, sendHttpRequest } from "./http-client.js";

const originalFetch = globalThis.fetch;

function mockJsonResponse(
	status: number,
	body: unknown,
	extraHeaders: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		statusText: status === 200 ? "OK" : "",
		headers: { "content-type": "application/json", ...extraHeaders },
	});
}

describe("sendHttpRequest", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
		mock.reset();
	});

	test("sends the request with the given method, url, and headers", async () => {
		const fetchMock = mock.fn(async (url: string | URL, init?: RequestInit) => {
			assert.equal(url.toString(), "https://api.example.com/users");
			assert.equal(init?.method, "POST");
			assert.equal(
				(init?.headers as Record<string, string>)["Authorization"],
				"Bearer xyz",
			);
			return mockJsonResponse(201, { id: 1 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await sendHttpRequest({
			method: "POST",
			url: "https://api.example.com/users",
			headers: { Authorization: "Bearer xyz" },
			body: { name: "Ada" },
			timeoutMs: 5000,
		});

		assert.equal(fetchMock.mock.calls.length, 1);
	});

	test("parses a JSON response body and reports isJson true", async () => {
		globalThis.fetch = mock.fn(async () =>
			mockJsonResponse(200, { id: 42, name: "Ada" }),
		) as unknown as typeof fetch;

		const result = await sendHttpRequest({
			method: "GET",
			url: "https://api.example.com/users/42",
			headers: {},
			body: undefined,
			timeoutMs: 5000,
		});

		assert.equal(result.response.status, 200);
		assert.equal(result.response.isJson, true);
		assert.deepEqual(result.response.body, { id: 42, name: "Ada" });
	});

	test("falls back to raw text when the body is not valid JSON", async () => {
		globalThis.fetch = mock.fn(
			async () =>
				new Response("plain text response", {
					status: 200,
					headers: { "content-type": "text/plain" },
				}),
		) as unknown as typeof fetch;

		const result = await sendHttpRequest({
			method: "GET",
			url: "https://api.example.com/health",
			headers: {},
			body: undefined,
			timeoutMs: 5000,
		});

		assert.equal(result.response.isJson, false);
		assert.equal(result.response.body, "plain text response");
	});

	test("returns undefined body for an empty response", async () => {
		globalThis.fetch = mock.fn(
			async () => new Response(null, { status: 204 }),
		) as unknown as typeof fetch;

		const result = await sendHttpRequest({
			method: "DELETE",
			url: "https://api.example.com/users/42",
			headers: {},
			body: undefined,
			timeoutMs: 5000,
		});

		assert.equal(result.response.status, 204);
		assert.equal(result.response.body, undefined);
		assert.equal(result.response.isJson, false);
	});

	test("serializes a JSON body and sets Content-Type when not already set", async () => {
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedInit = init;
				return mockJsonResponse(200, {});
			},
		) as unknown as typeof fetch;

		await sendHttpRequest({
			method: "POST",
			url: "https://api.example.com/users",
			headers: {},
			body: { name: "Ada" },
			timeoutMs: 5000,
		});

		assert.equal(capturedInit?.body, JSON.stringify({ name: "Ada" }));
		assert.equal(
			(capturedInit?.headers as Record<string, string>)["Content-Type"],
			"application/json",
		);
	});

	test("does not overwrite an explicitly set Content-Type header", async () => {
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedInit = init;
				return mockJsonResponse(200, {});
			},
		) as unknown as typeof fetch;

		await sendHttpRequest({
			method: "POST",
			url: "https://api.example.com/users",
			headers: { "Content-Type": "application/vnd.custom+json" },
			body: { name: "Ada" },
			timeoutMs: 5000,
		});

		assert.equal(
			(capturedInit?.headers as Record<string, string>)["Content-Type"],
			"application/vnd.custom+json",
		);
	});

	test("passes a string body through unchanged", async () => {
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock.fn(
			async (_url: string | URL, init?: RequestInit) => {
				capturedInit = init;
				return mockJsonResponse(200, {});
			},
		) as unknown as typeof fetch;

		await sendHttpRequest({
			method: "POST",
			url: "https://api.example.com/raw",
			headers: {},
			body: "raw-payload" as unknown as Record<string, never>,
			timeoutMs: 5000,
		});

		assert.equal(capturedInit?.body, "raw-payload");
	});

	test("measures duration as non-negative and endedAt >= startedAt", async () => {
		globalThis.fetch = mock.fn(async () =>
			mockJsonResponse(200, {}),
		) as unknown as typeof fetch;

		const result = await sendHttpRequest({
			method: "GET",
			url: "https://api.example.com/ping",
			headers: {},
			body: undefined,
			timeoutMs: 5000,
		});

		assert.ok(result.durationMs >= 0);
		assert.ok(result.endedAt >= result.startedAt);
	});

	test("throws HttpTimeoutError when the request exceeds timeoutMs", async () => {
		globalThis.fetch = mock.fn((_url: string | URL, init?: RequestInit) => {
			return new Promise((_resolve, reject) => {
				const signal = init?.signal;
				signal?.addEventListener("abort", () => {
					reject(new DOMException("aborted", "AbortError"));
				});
			});
		}) as unknown as typeof fetch;

		await assert.rejects(
			() =>
				sendHttpRequest({
					method: "GET",
					url: "https://api.example.com/slow",
					headers: {},
					body: undefined,
					timeoutMs: 10,
				}),
			HttpTimeoutError,
		);
	});

	test("propagates non-abort fetch errors unchanged", async () => {
		globalThis.fetch = mock.fn(async () => {
			throw new Error("DNS resolution failed");
		}) as unknown as typeof fetch;

		await assert.rejects(
			() =>
				sendHttpRequest({
					method: "GET",
					url: "https://nonexistent.invalid/x",
					headers: {},
					body: undefined,
					timeoutMs: 5000,
				}),
			/DNS resolution failed/,
		);
	});

	test("captures response headers", async () => {
		globalThis.fetch = mock.fn(async () =>
			mockJsonResponse(200, {}, { "x-request-id": "abc-123" }),
		) as unknown as typeof fetch;

		const result = await sendHttpRequest({
			method: "GET",
			url: "https://api.example.com/ping",
			headers: {},
			body: undefined,
			timeoutMs: 5000,
		});

		assert.equal(result.response.headers["x-request-id"], "abc-123");
	});
});
