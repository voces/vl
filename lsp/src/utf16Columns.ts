// Column units at the seed boundary (D4490). The seed counts a column in UTF-8
// BYTES, since a VL string is bytes; the LSP counts it in UTF-16 code units, the
// protocol's default `positionEncoding` and the only one every client speaks.
// `wasmChecker.ts` converts every column through one of these maps, so nothing
// past it ever sees a byte column. Lines are `\n`-separated, as the lexer counts.

/** Column conversion over one source text. `line` is 0-based in both directions. */
export type ColumnMap = {
  /** A seed byte column on `line` as a UTF-16 column. */
  toUtf16: (line: number, byteCol: number) => number;
  /** An editor UTF-16 column on `line` as a seed byte column. */
  toByte: (line: number, utf16Col: number) => number;
};

const IDENTITY: ColumnMap = { toUtf16: (_l, c) => c, toByte: (_l, c) => c };

// UTF-8 width of the code unit at `i` (a high surrogate stands for its whole pair).
const unitBytes = (c: number): number =>
  c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3;

const build = (text: string): ColumnMap => {
  // An all-ASCII text has equal units: the common case pays one scan and nothing more.
  // deno-lint-ignore no-control-regex
  if (!/[^\x00-\x7f]/.test(text)) return IDENTITY;
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const span = (line: number): [number, number] | undefined => {
    if (line < 0 || line >= starts.length) return undefined;
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    return [starts[line], end];
  };
  // A column past the line's end keeps its excess unchanged: the units agree there.
  return {
    toUtf16: (line, byteCol) => {
      const s = span(line);
      if (s === undefined || byteCol <= 0) return byteCol;
      let bytes = 0;
      let i = s[0];
      while (i < s[1] && bytes < byteCol) {
        const w = unitBytes(text.charCodeAt(i));
        bytes += w;
        i += w === 4 ? 2 : 1;
      }
      return i - s[0] + Math.max(0, byteCol - bytes);
    },
    toByte: (line, utf16Col) => {
      const s = span(line);
      if (s === undefined || utf16Col <= 0) return utf16Col;
      const stop = s[0] + utf16Col;
      let bytes = 0;
      let i = s[0];
      while (i < s[1] && i < stop) {
        const w = unitBytes(text.charCodeAt(i));
        bytes += w;
        i += w === 4 ? 2 : 1;
      }
      return bytes + Math.max(0, stop - Math.max(i, s[1]));
    },
  };
};

/** The map for `text`, memoised on the last few texts (one query reads several).
 *  An unknown text (`undefined`) maps by identity: a column left in bytes is off by
 *  the line's excess, never dropped. */
const cache = new Map<string, ColumnMap>();
export const columnMap = (text: string | undefined): ColumnMap => {
  if (text === undefined) return IDENTITY;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const m = build(text);
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(text, m);
  return m;
};
