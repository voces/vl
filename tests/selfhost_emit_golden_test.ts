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
// The goldens are stored as raw binary wasm under `tests/golden/<name>.wasm`
// (git-tracked as binary via `.gitattributes`, so they don't pollute text diffs
// and can be inspected with standard wasm tooling). On drift the test reports the
// exact first differing BYTE INDEX (no readable line diff needed). A guarded
// `UPDATE_GOLDEN=1` regenerate path rewrites them — a DELIBERATE, reviewed act:
// during a pure-factoring refactor the goldens must NEVER change, so a non-empty
// `tests/golden/*.wasm` diff in a refactor PR is a red flag. Belt-and-braces:
// each golden is also `WebAssembly.compile`d so a wrongly-regenerated golden
// can't lock in INVALID bytes.

import { compileCached } from "./_selfhost_cache.ts";
import { runWasm } from "../compiler/compile.ts";
import { GOLDENS } from "./selfhost/goldens.ts";

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

// The golden module set (coverage matrix) and its `Golden` type live in
// `tests/selfhost/goldens.ts`, single-sourced so the byte-exact pin below and
// the self-hosting fixpoint proof drive the IDENTICAL source set.

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
  new URL(`./golden/${name}.wasm`, import.meta.url);

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
      // Deliberate, reviewed regenerate path. Writes the raw wasm bytes as a
      // binary `.wasm` fixture (git-tracked as binary via .gitattributes).
      Deno.mkdirSync(new URL("./golden/", import.meta.url), { recursive: true });
      Deno.writeFileSync(goldenPath(g.name), actual);
      return;
    }

    let expected: Uint8Array<ArrayBuffer>;
    try {
      expected = Deno.readFileSync(goldenPath(g.name));
    } catch {
      throw new Error(
        `missing golden tests/golden/${g.name}.wasm — ` +
          `regenerate deliberately with UPDATE_GOLDEN=1 deno test -A --no-check ` +
          `tests/selfhost_emit_golden_test.ts`,
      );
    }

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
    // first-diff above): identical length, identical bytes.
    if (
      expected.length !== actual.length ||
      !actual.every((b, i) => b === expected[i])
    ) {
      throw new Error(`GOLDEN DRIFT in ${g.name}: bytes differ`);
    }
  });
});
