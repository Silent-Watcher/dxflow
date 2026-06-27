#!/usr/bin/env node
import { dirname, resolve as resolvePath } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadManifest, ManifestLoadError } from "./manifest/loader.js";
import {
	renderConsoleReport,
	renderStepLine,
} from "./report/console-reporter.js";
import { writeHtmlReport } from "./report/html-reporter.js";
import { writeJsonReport } from "./report/json-reporter.js";
import { runScenario } from "./runner/scenario-runner.js";
import { loadTransform } from "./transform/loader.js";
import type { ScenarioReport } from "./types.js";

export interface CliOptions {
	manifestPath: string;
	jsonOutputPath: string | undefined;
	htmlOutputPath: string | undefined;
	quiet: boolean;
}

export class CliArgumentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliArgumentError";
	}
}

/** Parses `dxflow run <manifest> [--json out.json] [--html out.html] [--quiet]` style args. */
export function parseCliArgs(argv: string[]): CliOptions {
	const [command, ...rest] = argv;

	if (command !== "run") {
		throw new CliArgumentError(
			`Unknown command "${command ?? ""}". Usage: dxflow run <manifest> [options]`,
		);
	}

	let manifestPath: string | undefined;
	let jsonOutputPath: string | undefined;
	let htmlOutputPath: string | undefined;
	let quiet = false;

	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i];
		if (arg === "--json") {
			jsonOutputPath = rest[++i];
		} else if (arg === "--html") {
			htmlOutputPath = rest[++i];
		} else if (arg === "--quiet") {
			quiet = true;
		} else if (arg && !arg.startsWith("--")) {
			manifestPath = arg;
		} else {
			throw new CliArgumentError(`Unknown option "${arg}"`);
		}
	}

	if (!manifestPath) {
		throw new CliArgumentError(
			"Missing required <manifest> argument. Usage: dxflow run <manifest> [options]",
		);
	}

	return { manifestPath, jsonOutputPath, htmlOutputPath, quiet };
}

/** Runs the full CLI flow for the given options, returning the resulting report. */
export async function executeCli(
	options: CliOptions,
	log: (message: string) => void = console.log,
): Promise<ScenarioReport> {
	const absoluteManifestPath = resolvePath(options.manifestPath);
	const manifest = await loadManifest(absoluteManifestPath);
	const manifestDir = dirname(absoluteManifestPath);

	const report = await runScenario(manifest, {
		manifestPath: options.manifestPath,
		loadTransform: (ref) => loadTransform(ref, manifestDir),
		onStepComplete: (result, index, total) => {
			if (!options.quiet) {
				log(renderStepLine(result, index, total));
			}
		},
	});

	if (!options.quiet) {
		log(renderConsoleReport(report));
	}

	if (options.jsonOutputPath) {
		await writeJsonReport(report, resolvePath(options.jsonOutputPath));
		log(`JSON report written to ${options.jsonOutputPath}`);
	}

	if (options.htmlOutputPath) {
		await writeHtmlReport(report, resolvePath(options.htmlOutputPath));
		log(`HTML report written to ${options.htmlOutputPath}`);
	}

	return report;
}

async function main(): Promise<void> {
	try {
		const options = parseCliArgs(process.argv.slice(2));
		const report = await executeCli(options);
		process.exitCode = report.success ? 0 : 1;
	} catch (error) {
		if (
			error instanceof CliArgumentError ||
			error instanceof ManifestLoadError
		) {
			console.error(`Error: ${error.message}`);
			process.exitCode = 1;
			return;
		}
		console.error("Unexpected error:", error);
		process.exitCode = 1;
	}
}

async function isRunDirectly(): Promise<boolean> {
	if (!process.argv[1]) return false;
	try {
		const { realpath } = await import("node:fs/promises");
		const [invokedPath, modulePath] = await Promise.all([
			realpath(process.argv[1]),
			realpath(fileURLToPath(import.meta.url)),
		]);
		return invokedPath === modulePath;
	} catch {
		return false;
	}
}

if (await isRunDirectly()) {
	void main();
}
