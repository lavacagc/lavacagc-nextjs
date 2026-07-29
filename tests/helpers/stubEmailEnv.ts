import { test } from '@playwright/test';

/**
 * Deterministic, unreachable credentials for specs that drive the real email
 * sender in-process (rather than asserting its source).
 *
 * Call this once at the top level of the spec. It applies the stub in a
 * beforeAll and puts the previous values back in an afterAll, so the mutation
 * lives only as long as this file's tests. The module under test must then be
 * pulled in INSIDE a test rather than at the top of the file:
 * src/lib/notify/supabase-rest reads NEXT_PUBLIC_SUPABASE_URL when it loads,
 * so it has to load after the stub is in place.
 *
 * Assigning at module scope instead would be simpler and would allow a plain
 * top-level import, but it cannot be contained. process.env is process-wide,
 * and Playwright loads every spec file up front in the runner process to
 * enumerate tests - before any hook has run. A module-scope assignment
 * therefore lands in the runner, and each worker forked from it inherits the
 * stub at spawn, for every spec file, for the whole run. Specs that gate
 * themselves on real credentials (lead-submit-sanitize,
 * lead-submit-notifications, listings-gate) would stop skipping and point at
 * the `.invalid` host instead. A teardown cannot repair that either: by the
 * time a worker records the "previous" value it has already inherited the
 * stub, so the restore puts the stub back.
 *
 * Set unconditionally - never `||=`. A developer with real credentials in the
 * environment must not have a stubbed-fetch test point at a live project, and a
 * `.invalid` host (RFC 2606) cannot resolve even if a stub is ever missed.
 */
const STUB: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://email-log-audit.invalid',
  SUPABASE_SECRET_KEY: 'test-secret',
  RESEND_API_KEY: 're_test_key',
};

export function stubEmailEnv(): void {
  const previous: Record<string, string | undefined> = {};

  test.beforeAll(() => {
    for (const [key, value] of Object.entries(STUB)) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
