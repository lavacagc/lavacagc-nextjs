/**
 * Read a JSON body without ever buffering more than `maxBytes`.
 *
 * Content-Length is checked first (cheap refusal), then the stream is read and
 * abandoned as soon as it passes the cap, because Content-Length is optional
 * (chunked bodies) and can lie.
 */
export type CappedJson =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

export async function readCappedJson(request: Request, maxBytes: number): Promise<CappedJson> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: 'Body too large' };
  }
  if (!request.body) return { ok: false, status: 400, error: 'Invalid JSON body' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: 'Body too large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}
