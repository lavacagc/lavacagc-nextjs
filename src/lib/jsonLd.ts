/**
 * JSON for a `<script type="application/ld+json">`. `<` is escaped so text
 * such as `</script>` inside a title, description or answer cannot end the
 * script element early. Use it for every JSON-LD block that carries
 * database-written content (articles, projects, home services).
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
