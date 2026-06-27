import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { TransformFn } from "../types.js";

export class TransformLoadError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "TransformLoadError";
	}
}

/**
 * Parses a transform reference of the form "relative/path.ts#exportName" into
 * its file path and export name parts.
 */
export function parseTransformRef(ref: string): {
	filePath: string;
	exportName: string;
} {
	const hashIndex = ref.lastIndexOf("#");
	if (hashIndex === -1 || hashIndex === ref.length - 1) {
		throw new TransformLoadError(
			`Invalid transform reference "${ref}". Expected format: "path/to/file.ts#exportName"`,
		);
	}
	const filePath = ref.slice(0, hashIndex);
	const exportName = ref.slice(hashIndex + 1);
	if (filePath.length === 0 || exportName.length === 0) {
		throw new TransformLoadError(
			`Invalid transform reference "${ref}". Expected format: "path/to/file.ts#exportName"`,
		);
	}
	return { filePath, exportName };
}

/**
 * Loads a transform function from a manifest-relative module reference.
 * `manifestDir` is the directory containing the manifest file, used to
 * resolve relative transform paths.
 */
export async function loadTransform(
	ref: string,
	manifestDir: string,
): Promise<TransformFn> {
	const { filePath, exportName } = parseTransformRef(ref);

	const absolutePath = isAbsolute(filePath)
		? filePath
		: resolvePath(manifestDir, filePath);
	const moduleUrl = pathToFileURL(absolutePath).href;

	let mod: Record<string, unknown>;
	try {
		mod = (await import(moduleUrl)) as Record<string, unknown>;
	} catch (error) {
		throw new TransformLoadError(
			`Failed to load transform module "${filePath}" (resolved to "${absolutePath}")`,
			error,
		);
	}

	const exported = mod[exportName];
	if (typeof exported !== "function") {
		throw new TransformLoadError(
			`Module "${filePath}" does not export a function named "${exportName}"`,
		);
	}

	return exported as TransformFn;
}

/** Exposed for tests that need the manifest directory derivation logic. */
export function manifestDirOf(manifestFilePath: string): string {
	return dirname(resolvePath(manifestFilePath));
}
