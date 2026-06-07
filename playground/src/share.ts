/// <reference lib="dom" />
// Shareable-link encoding/decoding for the VL playground (ROADMAP E4).
//
// The URL hash encodes the editor source so a link reproduces it exactly.
// Format: `#v1:<base64>` where the base64 payload is the UTF-8 source
// compressed with deflate-raw via the browser's CompressionStream API.
// A plain-base64 fallback (`#v0:<base64>`) is written when CompressionStream
// is unavailable (very old browsers). Both are decoded on load.
//
// CompressionStream is available in all modern browsers and in Deno ≥ 1.33.
// The resulting URLs are substantially shorter than raw base64 for real source
// (typical playground program ~500 bytes → ~200 bytes of compressed base64).

const PREFIX_DEFLATE = "v1:";
const PREFIX_PLAIN = "v0:";

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

// TextEncoder.encode() returns `Uint8Array<ArrayBufferLike>` in Deno's types,
// but WritableStreamDefaultWriter.write() expects `Uint8Array<ArrayBuffer>`.
// Slicing produces a fresh Uint8Array with a plain ArrayBuffer.
const textEncode = (s: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(s).slice() as Uint8Array<ArrayBuffer>;

const toBase64 = (buf: Uint8Array): string => {
  // btoa requires a binary string.
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
};

const compress = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
};

/** Encode `source` into a URL hash fragment string (including the leading `#`). */
export const encodeSource = async (source: string): Promise<string> => {
  const raw = textEncode(source);
  try {
    const compressed = await compress(raw);
    return "#" + PREFIX_DEFLATE + toBase64(compressed);
  } catch {
    // Fall back to plain base64 if CompressionStream is broken/unavailable.
    return "#" + PREFIX_PLAIN + toBase64(raw);
  }
};

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf as Uint8Array<ArrayBuffer>;
};

const decompress = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
};

/**
 * Attempt to decode a URL hash fragment into a source string.
 * Returns `null` if the hash is absent, unrecognised, or malformed — the
 * caller should fall back to the default sample.
 */
export const decodeHash = async (hash: string): Promise<string | null> => {
  if (!hash || hash === "#") return null;
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    if (fragment.startsWith(PREFIX_DEFLATE)) {
      const b64 = fragment.slice(PREFIX_DEFLATE.length);
      const compressed = fromBase64(b64);
      const decompressed = await decompress(compressed);
      return new TextDecoder().decode(decompressed);
    }
    if (fragment.startsWith(PREFIX_PLAIN)) {
      const b64 = fragment.slice(PREFIX_PLAIN.length);
      return new TextDecoder().decode(fromBase64(b64));
    }
  } catch {
    // Malformed payload — fall through and return null.
  }
  return null;
};
