// THE STATE-LEAK HARNESS — one `WebAssembly.Instance` compiling many programs, graded
// against a fresh-instance oracle.
//
// WHY IT EXISTS. Two real defects in one week shared one shape and neither had an
// instrument:
//
//   * **D986** (#2218). The emitter's type-minting flags `ba8Used` / `fa32Used` /
//     `fa64Used` / `ia64Used` say "this module mints these heap types". The INDICES they
//     guard (`ba8TypeIdx`, `bl8TypeIdx`, …) are recomputed every compile; the flags were
//     reset nowhere. A flag survived from an earlier compile while its indices did not, so
//     the module believed types existed at indices that now meant something else. V8:
//     `local.set[0] expected type (ref null 5), found ref.as_non_null of type (ref 9)`.
//     The native host RAN the same module, `vl check --codegen` called it clean, and every
//     delivery position passed `vl run` — three instruments agreed and the fourth was
//     right. Its bisect signature is the whole reason for this file: **passes alone,
//     passes in every pair and every position, fails ONLY in the full parallel suite.**
//   * **D1003**. Stale `ufcsAlias` rows on a reused instance, live in the LSP server, found
//     because one constraints fixture passed under `--filter` and failed beside its
//     neighbours.
//
// THE STRUCTURAL BLINDNESS. `vl` compiles once per process, so the CLI, the corpus sweep
// (`scripts/native-corpus-sweep.sh`, one process per file) and every native suite are blind
// to this class **at any corpus size**. The two drivers that are not blind are the two that
// found the bugs by accident: `cases_wasm_*_test.ts` (one instance over ~2,500 cases) and the
// LSP server (one instance over every keystroke — `lsp/src/wasmCheckerNode.ts`: "one
// instance is reused across keystrokes"). In both, a leak surfaces as a scatter of
// unrelated failures with no common cause, which is what cost D986 a bisect. This file pins
// the invariant directly and names the first divergent compile.
//
// THE INVARIANT, deliberately general: **compiling program P on an instance that has
// already compiled other programs must produce byte-identical output to compiling P on a
// fresh instance.** It encodes no particular column, so it keeps working for leaks nobody
// has thought of yet. `tests/vl_checker_program_isolation_test.ts` pins the same invariant
// for ONE hand-built A/B pair; this is the systematic version over the emitter's flag
// families, in three orders, plus the LSP surface at the bottom.
//
// WHAT GRADES THE MODULES, stated because the reasoning is load-bearing. D986 was V8-only,
// so `vl run` green was half-evidence. Two rungs:
//   1. Every ORACLE module is instantiated AND RUN under `runWasm` (a real
//      `WebAssembly.instantiate`, the VL host-import ABI, start function executed). That
//      proves the oracle is a module V8 accepts, not merely bytes.
//   2. Every SHARED-instance emission is compared BYTE-FOR-BYTE against its oracle. Given
//      rung 1, byte-identity implies instantiability — so the expensive instantiate is paid
//      once per program, not once per program per sequence. **That is the reliance: rung 1
//      for the oracle, byte-identity for the rest.**
// Belt and braces on top: `WebAssembly.validate` runs over every emission from every
// sequence. It is a pure function of the bytes and costs microseconds, and it means a leak
// that produces invalid wasm is NAMED as invalid wasm rather than merely as a byte
// difference — the sentence D986 needed and did not get.
//
// THE MODULE-SCOPE STATE AUDIT — which emitter state is reset, and where — is
// `docs/internals/emitter-module-state.md`. This file does NOT reset anything in the
// compiler; it measures, and `OPEN_LEAKS` below is what it measured.
//
// Run with:  deno test -A --no-check tests/vl_instance_state_leak_test.ts

import { runWasm } from "./support/runWasm.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const CASES = new URL("./cases/", import.meta.url).pathname;

const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;

type Exports = Record<string, (...args: number[]) => number>;

// ── the program set ────────────────────────────────────────────────────────────────────
//
// Hand-picked to ARM each family of module-scope emitter flags, one or more programs per
// family, taken from `tests/cases/**` so they stay real programs somebody maintains. The
// `family` string is what a failure report names, so it is the emitter state the program is
// here to exercise — not a topic label.
//
// The `NONE` family is the other half of D986's reachable shape and cannot come from the
// corpus: a program that mints NOTHING, so a flag left set by its predecessor is the only
// thing that could make its type section or its frame differ. Those are inline.

type Program = {
  id: string;
  /** The module-scope emitter state this program arms. */
  family: string;
  /** Relative to `tests/cases/`; absent for the inline non-minters. */
  path?: string;
  src?: string;
};

const PROGRAMS: Program[] = [
  // ── packed byte, `ba8Used` / `ba8TypeIdx` / `bl8TypeIdx` — D986's own family ──
  {
    id: "u8-nullable-literal-dest",
    family: "ba8Used (D983 witness)",
    path: "arrays/u8-nullable-list-literal-dest.vl",
  },
  {
    id: "u8-union-tag-band",
    family: "ba8Used × uAtomBandTop",
    path: "arrays/u8-union-tag-band.vl",
  },
  { id: "u8-for-in", family: "ba8Used", path: "arrays/u8-for-in.vl" },
  { id: "utf8-bytes", family: "ba8Used via scanPrintUse", path: "strings/utf8-bytes.vl" },
  // ── wide scalars: `fa64Used`/`fl64TypeIdx`, `ia64Used`/`il64TypeIdx`, `fa32Used` ──
  { id: "f64-elems", family: "fa64Used", path: "arrays/f64-elems.vl" },
  {
    id: "f64-inferred-return",
    family: "fa64Used",
    path: "arrays/inferred-f64-array-return.vl",
  },
  {
    id: "f32-self-classifies",
    family: "fa32Used",
    path: "arrays/f32-array-literal-self-classifies.vl",
  },
  {
    id: "f32-global-push",
    family: "fa32Used + f32PushScratchBase",
    path: "arrays/global-f32-push.vl",
  },
  { id: "i64-array", family: "ia64Used", path: "arrays/i64-array.vl" },
  // ── function values and closures: `fnValUsed`, `cloStructIdx`, `cloSigBase` ──
  {
    id: "capture-ref-array",
    family: "fnValUsed + raUsed/rlUsed",
    path: "closures/capture-ref-array-storage-classes.vl",
  },
  {
    id: "closure-union-carrier",
    family: "fnValUsed + union boxes",
    path: "closures/closure-result-union-composed-carrier.vl",
  },
  {
    id: "capture-nullable-map",
    family: "fnValUsed + mUsed",
    path: "closures/capture-nullable-map-shape-agreement.vl",
  },
  // ── literal unions: `gLitUnionUsed`, the atom band ──
  {
    id: "litunion-receivers",
    family: "gLitUnionUsed",
    path: "literal-unions/is-litunion-arm-non-ident-receivers.vl",
  },
  {
    id: "litunion-mixed-store",
    family: "gLitUnionUsed × union boxes",
    path: "literal-unions/atom-store-into-mixed-union.vl",
  },
  {
    id: "litunion-flatten",
    family: "gLitUnionUsed",
    path: "literal-unions/union-of-litunions-flatten.vl",
  },
  // ── variants and value boxes: `uDeclared`, `uBoxIdx`, `vbI32Used`…`vbF64Used` ──
  {
    id: "variant-ref-field",
    family: "uBoxIdx + vb*Used",
    path: "unions/variant-arm-ref-field-literal.vl",
  },
  { id: "union-map-member", family: "uBoxIdx + mUsed", path: "unions/map-member-shapes.vl" },
  {
    id: "variant-litunion-field",
    family: "uBoxIdx × gLitUnionUsed",
    path: "unions/variant-litunion-field.vl",
  },
  // ── the union-box SINK frame: `fnUsesUnionSink` / `fnUsesUnionLetSink` ──
  // Both are assigned per FUNCTION in `emitFuncCode` and never in `startFnDetectScratch`
  // (see the audit note). No witness — this pair is here so one would be caught.
  {
    id: "union-return-sink",
    family: "fnUsesUnionSink",
    src:
      'function pick(b: boolean): i32 | string {\n  if b { return 1 }\n  return "s"\n}\n' +
      "const v = pick(true)\nif v is i32 { print(v) }\n",
  },
  // ── the module-predicate memo: `modUnionAsHit`/`modUnionAsSeen`, `modNumCastHit`/…Seen ──
  // `moduleHasUnionAs` / `moduleHasNumCast` bank their answer on an arena PREFIX, so a
  // surviving `…Hit` reserves the union-`as` box or the three numeric staging slots in a
  // program that has neither, and a surviving `…Seen` would start the next program's scan
  // inside a prefix belonging to nobody. `emitProgram` clears all four; this program is what
  // sets them, so the NONE family below is where a missing clear would show.
  {
    id: "as-memo-arm",
    family: "modUnionAsHit + modNumCastHit",
    src:
      "function pick(b: boolean): i32 | string {\n  if b { return 1 }\n  return \"s\"\n}\n" +
      "const u = pick(false)\nconst s = u as? string\n" +
      'if s != null { print(s) } else { print("none") }\n' +
      "const d = 2.5\nconst n = d as? i32\nif n != null { print(n) } else { print(0) }\n",
  },
  // ── maps: `mUsed`/`mStructIdx`, `mI32Used`/`mStructI32Idx` ──
  { id: "map-nullable-value", family: "mUsed", path: "maps/nullable-value-map.vl" },
  {
    id: "map-i32-keyed-refs",
    family: "mI32Used + raUsed",
    path: "maps/i32-keyed-ref-values.vl",
  },
  // ── strings and string lists: `slUsed`, `strPushScratchBase`, the literal pool ──
  {
    id: "string-literal-pool",
    family: "slUsed + literal pool",
    path: "strings/literal-pool.vl",
  },
  { id: "string-slice", family: "slUsed", path: "strings/slice.vl" },
  // ── structs: `sTypeIdx`, `sBackIdx`, `mkArrIdx`, `mkListIdx` ──
  {
    id: "struct-nul-scalar-list-field",
    family: "sTypeIdx + scalar-list fields",
    path: "structs/nul-distinct-scalar-list-field.vl",
  },
  {
    id: "struct-nullable-map-field",
    family: "sTypeIdx + mUsed",
    path: "structs/nullable-map-field.vl",
  },
  // ── linear memory: `memUsed`, `memLogUsed`, `gMemLogIdx` ──
  {
    id: "mem-narrow-widths",
    family: "memUsed",
    path: "memory/store-narrow-widths-round-trip.vl",
  },
  { id: "mem-bulk-copy", family: "memUsed", path: "memory/bulk-copy-and-fill.vl" },

  // ── the NON-MINTERS: the second half of D986's shape ────────────────────────────────
  // A program whose own type section and start-function frame are decided entirely by what
  // it contains. If a predecessor's flag survives, these are where it shows: the flag mints
  // a heap type or reserves a scratch frame this program never asked for.
  { id: "bare-i32-print", family: "NONE", src: "print(1)\n" },
  {
    id: "bare-string-print",
    family: "NONE",
    src: 'const s = "hi"\nprint(s)\nprint(s.length)\n',
  },
  {
    id: "bare-i32-array",
    family: "NONE (aUsed/lUsed only)",
    src: "const xs = [1, 2, 3]\nprint(xs[0] + xs[2])\nprint(xs.length)\n",
  },
  {
    id: "bare-struct",
    family: "NONE (sTypeIdx only)",
    src: "type P = { x: i32 }\nconst p: P = { x: 7 }\nprint(p.x)\n",
  },
  {
    id: "bare-union-atom",
    family: "NONE (union band, no u8)",
    src: 'type Tag = "a" | "b"\nconst t: Tag = "b"\nif t == "b" { print(1) } else { print(0) }\n',
  },
];

// ── THE OPEN ROWS ──────────────────────────────────────────────────────────────────────
//
// Programs this harness found leaking on the day it was written. They are held OUT of the
// three sequences and pinned by their own test instead, which asserts that each still leaks
// EXACTLY as filed — so the day the compiler fix lands, that test reds and says so. Fixing
// compiler state is not this file's job (the harness measures); the fix belongs to the row.
//
// Both are one mechanism: `startFnDetectScratch` (`emit_sections.vl`) is the start
// function's analogue of `emitFuncCode`'s per-function frame detection, and it clears 20 of
// the 24 `fnUses*` frame flags. `fnUsesU8Push` and `fnUsesMapVals` are two of the four it
// misses — and each is written TWICE IN A ROW inside `emitFuncCode` (lines 872/873 and
// 904/905), which is what the second copy was for. So a program that pushes to a `u8[]`, or
// reads `m.values()`, leaves its flag set, and the NEXT program's start function reserves a
// scratch quad it never uses: four extra locals (+10 bytes) or six (+15).
//
// The phantom locals are DEAD and the module stays valid, which is why nothing caught it —
// but the emitted bytes depend on what the instance compiled before, which is exactly the
// D986 invariant. Measured over the corpus: **23 of 1,922 gradeable `tests/cases` programs**
// leak into a following `print(1)` — 3 at +10 bytes, 20 at +15.
type OpenLeak = {
  row: string;
  id: string;
  /** The program that leaves the flag set. */
  path: string;
  /** The state that survives. */
  state: string;
  /** Bytes the following `print(1)` gains. */
  delta: number;
};

const OPEN_LEAKS: OpenLeak[] = [
  {
    row: "D1006",
    id: "u8-packed-list",
    path: "arrays/u8-packed-list.vl",
    state: "fnUsesU8Push",
    delta: 10,
  },
  {
    row: "D1007",
    id: "map-values-forin",
    path: "maps/forin-list-valued-values.vl",
    state: "fnUsesMapVals",
    delta: 15,
  },
];

const sourceOf = (p: Program): string =>
  p.src ?? Deno.readTextFileSync(CASES + p.path!);

// ── the driver ─────────────────────────────────────────────────────────────────────────

const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};

const readString = (len: number, at: (j: number) => number): string => {
  const bytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) bytes[j] = at(j);
  return new TextDecoder().decode(bytes);
};

type Result = {
  /** 0|1|2|3 = ok|parse|type|emit */
  rc: number;
  /** One `line:col message` per diagnostic; empty on rc 0 (the store is not read there). */
  diags: string[];
  /** Present iff rc 0. */
  bytes?: Uint8Array;
};

/**
 * One compile through `exp`. `modReset()` first, as every driver must: the module table
 * persists across compiles BY DESIGN, so it is not part of what this harness grades.
 */
const compile = (exp: Exports, src: string): Result => {
  exp.modReset();
  exp.srcReset();
  pushString(exp.srcPush, src);
  const rc = exp.compileSrc();
  // rc 0 means no diagnostics — the store is only read on failure, and on a SHARED instance
  // a stale emit failure can still be sitting in it (`cases_wasm_*_test.ts` says the same).
  const diags: string[] = [];
  if (rc !== 0) {
    const n = exp.diagCount();
    for (let i = 0; i < n; i++) {
      diags.push(
        `${exp.diagLine(i)}:${exp.diagCol(i)} ${
          readString(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j))
        }`,
      );
    }
  }
  let bytes: Uint8Array | undefined;
  if (rc === 0) {
    const n = exp.rbyteLen();
    bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = exp.rbyteAt(i);
  }
  return { rc, diags, bytes };
};

// The seed is compiled ONCE; a fresh oracle is a fresh Instance over that Module, which is
// what keeps ~30 fresh-instance compiles inside the time budget.
const seedModule = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED))
  : undefined;
const freshInstance = (): Exports =>
  new WebAssembly.Instance(seedModule!, {}).exports as unknown as Exports;

// ── the oracle ─────────────────────────────────────────────────────────────────────────

const oracle = new Map<string, Result>();

/** Built once, by the first test that needs it (Deno runs a file's tests in order). */
const buildOracle = (): void => {
  if (oracle.size > 0) return;
  for (const p of PROGRAMS) {
    oracle.set(p.id, compile(freshInstance(), sourceOf(p)));
  }
};

const describe = (r: Result): string =>
  r.rc === 0 ? `rc 0, ${r.bytes!.length} bytes` : `rc ${r.rc}: ${r.diags.join(" | ")}`;

/** The first differing byte offset, or -1. Lengths may differ. */
const firstDiff = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
};

// ── the sequences ──────────────────────────────────────────────────────────────────────

type Step = { p: Program; note: string };

const listed: Step[] = PROGRAMS.map((p) => ({ p, note: "listed order" }));
const reversed: Step[] = [...PROGRAMS].reverse().map((p) => ({
  p,
  note: "reverse order",
}));

/**
 * THE MINTING SANDWICH — D986's reachable shape, made deliberate.
 *
 * Every minter is followed by every non-minter. A flag the minter set and nothing cleared
 * is then read while the non-minter's indices and frame are being recomputed, which is
 * precisely the window D986 lived in. The pairing is what matters, not the length: a leak
 * is a function of what the PREVIOUS program armed, so a sequence that never puts a minter
 * immediately before a program of another family cannot see it. Both leaks this file found
 * were invisible to the listed and reversed orders and visible here on the first run.
 */
const minters = PROGRAMS.filter((p) => !p.family.startsWith("NONE"));
const nonMinters = PROGRAMS.filter((p) => p.family.startsWith("NONE"));
const sandwich: Step[] = [];
for (const m of minters) {
  sandwich.push({ p: m, note: "minter" });
  for (const n of nonMinters) {
    sandwich.push({ p: n, note: `non-minter after ${m.id} (${m.family})` });
  }
}

// ── grading ────────────────────────────────────────────────────────────────────────────

type Divergence = {
  step: number;
  id: string;
  note: string;
  prev: string;
  what: string;
};

const runSequence = (name: string, steps: Step[]): void => {
  buildOracle();
  const exp = freshInstance();
  const found: Divergence[] = [];
  let prev = "<fresh instance>";
  for (let i = 0; i < steps.length; i++) {
    const { p, note } = steps[i];
    const got = compile(exp, sourceOf(p));
    const want = oracle.get(p.id)!;
    const record = (what: string) =>
      found.push({ step: i, id: p.id, note, prev, what });

    if (got.rc !== want.rc) {
      record(`rc ${got.rc} on the shared instance, rc ${want.rc} fresh — ${describe(got)}`);
    } else if (got.rc !== 0) {
      const a = got.diags.join(" | ");
      const b = want.diags.join(" | ");
      if (a !== b) record(`diagnostics differ\n      shared: ${a}\n      fresh : ${b}`);
    } else if (!WebAssembly.validate(got.bytes!)) {
      // Belt and braces: name invalid wasm AS invalid wasm, which is the sentence D986
      // needed. `WebAssembly.validate` is a pure function of the bytes.
      record(
        `the shared instance emitted a module V8 REJECTS (${got.bytes!.length} bytes); ` +
          `the fresh-instance module is ${
            WebAssembly.validate(want.bytes!) ? "valid" : "ALSO invalid"
          }`,
      );
    } else {
      const d = firstDiff(got.bytes!, want.bytes!);
      if (d >= 0) {
        record(
          `emitted bytes differ at offset ${d} (shared ${got.bytes!.length} bytes, fresh ` +
            `${want.bytes!.length}); the module is valid, so this is a silent codegen ` +
            `difference`,
        );
      }
    }
    prev = `${p.id} (${p.family})`;
  }

  if (found.length === 0) return;
  const first = found[0];
  const rest = found.slice(1).map((d) => `    step ${d.step} ${d.id} — ${d.note}`);
  throw new Error(
    `INSTANCE STATE LEAK — sequence "${name}": ${found.length} of ${steps.length} ` +
      `compiles diverged from their fresh-instance oracle.\n` +
      `  FIRST DIVERGENT COMPILE\n` +
      `    step       : ${first.step} of ${steps.length}\n` +
      `    program    : ${first.id}\n` +
      `    position   : ${first.note}\n` +
      `    preceded by: ${first.prev}\n` +
      `    divergence : ${first.what}\n` +
      (rest.length > 0 ? `  ALSO DIVERGED\n${rest.join("\n")}\n` : "") +
      `  Compiling a program must not depend on what the instance compiled before it. ` +
      `The module-scope state audit is docs/internals/emitter-module-state.md; the known ` +
      `open rows are OPEN_LEAKS in this file.`,
  );
};

// ── the tests ──────────────────────────────────────────────────────────────────────────

Deno.test({
  name: "instance-leak oracle: every program compiles and its module instantiates under V8",
  ignore,
  fn: async () => {
    buildOracle();
    const bad: string[] = [];
    for (const p of PROGRAMS) {
      const r = oracle.get(p.id)!;
      if (r.rc !== 0) {
        bad.push(`${p.id}: expected rc 0, got ${describe(r)}`);
        continue;
      }
      // Rung 1 of the module grading (see the header): a REAL instantiate, with the start
      // function run. Byte-identity against this is what licenses skipping it per sequence.
      try {
        await runWasm(r.bytes!);
      } catch (e) {
        bad.push(`${p.id}: the fresh-instance module did not instantiate/run — ${e}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `the oracle is not sound, so the sequences below would grade against nothing:\n  ` +
          bad.join("\n  "),
      );
    }
  },
});

Deno.test({
  name: "instance-leak: listed order matches the fresh-instance oracle",
  ignore,
  fn: () => runSequence("listed", listed),
});

Deno.test({
  name: "instance-leak: reverse order matches the fresh-instance oracle",
  ignore,
  fn: () => runSequence("reversed", reversed),
});

Deno.test({
  name: "instance-leak: the minting sandwich matches the fresh-instance oracle",
  ignore,
  fn: () => runSequence("minting sandwich", sandwich),
});

// The OPEN rows, pinned so their fix reports itself. This is the failing-shaped test: it
// asserts the leak is STILL THERE, which is the only way an open row can be gated without
// reddening the tree for debt the author is not editing.
Deno.test({
  name: "instance-leak: the OPEN rows still leak exactly as filed",
  ignore,
  fn: () => {
    const TARGET = "print(1)\n";
    const base = compile(freshInstance(), TARGET);
    if (base.rc !== 0) throw new Error("`print(1)` no longer compiles — fixture is stale");
    const wrong: string[] = [];
    for (const leak of OPEN_LEAKS) {
      const exp = freshInstance();
      const pred = compile(exp, Deno.readTextFileSync(CASES + leak.path));
      if (pred.rc !== 0) {
        wrong.push(
          `${leak.row}: ${leak.path} no longer compiles (rc ${pred.rc}) — repoint the row ` +
            `at another program that arms ${leak.state}`,
        );
        continue;
      }
      const after = compile(exp, TARGET);
      const delta = after.bytes!.length - base.bytes!.length;
      if (delta === 0) {
        wrong.push(
          `${leak.row} appears FIXED: after ${leak.path}, \`print(1)\` is now ` +
            `byte-length-identical to the fresh-instance answer. ${leak.state} is no longer ` +
            `leaking. DELETE the ${leak.row} entry from OPEN_LEAKS and put ` +
            `\`${leak.id}\` back into PROGRAMS, then close the row in ` +
            `docs/internals/silent-class-inventory.md.`,
        );
      } else if (delta !== leak.delta) {
        wrong.push(
          `${leak.row} MOVED: expected \`print(1)\` to gain ${leak.delta} bytes after ` +
            `${leak.path}, got ${delta}. The leak changed shape — re-measure before ` +
            `updating the number.`,
        );
      }
    }
    if (wrong.length > 0) throw new Error(wrong.join("\n"));
  },
});

// ── the LSP server's own exposure ──────────────────────────────────────────────────────
//
// The server compiles per keystroke through exactly this shape — `loadWasmChecker` holds
// ONE instance and every `check`/`compile` reuses it — and D1003 was a leak that reached it.
// So the question is not "is the compiler clean" but "can the SERVER SURFACE see a leak",
// which is a different question with a different answer per surface:
//
//   * `check()` returns DIAGNOSTICS. A leak is invisible here unless it changes what the
//     checker says. D1003 did exactly that (an empty `[ERROR]:` at a member call).
//   * `compile()` returns BYTES — the playground's Run path and `vl build`'s path. Every
//     emitter-state leak is visible here, including both OPEN_LEAKS rows.
//
// Both are graded against a FRESH checker, which is the same oracle the sequences use.
Deno.test({
  name: "instance-leak: the LSP checker surface is not contaminated by an earlier file",
  ignore,
  fn: async () => {
    const log = () => {};
    const noSiblings = () => undefined;
    // A MINTER, then a NON-MINTER, through one server-shaped checker — the shape a user
    // produces by opening one file and then another. The minter is deliberately NOT one of
    // the OPEN_LEAKS programs: this test asks whether anything ELSE reaches the surface.
    const MINTER = Deno.readTextFileSync(CASES + "arrays/u8-union-tag-band.vl");
    const AFTER = 'const s = "hi"\nprint(s)\nprint(s.length)\n';

    const fresh = loadWasmChecker(SEED, log)!;
    const wantDiags = await fresh.check(AFTER, "/tmp/after.vl", noSiblings);
    const wantCompile = await fresh.compile(AFTER, "/tmp/after.vl", noSiblings);

    const shared = loadWasmChecker(SEED, log)!;
    await shared.check(MINTER, "/tmp/minter.vl", noSiblings);
    await shared.compile(MINTER, "/tmp/minter.vl", noSiblings);
    const gotDiags = await shared.check(AFTER, "/tmp/after.vl", noSiblings);
    const gotCompile = await shared.compile(AFTER, "/tmp/after.vl", noSiblings);

    const fmt = (ds: { message: string }[]) => ds.map((d) => d.message).join(" | ");
    if (fmt(gotDiags) !== fmt(wantDiags)) {
      throw new Error(
        `LSP CHECK SURFACE LEAK — the same file reports different diagnostics after another ` +
          `file was checked on the same server instance.\n  fresh : ${fmt(wantDiags)}\n` +
          `  shared: ${fmt(gotDiags)}`,
      );
    }
    const a = gotCompile.bytes, b = wantCompile.bytes;
    if ((a === undefined) !== (b === undefined)) {
      throw new Error(
        `LSP COMPILE SURFACE LEAK — one arm produced a module and the other did not ` +
          `(fresh ${b === undefined ? "none" : b.length + " bytes"}, shared ` +
          `${a === undefined ? "none" : a.length + " bytes"})`,
      );
    }
    if (a !== undefined && b !== undefined) {
      const d = firstDiff(a, b);
      if (d >= 0) {
        throw new Error(
          `LSP COMPILE SURFACE LEAK — the playground/Run path emitted different bytes for ` +
            `the same file after another file was compiled on the same server instance: ` +
            `first difference at offset ${d} (shared ${a.length} bytes, fresh ${b.length}). ` +
            `This is the surface a user sees; see docs/internals/emitter-module-state.md.`,
        );
      }
    }
  },
});

// A tripwire, not decoration: the sandwich is the sequence D986 needed, and it is only that
// sequence while BOTH halves are non-empty. A refactor that renamed the `NONE` family, or a
// program set that lost its non-minters, would leave a test that still passes and no longer
// measures anything.
Deno.test({
  name: "instance-leak: the program set still covers both halves of the shape",
  fn: () => {
    if (minters.length < 20) {
      throw new Error(`expected >= 20 minting programs, have ${minters.length}`);
    }
    if (nonMinters.length < 3) {
      throw new Error(`expected >= 3 non-minting programs, have ${nonMinters.length}`);
    }
    const ids = new Set([...PROGRAMS.map((p) => p.id), ...OPEN_LEAKS.map((l) => l.id)]);
    if (ids.size !== PROGRAMS.length + OPEN_LEAKS.length) {
      throw new Error("duplicate program id");
    }
    const paths: { id: string; path: string; why: string }[] = [
      ...PROGRAMS.filter((p) => p.path !== undefined).map((p) => ({
        id: p.id,
        path: p.path!,
        why: p.family,
      })),
      ...OPEN_LEAKS.map((l) => ({ id: l.id, path: l.path, why: l.state })),
    ];
    for (const p of PROGRAMS) {
      if (p.path === undefined && p.src === undefined) {
        throw new Error(`${p.id} has neither a path nor a src`);
      }
    }
    for (const { id, path, why } of paths) {
      try {
        Deno.statSync(CASES + path);
      } catch {
        throw new Error(
          `${id} names ${path}, which is gone — repoint it at a program that arms ${why}, ` +
            `do not just delete the row`,
        );
      }
    }
  },
});
