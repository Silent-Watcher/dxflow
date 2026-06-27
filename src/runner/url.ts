/**
 * Joins a base URL and a path, avoiding the classic double-slash or
 * missing-slash bugs. If `path` is already an absolute URL, it's returned
 * as-is (base is ignored), which lets individual steps hit a different host
 * when needed.
 */
export function buildUrl(
  baseUrl: string | undefined,
  path: string,
  query: Record<string, string> | undefined,
): string {
  const isAbsolute = /^https?:\/\//i.test(path);

  let url: URL;
  if (isAbsolute) {
    url = new URL(path);
  } else {
    if (!baseUrl) {
      throw new Error(
        `Step path "${path}" is relative but no "baseUrl" was set in the manifest`,
      );
    }
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    url = new URL(`${normalizedBase}${normalizedPath}`);
  }

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
