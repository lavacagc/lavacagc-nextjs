/**
 * Trim env vars defensively. Values pasted into dashboards sometimes carry
 * trailing whitespace, real newlines, or literal backslash-n sequences
 * (e.g. "abc\n" where \ and n are two separate characters). This helper
 * strips all three so downstream code doesn't fail opaquely.
 */
export function cleanEnv(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  // Strip literal "\r" or "\n" escape sequences at the end, then whitespace.
  const stripped = value.replace(/(?:\\r|\\n)+$/g, '').trim();
  return stripped || undefined;
}
