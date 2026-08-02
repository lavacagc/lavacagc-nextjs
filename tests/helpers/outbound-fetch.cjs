/**
 * A `node --require` preload for the Next server under the intake E2E run.
 *
 * Two jobs, both of which have to happen underneath the application:
 *
 * 1. Point api.telegram.org at the local stub. `telegramMessage.ts` hardcodes
 *    the host - correctly, there is no reason for production code to carry a
 *    test seam - so the redirect belongs out here.
 *
 * 2. Record every outbound URL the server requests, to a file. The central
 *    claim of this feature is that the conversation makes NO model call, and
 *    the honest way to show that is the list of hosts the server actually
 *    reached while a lead walked the whole flow, not a grep for imports.
 *
 * Loaded before Next, so Next's own fetch wrapper sits on top of this one and
 * every application call still passes through here.
 *
 *   NODE_OPTIONS='--require ./tests/helpers/outbound-fetch.cjs' \
 *   INTAKE_STUB_URL=http://127.0.0.1:9416 \
 *   INTAKE_FETCH_LOG=/tmp/outbound.log \
 *   npx next dev -p 3100
 */
const fs = require('fs');

const STUB = process.env.INTAKE_STUB_URL || 'http://127.0.0.1:9416';
const LOG = process.env.INTAKE_FETCH_LOG;
const TELEGRAM = 'https://api.telegram.org/';

const original = globalThis.fetch;

/** Synchronous on purpose: a queued write is lost when the process is killed. */
function record(url) {
  if (!LOG) return;
  try {
    fs.appendFileSync(LOG, `${url}\n`);
  } catch {
    // A log we cannot write must not break the request being logged.
  }
}

globalThis.fetch = function patchedFetch(input, init) {
  const url =
    typeof input === 'string' ? input : input && input.url ? input.url : String(input);

  if (url.startsWith(TELEGRAM)) {
    record(url);
    return original(`${STUB}/telegram/${url.slice(TELEGRAM.length)}`, init);
  }

  // Only outbound calls are interesting. The stub is the test harness itself.
  if (/^https?:\/\//.test(url) && !url.startsWith(STUB)) record(url);

  return original(input, init);
};
