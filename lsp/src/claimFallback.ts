// The TS hosts' half of the invalid-module report (the native host's is `invalid_headline` in
// scripts/vl-host): a claimed module the engine refuses is the compiler's bug, located in the
// source by the guest's spans, and a claim that recorded a refusal is named beside the compile's.

/** The seed exports the fallback reads; a seed without them never takes a claim it can report. */
export type ClaimExports = {
  irShadowRowCount?: () => number;
  irShadowRowLen?: (i: number) => number;
  irShadowRowAt?: (i: number, j: number) => number;
  irShadowArm?: (mode: number) => number;
};

const CLAIMED = "claimed";

/** Whether the compile that just ran took an IR claim: the guest counts a `claimed …` row per
 * claimed unit even unarmed. */
export const claimsTaken = (exp: ClaimExports): boolean => {
  const { irShadowRowCount: count, irShadowRowLen: len, irShadowRowAt: at } = exp;
  if (count === undefined || len === undefined || at === undefined) return false;
  for (let i = 0; i < count(); i++) {
    if (len(i) < CLAIMED.length) continue;
    let hit = true;
    for (let j = 0; j < CLAIMED.length && hit; j++) hit = at(i, j) === CLAIMED.charCodeAt(j);
    if (hit) return true;
  }
  return false;
};

/** Whether `bytes`, a claimed compile's module, fails validation: the compiler's bug. */
export const invalidClaimedModule = (exp: ClaimExports, bytes: Uint8Array): boolean =>
  claimsTaken(exp) && !WebAssembly.validate(bytes as Uint8Array<ArrayBuffer>);

/** The guest exports that locate a module byte offset in its source (the native `EmitSpans`). */
export type SpanExports = ClaimExports & {
  emitFnSpanAt?: (off: number) => number;
  emitFnSpanLine?: (i: number) => number;
  emitFnSpanCol?: (i: number) => number;
  emitFnSpanModule?: (i: number) => number;
  emitFnSpanNameLen?: (i: number) => number;
  emitFnSpanNameAt?: (i: number, j: number) => number;
  emitFnSpanKindOf?: (i: number) => number;
  modKeyCount?: () => number;
  modKeyAtLen?: (m: number) => number;
  modKeyAtCharAt?: (m: number, j: number) => number;
};

/** The engine's refusal of `bytes` as V8 words it, or "" when the module compiles. */
export const engineRefusal = (bytes: Uint8Array): string => {
  try {
    new WebAssembly.Module(bytes as Uint8Array<ArrayBuffer>);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

/** The byte offset an engine message names: V8's `@+N`, else wasmtime's `at offset N`. */
const failOffset = (msg: string): number => {
  const v8 = /@\+(\d+)\s*$/.exec(msg);
  if (v8) return Number(v8[1]);
  const wt = [...msg.matchAll(/at offset (0x[0-9a-fA-F]+|\d+)/g)].pop();
  return wt ? Number(wt[1]) : -1;
};

/** The validator's own sentence: V8's text after `failed: `, without the trailing offset. */
const sentenceOf = (msg: string): string => {
  const k = msg.indexOf("failed: ");
  return (k >= 0 ? msg.slice(k + 8) : msg).replace(/\s*@\+\d+\s*$/, "");
};

const guestStr = (len: number, at: (j: number) => number): string =>
  String.fromCodePoint(...Array.from({ length: Math.max(0, len) }, (_, j) => at(j)));

/** Where the failure lies: the owning body's file and line (when it has one), and the headline
 * the native host prints, `<file>:<line>:<col>: the emitted module failed to validate inside
 * `f`: <sentence>`. Without span exports, or for an offset in no body, the clause is omitted. */
export type Located = { headline: string; file?: string; line?: number; col?: number };

export const invalidHeadline = (exp: SpanExports, msg: string, entryKey: string): Located => {
  const sentence = sentenceOf(msg);
  const plain = { headline: `the emitted module failed to validate: ${sentence}` };
  const { emitFnSpanAt: at, emitFnSpanNameLen: nlen, emitFnSpanNameAt: nat } = exp;
  const off = failOffset(msg);
  if (at === undefined || nlen === undefined || nat === undefined || off < 0) return plain;
  const i = at(off);
  if (i < 0) return plain;
  const name = guestStr(nlen(i), (j) => nat(i, j));
  const kind = exp.emitFnSpanKindOf?.(i) ?? 0;
  // The native `SpanWhere::what` ladder, kind by kind.
  const what = kind === 1
    ? " inside the module's top-level code"
    : kind === 2
    ? ` inside the export wrapper for \`${name}\``
    : kind === 3
    ? ` inside the shared runtime helper \`${name}\``
    : kind === 4
    ? ` inside the top-level code of ${entryKey}`
    : ` inside \`${name}\``;
  const line = exp.emitFnSpanLine?.(i) ?? 0;
  if (line <= 0) return { headline: `the emitted module failed to validate${what}: ${sentence}` };
  const col = exp.emitFnSpanCol?.(i) ?? 0;
  const m = exp.emitFnSpanModule?.(i) ?? -1;
  const keys = exp.modKeyCount && exp.modKeyAtLen && exp.modKeyAtCharAt ? exp.modKeyCount() : 0;
  const file = m >= 0 && m < keys ? guestStr(exp.modKeyAtLen!(m), (j) => exp.modKeyAtCharAt!(m, j)) : entryKey;
  return {
    headline: `${file}:${line}:${col + 1}: the emitted module failed to validate${what}: ${sentence}`,
    file,
    line,
    col,
  };
};

/** Each claimed unit whose build or lowering recorded a refusal, and so declined in the guest:
 * `[name, message]` from its `… a legacy helper refused in
 * `name`: message` rows, which the guest counts even unarmed. */
export const softRefusals = (exp: ClaimExports): Array<[string, string]> => {
  const { irShadowRowCount: count, irShadowRowLen: len, irShadowRowAt: at } = exp;
  if (count === undefined || len === undefined || at === undefined) return [];
  const MARK = "a legacy helper refused in `";
  const out: Array<[string, string]> = [];
  for (let i = 0; i < count(); i++) {
    const row = guestStr(len(i), (j) => at(i, j));
    const k = row.indexOf(MARK);
    if (k < 0) continue;
    const rest = row.slice(k + MARK.length);
    const sep = rest.indexOf("`: ");
    if (sep >= 0) out.push([rest.slice(0, sep), rest.slice(sep + 3).split("\n")[0]]);
  }
  return out;
};

/** The note beside the compile's refusal when such a claim declined, as the native host words it. */
export const softNote = (name: string, msg: string): string =>
  `an IR claim refused inside \`${name}\` (${msg})`;
