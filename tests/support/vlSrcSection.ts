// THE `vl-src` CUSTOM SECTION, READ IN TYPESCRIPT — the Deno host's half of ROADMAP row 22.
//
// A wasm trap frame is an offset plus a name-section string, and a name-section string can
// only be per FUNCTION — so `boom@3` is where `boom` was DECLARED, not where it trapped. The
// emitter writes `[from, to)` rows over the module's own bytes carrying the line and column
// each range's source anchor sits on; joining the frame's offset against them gives the
// trapping statement.
//
// THE JOIN KEY IS THE SAME NUMBER IN BOTH ENGINES, and that is measured rather than assumed.
// wasmtime's `FrameInfo::module_offset()` and V8's `wasm-function[N]:0xNNN` print the SAME
// offsets for the same trap (`0x118` / `0x127` on this row's own control), so this reader and
// the native one join identically and one expected block grades both.
//
// This file is host-agnostic on purpose: it takes bytes and a stack string and returns lines.
// The playground needs the same two pieces plus a browser trap position — see ROADMAP row 22.

/** One `[from, to)` byte range of the module, and where its source anchor is. */
export type SrcRow = {
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly col: number;
  readonly file: number;
};

export type SrcMap = {
  /** Entry-relative paths, indexed by module id. `""` for a single-file compile. */
  readonly files: readonly string[];
  readonly rows: readonly SrcRow[];
};

/** A cursor over the module bytes; every read is bounds-checked, since this parses a
 * section the host did not necessarily emit. */
type Cursor = { readonly b: Uint8Array; i: number };

/** One ULEB128, or `undefined` on a truncated or over-long encoding. */
const uleb = (c: Cursor): number | undefined => {
  let v = 0;
  let shift = 0;
  for (;;) {
    if (c.i >= c.b.length) return undefined;
    const byte = c.b[c.i++];
    v += (byte & 0x7f) * Math.pow(2, shift);
    if (byte < 0x80) return v;
    shift += 7;
    if (shift > 28) return undefined;
  }
};

/** A length-prefixed UTF-8 name. */
const wasmName = (c: Cursor): string | undefined => {
  const n = uleb(c);
  if (n === undefined) return undefined;
  const end = c.i + n;
  if (end > c.b.length) return undefined;
  const s = new TextDecoder().decode(c.b.subarray(c.i, end));
  c.i = end;
  return s;
};

/**
 * Find and decode the `vl-src` custom section. `undefined` for any module without one — a
 * build with no `--names`, a module from an older seed, or one from another producer — and
 * for a malformed one, so a frame then renders exactly as it did before.
 */
export const parseVlSrc = (bytes: Uint8Array): SrcMap | undefined => {
  if (bytes.length < 8) return undefined;
  if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    return undefined;
  }
  const c: Cursor = { b: bytes, i: 8 };
  while (c.i < bytes.length) {
    const id = bytes[c.i++];
    const size = uleb(c);
    if (size === undefined) return undefined;
    const end = c.i + size;
    if (end > bytes.length) return undefined;
    if (id === 0) {
      const save = c.i;
      if (wasmName(c) === "vl-src") {
        const nfiles = uleb(c);
        if (nfiles === undefined) return undefined;
        const files: string[] = [];
        for (let f = 0; f < nfiles; f++) {
          const name = wasmName(c);
          if (name === undefined) return undefined;
          files.push(name);
        }
        const nrows = uleb(c);
        if (nrows === undefined) return undefined;
        const rows: SrcRow[] = [];
        for (let r = 0; r < nrows; r++) {
          const from = uleb(c);
          const to = uleb(c);
          const line = uleb(c);
          const col = uleb(c);
          const file = uleb(c);
          if (
            from === undefined || to === undefined || line === undefined ||
            col === undefined || file === undefined
          ) return undefined;
          rows.push({ from, to, line, col, file });
        }
        return { files, rows };
      }
      c.i = save;
    }
    c.i = end;
  }
  return undefined;
};

/**
 * The NARROWEST row containing `off`. Narrowest because a statement's range nests inside its
 * function's and the statement is the precise answer; the emitter drops rows with no source
 * position, so every row here carries one.
 */
export const locate = (
  map: SrcMap,
  off: number,
): { file: string; line: number; col: number } | undefined => {
  let best: SrcRow | undefined;
  for (const r of map.rows) {
    if (off < r.from || off >= r.to) continue;
    if (best === undefined || r.to - r.from < best.to - best.from) best = r;
  }
  if (best === undefined) return undefined;
  return { file: map.files[best.file] ?? "", line: best.line, col: best.col };
};

/**
 * The column a diagnostic prints for a guest column — the native host's `display_col`, which
 * is an unconditional `+ 1` because the guest counts from 0 and a reader counts from 1. Any
 * cleverness here (a 0 left alone as "no column", say) is a drift between the two hosts that
 * one expected block would catch, which is why this is spelled the same way twice.
 */
export const displayCol = (col: number): number => col + 1;

/** Every wasm frame of a V8 stack, innermost first: the function name (absent when the
 * module carries no name section) and the module byte offset. */
export const wasmFrames = (
  stack: string | undefined,
): { name?: string; offset: number }[] => {
  if (!stack) return [];
  const out: { name?: string; offset: number }[] = [];
  for (const rawLine of stack.split("\n")) {
    const m = rawLine.trim().match(
      /at\s+(?:([^\s(]+)\s+\()?wasm:\/\/[^\s:]+:wasm-function\[\d+\]:0x([0-9a-fA-F]+)/,
    );
    if (!m) continue;
    const name = m[1] && m[1] !== "<anonymous>" ? m[1] : undefined;
    out.push({ name, offset: parseInt(m[2], 16) });
  }
  return out;
};

/**
 * The `at <file>:<line>:<col>  in \`fn\`` lines for a trap, innermost first — byte-for-byte
 * what the native host's `source_frames` prints, so one expected block grades both hosts.
 * Empty when the module carries no section or no frame resolves.
 */
export const sourceFrames = (
  bytes: Uint8Array,
  stack: string | undefined,
): string[] => {
  const map = parseVlSrc(bytes);
  if (!map) return [];
  const out: string[] = [];
  for (const frame of wasmFrames(stack)) {
    const at = locate(map, frame.offset);
    if (!at) continue;
    // The name section's own `@file:line` suffix is the DECLARATION's and this line is the
    // instruction's; printing both would read as a contradiction, so the suffix is cut.
    const name = frame.name?.split("@")[0] ?? "";
    const where = at.file
      ? `${at.file}:${at.line}:${displayCol(at.col)}`
      : `${at.line}:${displayCol(at.col)}`;
    out.push(name ? `at ${where}  in \`${name}\`` : `at ${where}`);
  }
  return out;
};
