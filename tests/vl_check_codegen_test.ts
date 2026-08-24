// NATIVE `vl check --codegen` — the opt-in full-pipeline flag that also runs the
// emitter, so codegen/emit-stage errors (which the fast type-check path never
// reaches) are surfaced. All VL policy (compiler/cli.vl), driven over the
// command-queue pump.
//
// Key invariant — a file that type-checks clean but fails the emitter:
//   `vl check <file>`            exits 0  (fast path, no emit, misses the error)
//   `vl check --codegen <file>`  exits 1  (emitter runs, error surfaced)
//
// SECOND invariant, and a different failure entirely — a file the emitter lowers
// WITHOUT complaint into bytes the engine refuses:
//   `vl check --codegen <file>`                exits 1  (`invalid-module`)
//   `vl check --codegen --no-validate <file>`  exits 0  (the opt-out)
// The emitter returning 0 means "it ran to completion", not "these are a module";
// only the engine can decide the latter, so `--codegen` hands the bytes to the host
// (CMD_VALIDATE) and reports the verdict. Before that, this whole class — a clean
// `--codegen` over a program that cannot load — was invisible at the gate that
// promises the program lowers.
//
// The fixture is a `Box` with a nullable-list field (`xs: i64[] | null`): the type
// is well-formed (fast path clean) but a nullable list has no rep in a struct field,
// so the emitter rejects. This is a live rep-fuzz baseline gap (nullable-list-locals
// family) — if it graduates, swap in any other shape that type-checks clean but
// emit-errors. (The native emitter reports it as `only i32 / boolean / string /
// array struct fields are supported` + the `(emit error)` summary marker. We assert
// the exit-code contract + that emit-stage marker, not the host-specific wording.)
//
// This is the native counterpart to the retired tests/cli_codegen_test.ts.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-codegen] skipped — missing vl binary or seed wasm.");
}

const check = async (
  source: string,
  flags: string[] = [],
): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_cg_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["check", file, "--concise", "--compiler", COMPILER, ...flags],
      stdout: "null",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
    }).output();
    return { code, err: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// Type-checks cleanly, fails the emitter (a closure whose result struct carries a
// nullable REF-list field has no lowerable rep, so the call's sig never interns).
// (The former `{ v: i32, xs: i64[] | null }` struct spelling lowers since the four
// distinct-backing nullable scalar-list FIELD codes 31-34 landed.)
const EMIT_ERROR_SRC =
  `function makeIt(): (i32) => {f: (i32 | null)[] | null} {\n` +
  `  return (q0) => ({ f: [1, 2] })\n` +
  `}\n` +
  `function useIt() {\n` +
  `  const v: (i32) => {f: (i32 | null)[] | null} = makeIt()\n` +
  `  const s = v(1)\n` +
  `  print(0)\n` +
  `}\n` +
  `useIt()\n`;

// A normal, fully valid file — passes both the fast and the full path.
const CLEAN_SRC = `let x = 1\nprint(x)\n`;

// Type-checks clean, EMITS clean, and the module does not validate: a union whose two
// CLOSURE arms are ONE TYPE — the parameter types `{a: i32, b: string}` and
// `{b: string, a: i32}` are field-permuted, which the 2026-08 ruling makes the same type
// (`tests/cases/soundness/xfail-miscompile-permuted-object-closure-arms.vl`).
// Distinct from EMIT_ERROR_SRC above: the emitter raises nothing at all here.
//
// The previous specimen was CONSTRUCTING the inline-object arm of a union whose field is a
// nullable map — fixed by giving the VARIANT-literal emitter the `vcode == 29` construct
// seed its plain struct-literal sibling had, so this test went red exactly as the note
// below said it would, and the same instruction was followed.
//
// The previous specimen was a `string | null` argument at a GENERIC call, whose instance
// declared a NON-null parameter — fixed by giving the module-scope pin arm the nullable
// ladder its function-scoped siblings had, so this test went red exactly as the note below
// said it would, and the same instruction was followed.
//
// The previous specimen was issue #1792 — a DECLARED alias over two literal unions
// (`type A = 1 | 2; type B = 3 | 4; type U = A | B`), which is fixed, so this test went
// red exactly as the note here said it would. Same instruction stands: if this shape
// graduates, swap in any other `@no-instantiate` shape from tests/cases/soundness/
// rather than deleting the assertion. This one is LIVE WORK — issue #1864 owns the
// silent-wrong-value tier underneath it — so expect to follow that instruction soon.
const INVALID_MODULE_SRC =
  `type PA = { a: i32, b: string }\n` +
  `type PB = { b: string, a: i32 }\n` +
  `type FA = (PA) => i32\n` +
  `type FB = (PB) => i32\n` +
  `function pm(x: FA | FB) { if x is FA { print(1) } }\n` +
  `function fa(v: PA) { v.a }\n` +
  `pm(fa)\n`;

// --- emit-erroring file ------------------------------------------------------

Deno.test({
  name: "vl-check-codegen (no --codegen): emit-erroring file exits 0 (fast path misses it)",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(EMIT_ERROR_SRC);
    if (code !== 0) throw new Error(`expected exit 0 on the codegen-free path, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-codegen --codegen: emit-erroring file exits non-zero with an emit error",
  ignore: !ENABLED,
  fn: async () => {
    const { code, err } = await check(EMIT_ERROR_SRC, ["--codegen"]);
    if (code === 0) throw new Error(`expected non-zero exit with --codegen, got ${code}`);
    // The emitter ran and the failure surfaced as an error at the emit stage:
    // the `--concise` `error [line:col]` diagnostic plus the `(emit error)`
    // summary marker that distinguishes an emit-stage failure from a type error.
    if (!err.includes("error [") || !err.includes("emit error")) {
      throw new Error(`expected an emit-stage error, got:\n${err}`);
    }
  },
});

// --- clean file --------------------------------------------------------------

Deno.test({
  name: "vl-check-codegen: a clean file passes both paths (exit 0 each)",
  ignore: !ENABLED,
  fn: async () => {
    const fast = await check(CLEAN_SRC);
    if (fast.code !== 0) throw new Error(`clean fast path should exit 0, got ${fast.code}`);
    const full = await check(CLEAN_SRC, ["--codegen"]);
    if (full.code !== 0) throw new Error(`clean --codegen should exit 0, got ${full.code}`);
  },
});

// --- a module the emitter accepts and the engine refuses ---------------------

Deno.test({
  name: "vl-check-codegen (no --codegen): an invalid-module file exits 0 (no emit at all)",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(INVALID_MODULE_SRC);
    if (code !== 0) throw new Error(`expected exit 0 on the codegen-free path, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-codegen --codegen: an invalid module is an `invalid-module` error",
  ignore: !ENABLED,
  fn: async () => {
    const { code, err } = await check(INVALID_MODULE_SRC, ["--codegen"]);
    if (code === 0) {
      throw new Error("expected non-zero exit — the module does not validate");
    }
    // Positionless (the validator names a WASM offset, which maps to no VL span),
    // so `--concise` renders it at the 1:1 fallback. What must be present is the
    // wording that says the program is not at fault, plus the engine's own reason.
    if (!err.includes("not valid wasm")) {
      throw new Error(`expected the invalid-module diagnostic, got:\n${err}`);
    }
    if (!err.includes("type mismatch")) {
      throw new Error(`expected the engine's own reason to be passed through, got:\n${err}`);
    }
    // NOT an emit error: the emitter ran to completion and raised nothing. If this
    // starts failing, the failure moved stages and the test above covers it instead.
    if (err.includes("emit error")) {
      throw new Error(`expected no emit-stage error — the emitter succeeded:\n${err}`);
    }
  },
});

Deno.test({
  name: "vl-check-codegen --no-validate: the same file exits 0 (the opt-out works)",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(INVALID_MODULE_SRC, ["--codegen", "--no-validate"]);
    if (code !== 0) {
      throw new Error(`--no-validate should restore the old emit-only path, got ${code}`);
    }
  },
});

// --- the corpus tripwire -----------------------------------------------------
//
// `@no-instantiate` is the corpus's own marker for exactly this class: the file
// compiles clean and the module it produces does not load. The gate must find ALL
// of them and NOTHING else — over 2,075 case files that was measured as 11 flagged
// and 11 marked, an exact match. This test re-derives the pair every run, so:
//   * a fixed defect reddens it (delete the `@no-instantiate` directive too);
//   * a NEW check-clean-invalid-wasm shape reddens it (that is a defect to file);
//   * a gate that stops firing reddens it.
// It runs the soundness directory in ONE `vl` invocation — the pump walks it.
Deno.test({
  name: "vl-check-codegen: the invalid-module gate flags exactly the @no-instantiate cases",
  ignore: !ENABLED,
  fn: async () => {
    const dir = `${ROOT}/tests/cases/soundness`;
    const marked = new Set<string>();
    for await (const e of Deno.readDir(dir)) {
      if (!e.isFile || !e.name.endsWith(".vl") || e.name === "README.vl") continue;
      const src = await Deno.readTextFile(`${dir}/${e.name}`);
      if (/^\/\/\s*@no-instantiate\b/m.test(src)) marked.add(e.name);
    }
    const { stdout, stderr } = await new Deno.Command(VL, {
      args: ["check", "--codegen", "--concise", dir, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
    }).output();
    const dec = new TextDecoder();
    const flagged = new Set<string>();
    for (const line of (dec.decode(stdout) + dec.decode(stderr)).split("\n")) {
      if (!line.includes("not valid wasm")) continue;
      const file = line.slice(0, line.indexOf(":"));
      flagged.add(file.slice(file.lastIndexOf("/") + 1));
    }
    const only = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();
    const unmarked = only(flagged, marked);
    const unflagged = only(marked, flagged);
    if (unmarked.length > 0 || unflagged.length > 0) {
      throw new Error(
        `the gate and the @no-instantiate directives disagree\n` +
          `  flagged but not marked (a NEW invalid-module shape — file it): ${
            JSON.stringify(unmarked)
          }\n` +
          `  marked but not flagged (fixed? then drop the directive): ${
            JSON.stringify(unflagged)
          }`,
      );
    }
    if (marked.size === 0) throw new Error("no @no-instantiate cases found — the sweep read nothing");
  },
});
