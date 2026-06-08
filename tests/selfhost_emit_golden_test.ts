// Phase 0 of the codegen-builder migration (docs/codegen-builder-migration-plan.md
// §3): the BYTE-EXACT golden pin. This is the load-bearing safety net for every
// later phase of the `emitProgram` refactor — it captures the emitter's exact
// output bytes for a representative set of `.vl` modules ONCE (the "golden"), then
// asserts on every run that the current emitter reproduces those bytes
// BYTE-FOR-BYTE. Any factoring step that perturbs a byte fails loudly here.
//
// It drives source → arena → bytes through the SAME real pipeline the behavioral
// suite uses (`selfhost_emit_program_test.ts`): the genuine lexer (`lexer.vl`)
// tokenizes, the genuine parser (`parser.vl`) builds the `ast.vl` arena, and
// `emitProgram` (`wasmEmit.vl`) reads that arena to produce the module bytes. The
// emitter renders `W.bytes` as a comma-joined decimal string via `bytesToStr()`;
// the runner parses that back (the `bytesFromLog` wire format) into a byte array.
//
// The goldens are stored as plain text under `tests/golden/<name>.bytes` (one
// comma-joined decimal byte string per file) so a byte diff is a readable line
// diff in review. A guarded `UPDATE_GOLDEN=1` regenerate path rewrites them — a
// DELIBERATE, reviewed act: during a pure-factoring refactor the goldens must
// NEVER change, so a non-empty `tests/golden/*.bytes` diff in a refactor PR is a
// red flag. Belt-and-braces: each golden is also `WebAssembly.compile`d so a
// wrongly-regenerated golden can't lock in INVALID bytes.

import { compileCached } from "./_selfhost_cache.ts";
import { runWasm } from "../compiler/compile.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// Same lexer-rename glue as `selfhost_emit_program_test.ts`: the on-disk `lexer.vl`
// collides with `ast.vl`/`parser.vl` on three names (`Tok`/`Diag`/`advance`), so
// they are renamed in the SOURCE TEXT before concatenation. Pure glue — no `.vl`
// compiler file is edited.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");

const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// ── The golden module set (coverage matrix, plan §3.1) ───────────────────────
// One small module per axis so the union covers every wasm section + every type
// kind the emitter interns + the per-function scratch frames. The `g_struct`/
// `g_union`/`g_multiunion`/`g_map`/`g_kitchen` modules are the type-index
// stressors (they catch a rec-group miscount); `g_i32list`/`g_reflist`/`g_string`/
// `g_strlist`/`g_map` are the scratch-frame stressors.
type Golden = { name: string; covers: string; src: string };

const GOLDENS: Golden[] = [
  {
    name: "g_min",
    covers:
      "header + type/func/export/code sections; i32.const; end (the minimal module)",
    src: [
      "function main(): i32 {",
      "  return 42",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_arith",
    covers:
      "binOpcode set (+ - * / %, the 6 compares), call, local.get, if/else/br, recursion (fib)",
    src: [
      "function fib(n: i32): i32 {",
      "  if n < 2 { return n }",
      "  return fib(n - 1) + fib(n - 2)",
      "}",
      "function ops(a: i32, b: i32): i32 {",
      "  let lt = a < b",
      "  let le = a <= b",
      "  let gt = a > b",
      "  let ge = a >= b",
      "  let eq = a == b",
      "  let ne = a != b",
      "  let q = a / b",
      "  let r = a % b",
      "  return lt + le + gt + ge + eq + ne + q + r",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_locals",
    covers:
      "locals vector (i32 runs), reassignment, nested if/else + while (block/loop), fallthrough",
    src: [
      "function count(n: i32): i32 {",
      "  let total = 0",
      "  let i = 0",
      "  while i < n {",
      "    if i == 0 {",
      "      let a = 10",
      "      total = total + a",
      "    } else if i == 1 {",
      "      let b = 20",
      "      total = total + b",
      "    } else {",
      "      let d = 40",
      "      total = total + d",
      "    }",
      "    i = i + 1",
      "  }",
      "  return total",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_struct",
    covers:
      "struct.new/get/set; (ref $i) valtype; rec group with 2 structs; struct param + return",
    src: [
      "type P = { x: i32, y: i32 }",
      "type Q = { a: i32, b: i32 }",
      "function mk(a: i32, b: i32): P {",
      "  return { x: a, y: b }",
      "}",
      "function sumXY(p: P): i32 {",
      "  return p.x + p.y",
      "}",
      "function main(): i32 {",
      "  let p = mk(20, 22)",
      "  let q: Q = { a: 1, b: 2 }",
      "  return sumXY(p) + q.a + q.b",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_union",
    covers:
      "union variant structs + box {tag,value}; ref.cast; is-narrowing; anyref field; union param/return",
    src: [
      "type A = { av: i32 }",
      "type B = { bv: i32 }",
      "type Node = A | B",
      "function f(n: Node): i32 {",
      "  if n is A { return n.av }",
      "  if n is B { return n.bv }",
      "  return 0",
      "}",
      "function mkA(x: i32): Node {",
      "  return { av: x }",
      "}",
      "function main(): i32 {",
      "  return f(mkA(7))",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_multiunion",
    covers:
      "TWO distinct unions coexisting (shared box, globally-unique tags); the type-section stressor",
    src: [
      "type Lit = { val: i32 }",
      "type Var = { vname: string }",
      "type Node = Lit | Var",
      "type TyInt = { width: i32 }",
      "type TyStr = { len: i32 }",
      "type Ty = TyInt | TyStr",
      "function readNode(n: Node): i32 {",
      "  if n is Lit { return n.val }",
      "  return 0",
      "}",
      "function readTy(t: Ty): i32 {",
      "  if t is TyInt { return t.width }",
      "  return 0",
      "}",
      "function main(): i32 {",
      "  let n: Node = { val: 10 }",
      "  let t: Ty = { width: 20 }",
      "  return readNode(n) + readTy(t)",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_i32list",
    covers:
      "raw array + list wrapper; array.new_default; grow path; index/set/.length; push scratch frame",
    src: [
      "function main(): i32 {",
      "  let a: i32[] = []",
      "  let i = 0",
      "  while i < 10 {",
      "    a.push(i)",
      "    i = i + 1",
      "  }",
      "  a[0] = 99",
      "  let sum = 0",
      "  let j = 0",
      "  while j < a.length {",
      "    sum = sum + a[j]",
      "    j = j + 1",
      "  }",
      "  return sum",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_reflist",
    covers:
      "ref backing (nullable elem) + ref-list wrapper; ref-push scratch frame; element field read",
    src: [
      "type Tok = { kind: string, pos: i32 }",
      "type Diag = { msg: string, at: i32 }",
      "type Parser = { toks: Tok[], diags: Diag[], pos: i32 }",
      "let P: Parser = { toks: [], diags: [], pos: 0 }",
      "function f(): i32 {",
      "  P.toks.push({ kind: \"A\", pos: 10 })",
      "  P.diags.push({ msg: \"x\", at: 20 })",
      "  return P.toks[0].pos + P.diags[0].at",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_string",
    covers:
      "string array rep; concat (+); value-eq (==); slice; str-op scratch frame (7 slots); clamp/index",
    src: [
      "function main(): i32 {",
      '  let a = "ab"',
      '  let b = "cde"',
      "  let c = a + b",
      '  let sl = "hello".slice(1, 3)',
      "  let acc = c.length + sl.length",
      '  if sl == "el" { acc = acc + 1 }',
      '  if a == b { acc = acc + 100 }',
      "  acc = acc + c[0]",
      "  return acc",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_strlist",
    covers:
      "string backing + string-list wrapper; str-push scratch frame; string[] field + .push",
    src: [
      "type Box = { names: string[] }",
      "function main(): i32 {",
      "  let b: Box = { names: [] }",
      '  b.names.push("x")',
      '  b.names.push("y")',
      "  let n = b.names.length",
      '  if b.names[1] == "y" { n = n + 0 } else { n = 0 }',
      "  return n",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_map",
    covers:
      "map struct (5 fields); hash/probe/rehash/resize; set/get/has; map scratch frame (12 slots)",
    src: [
      "function main(): i32 {",
      "  let m: {[string]: i32} = Map()",
      '  m["x"] = 7',
      '  m["y"] = 9',
      "  let acc = 0",
      '  if m.has("x") { acc = acc + (m["x"] ?? -1) }',
      '  acc = acc + (m["y"] ?? -1)',
      '  acc = acc + (m["missing"] ?? 100)',
      "  return acc",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_maparray",
    covers:
      "array-of-maps ({[string]:i32}[]): map struct as ref-list elem + map+list scratch frames combined",
    src: [
      "function main(): i32 {",
      "  let scopes: {[string]: i32}[] = []",
      "  scopes.push(Map())",
      "  scopes.push(Map())",
      '  scopes[0]["x"] = 7',
      '  scopes[1]["k"] = 9',
      "  let top = scopes.pop()",
      '  let v = top["k"] ?? -1',
      '  return v + (scopes[0]["x"] ?? -1) + scopes.length',
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_globals",
    covers:
      "global section: module-level let (i32 + struct init); global.get/set; struct.new in init",
    src: [
      "type Counter = { n: i32 }",
      "let base: i32 = 40",
      "let C: Counter = { n: 0 }",
      "function bump(): i32 {",
      "  C.n = C.n + 1",
      "  return C.n",
      "}",
      "function main(): i32 {",
      "  bump()",
      "  bump()",
      "  return base + C.n",
      "}",
      "",
    ].join("\n"),
  },
  {
    name: "g_kitchen",
    covers:
      "cross-section: struct + i32-list + string in one program; full type-section rec-group ordering",
    src: [
      "type Rec = { id: i32, name: string }",
      "function main(): i32 {",
      '  let r: Rec = { id: 5, name: "hi" }',
      "  let xs: i32[] = []",
      "  xs.push(r.id)",
      "  xs.push(r.name.length)",
      '  let s = "a" + "b"',
      "  let sum = 0",
      "  let i = 0",
      "  while i < xs.length {",
      "    sum = sum + xs[i]",
      "    i = i + 1",
      "  }",
      "  return sum + s.length",
      "}",
      "",
    ].join("\n"),
  },
];

// The combined driver: for each golden, RESET the parser arena (`P`) and all
// emitter module state, lex/parse/emit, and print `<key>\tmain: <bytesToStr()>`
// (the exact wire format `selfhost_emit_program_test.ts` uses). Identical reset
// list to the behavioral driver so each case starts as if freshly loaded.
const driver = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function runCase(key: string, src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  W.bytes = []
  fnNames = []
  fnIndices = []
  localNames = []
  globalStmts = []
  globalNames = []
  loadToks(src)
  let root = parseProgram()
  let rc = emitProgram(root)
  if rc < 0 {
    print(key + "\\terr: " + emitErr)
  } else {
    print(key + "\\tmain: " + bytesToStr())
  }
  0
}
` +
  GOLDENS.map((g) =>
    `runCase(${JSON.stringify(g.name)}, ${JSON.stringify(g.src)})`
  ).join("\n") +
  "\n";

// Parse the single `main: b0,b1,...` payload of a case's log lines into a byte
// array. On an `err:` line (an unsupported shape) it throws with the message — a
// golden module must always emit.
const bytesFromLog = (
  name: string,
  logs: string[],
): Uint8Array<ArrayBuffer> => {
  const errLine = logs.find((l) => l.startsWith("err: "));
  if (errLine) {
    throw new Error(`golden "${name}" failed to emit: ${errLine}`);
  }
  const line = logs.find((l) => l.startsWith("main: "));
  if (!line) {
    throw new Error(
      `golden "${name}": emitter did not print a \`main:\` line; got ${
        JSON.stringify(logs)
      }`,
    );
  }
  const nums = line.slice("main: ".length).split(",").map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      throw new Error(`byte out of range in emitter output: ${s}`);
    }
    return n;
  });
  return new Uint8Array(nums);
};

// Compile + run the combined module ONCE (memoized); return the per-key logs.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit + "\n" +
      driver;
    const { wasm, diagnostics } = await compileCached(source);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "self-hosted emit-golden driver failed to compile: " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byKey = new Map<string, string[]>();
    for (const line of logs) {
      const tab = line.indexOf("\t");
      const key = tab < 0 ? "" : line.slice(0, tab);
      const payload = tab < 0 ? line : line.slice(tab + 1);
      const arr = byKey.get(key) ?? [];
      arr.push(payload);
      byKey.set(key, arr);
    }
    return byKey;
  })();

const goldenPath = (name: string) =>
  new URL(`./golden/${name}.bytes`, import.meta.url);

// The comma-joined decimal wire format, exactly as the emitter prints it.
const toWire = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes).join(",");

// The first index at which two byte arrays differ (or the shorter length if one
// is a prefix of the other), plus a windowed context for the diagnostic message.
const firstDiff = (
  expected: Uint8Array<ArrayBuffer>,
  actual: Uint8Array<ArrayBuffer>,
): { index: number; window: string } | undefined => {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== actual[i]) {
      const lo = Math.max(0, i - 4);
      const hi = i + 5;
      return {
        index: i,
        window:
          `  expected … ${Array.from(expected.slice(lo, hi)).join(", ")} …\n` +
          `  actual   … ${Array.from(actual.slice(lo, hi)).join(", ")} …`,
      };
    }
  }
  if (expected.length !== actual.length) {
    return {
      index: n,
      window: `  (one is a prefix of the other; lengths differ at index ${n})`,
    };
  }
  return undefined;
};

const UPDATE = Deno.env.get("UPDATE_GOLDEN") === "1";

GOLDENS.forEach((g) => {
  Deno.test(`emit-golden: ${g.name} — ${g.covers}`, async () => {
    const logs = (await runAll()).get(g.name) ?? [];
    const actual = bytesFromLog(g.name, logs);

    // Belt-and-braces: the emitted bytes must still be a VALID wasm module, not
    // just byte-stable — so a wrongly-regenerated golden can't lock in garbage.
    await WebAssembly.compile(actual);

    if (UPDATE) {
      // Deliberate, reviewed regenerate path. Writes the comma-joined decimal
      // wire string (the format the emitter prints and this test parses back).
      Deno.mkdirSync(new URL("./golden/", import.meta.url), { recursive: true });
      Deno.writeTextFileSync(goldenPath(g.name), toWire(actual) + "\n");
      return;
    }

    let expectedText: string;
    try {
      expectedText = Deno.readTextFileSync(goldenPath(g.name));
    } catch {
      throw new Error(
        `missing golden tests/golden/${g.name}.bytes — ` +
          `regenerate deliberately with UPDATE_GOLDEN=1 deno test -A --no-check ` +
          `tests/selfhost_emit_golden_test.ts`,
      );
    }
    const expected: Uint8Array<ArrayBuffer> = new Uint8Array(
      expectedText.trim().split(",").map((s) => Number(s)),
    );

    const diff = firstDiff(expected, actual);
    if (diff) {
      throw new Error(
        `GOLDEN DRIFT in ${g.name} at byte ${diff.index} ` +
          `(expected length ${expected.length}, actual length ${actual.length}):\n` +
          diff.window + "\n" +
          `Re-run with UPDATE_GOLDEN=1 ONLY if this byte change is intended.`,
      );
    }
    // Final exact assert (a clear single source of truth alongside the windowed
    // first-diff above).
    if (toWire(actual) !== toWire(expected)) {
      throw new Error(`GOLDEN DRIFT in ${g.name}: byte strings differ`);
    }
  });
});
