// Neutral diagnostic vocabulary — the LSP-facing diagnostic shape, with NO
// dependency on the compiler core (lexer/parser/typecheck/emit). Both the
// compiler (`compile.ts`, which re-exports these for its existing consumers) and
// the LSP host import these types from here, so an LSP module that only needs the
// diagnostic shape does not pull in the whole compiler through `compile.ts` — a
// step toward the LSP depending only on the self-hosted wasm checker (kill-TS).

// `hint` is the lowest tier: VS Code renders it with NO squiggle and keeps it out
// of the warning/error count. Combined with the `unnecessary` tag it greys out the
// span (used for `_`-prefixed intentionally-unused bindings). Hints must never
// count toward the CLI error/warning tally or fail the test harness.
export type VLSeverity = "error" | "warning" | "info" | "hint";

export type VLPosition = { line: number; character: number };
export type VLRange = { start: VLPosition; end: VLPosition };

// LSP diagnostic tags (LSP `DiagnosticTag`): `unnecessary` renders the span
// faded/greyed out (VS Code dims unused/unreachable code rather than only
// squiggling it); `deprecated` strikes it through. The lint pass tags
// unused-variable / unreachable-code as `unnecessary`.
export type VLDiagnosticTag = "unnecessary" | "deprecated";

/**
 * A coded diagnostic's STRUCTURED PAYLOAD, keyed by field name.
 *
 * Every value is a LIST because repetition is how the wire format spells one —
 * `ufcs-not-imported` emits one `modules` field per candidate module. A
 * single-valued field is a one-element list, so there is one shape and no
 * separator inside any value.
 */
export type VLDiagnosticData = Record<string, string[]>;

export type VLDiagnostic = {
  message: string;
  severity: VLSeverity;
  range: VLRange;
  /**
   * The stable CATEGORY — `unsupported-lowering`, `prefer-const`,
   * `ufcs-not-imported`. A bare word: everything a category needs to SAY rides
   * {@link VLDiagnostic.data}, so this is compared with `===`.
   */
  code?: string | number;
  /** The `diagDataLen`/`diagDataByte` payload, decoded. Absent when empty. */
  data?: VLDiagnosticData;
  source: "vital";
  tags?: VLDiagnosticTag[];
};

/**
 * Decode the compiler's `diagDataLen`/`diagDataByte` payload.
 *
 * THE WIRE FORMAT, which `compiler/typecheck.vl`'s `diagDataField` writes: a flat
 * sequence of netstrings — `<byte-length> ":" <bytes> ","` — read as alternating
 * KEY and VALUE. The length is authoritative, so a value may hold any byte (`;`,
 * `,`, a `"` from a string-literal type member, a newline) with nothing escaped.
 * A repeated key is a LIST, in wire order.
 *
 * IT TAKES BYTES, NOT A STRING, AND THAT IS LOAD-BEARING. The length is a UTF-8
 * byte count (a VL string's `.length`), which is not a JS string's `.length` the
 * moment a type name carries a non-ASCII character.
 *
 * A malformed payload yields `{}` rather than a partial read: this is a channel
 * between two halves of one toolchain, so disagreement means a seed/host mismatch
 * and half an answer is worse than none.
 */
export const decodeDiagData = (bytes: Uint8Array): VLDiagnosticData => {
  const decoder = new TextDecoder();
  const fields: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let colon = i;
    while (colon < bytes.length && bytes[colon] !== 0x3a) colon++;
    if (colon === i || colon === bytes.length) return {};
    let len = 0;
    for (let d = i; d < colon; d++) {
      const digit = bytes[d] - 0x30;
      if (digit < 0 || digit > 9) return {};
      len = len * 10 + digit;
    }
    const start = colon + 1;
    const end = start + len;
    if (end >= bytes.length || bytes[end] !== 0x2c) return {};
    fields.push(decoder.decode(bytes.subarray(start, end)));
    i = end + 1;
  }
  if (fields.length % 2 !== 0) return {};
  const data: VLDiagnosticData = {};
  for (let k = 0; k < fields.length; k += 2) {
    (data[fields[k]] ??= []).push(fields[k + 1]);
  }
  return data;
};
