import { writeFile } from "node:fs/promises";
import type { ScenarioReport } from "../types.js";

/** Serializes the report to a pretty-printed JSON string. */
export function renderJsonReport(report: ScenarioReport): string {
	return JSON.stringify(report, null, 2);
}

/** Writes the JSON report to the given file path, creating/overwriting it. */
export async function writeJsonReport(
	report: ScenarioReport,
	outputPath: string,
): Promise<void> {
	await writeFile(outputPath, renderJsonReport(report), "utf-8");
}
