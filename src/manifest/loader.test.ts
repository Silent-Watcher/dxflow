import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { loadManifest, ManifestLoadError } from "./loader.js";

let workDir: string;

before(async () => {
	workDir = await mkdtemp(join(tmpdir(), "dx-flow-loader-test-"));
});

after(async () => {
	await rm(workDir, { recursive: true, force: true });
});

describe("loadManifest", () => {
	test("loads and validates a YAML manifest", async () => {
		const filePath = join(workDir, "scenario.yaml");
		await writeFile(
			filePath,
			[
				"name: Checkout flow",
				"baseUrl: https://api.example.com",
				"steps:",
				"  - id: createUser",
				"    method: POST",
				"    path: /users",
				"    body:",
				"      name: Ada",
			].join("\n"),
			"utf-8",
		);

		const manifest = await loadManifest(filePath);
		assert.equal(manifest.name, "Checkout flow");
		assert.equal(manifest.steps.length, 1);
		assert.equal(manifest.steps[0]?.id, "createUser");
	});

	test("loads and validates a .yml manifest", async () => {
		const filePath = join(workDir, "scenario.yml");
		await writeFile(
			filePath,
			"name: Short ext\nsteps:\n  - id: ping\n    method: GET\n    path: https://api.example.com/ping\n",
			"utf-8",
		);

		const manifest = await loadManifest(filePath);
		assert.equal(manifest.name, "Short ext");
	});

	test("loads and validates a JSON manifest", async () => {
		const filePath = join(workDir, "scenario.json");
		await writeFile(
			filePath,
			JSON.stringify({
				name: "JSON flow",
				baseUrl: "https://api.example.com",
				steps: [{ id: "ping", method: "GET", path: "/ping" }],
			}),
			"utf-8",
		);

		const manifest = await loadManifest(filePath);
		assert.equal(manifest.name, "JSON flow");
		assert.equal(manifest.steps[0]?.method, "GET");
	});

	test("throws ManifestLoadError for a nonexistent file", async () => {
		await assert.rejects(
			() => loadManifest(join(workDir, "does-not-exist.yaml")),
			ManifestLoadError,
		);
	});

	test("throws ManifestLoadError for an unsupported file extension", async () => {
		const filePath = join(workDir, "scenario.txt");
		await writeFile(filePath, "name: x", "utf-8");
		await assert.rejects(() => loadManifest(filePath), ManifestLoadError);
	});

	test("throws ManifestLoadError for malformed YAML", async () => {
		const filePath = join(workDir, "broken.yaml");
		await writeFile(filePath, "name: [unterminated\nsteps: -", "utf-8");
		await assert.rejects(() => loadManifest(filePath), ManifestLoadError);
	});

	test("throws ManifestLoadError for malformed JSON", async () => {
		const filePath = join(workDir, "broken.json");
		await writeFile(filePath, "{ not: valid json", "utf-8");
		await assert.rejects(() => loadManifest(filePath), ManifestLoadError);
	});

	test("throws ManifestLoadError when schema validation fails, with issue details in the message", async () => {
		const filePath = join(workDir, "invalid-schema.yaml");
		await writeFile(filePath, "name: No steps\nsteps: []\n", "utf-8");
		await assert.rejects(
			() => loadManifest(filePath),
			(error: unknown) => {
				assert.ok(error instanceof ManifestLoadError);
				assert.match(error.message, /steps/);
				return true;
			},
		);
	});

	test("throws ManifestLoadError when step ids are duplicated", async () => {
		const filePath = join(workDir, "duplicate-ids.yaml");
		await writeFile(
			filePath,
			[
				"name: Dup ids",
				"baseUrl: https://api.example.com",
				"steps:",
				"  - id: same",
				"    method: GET",
				"    path: /a",
				"  - id: same",
				"    method: GET",
				"    path: /b",
			].join("\n"),
			"utf-8",
		);

		await assert.rejects(() => loadManifest(filePath), /Duplicate step id/);
	});
});
