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

// Type-checks clean, EMITS clean, and the module does not validate: an element read out of
// an INLINE literal-union array, handed back at the same inline type
// (`tests/cases/soundness/xfail-miscompile-inline-litunion-element-read.vl`). The array is
// interned i32 ATOMS (`ctxKeepsLitUnion` preserves at `RC_ELEM`) while the return position
// softens to a string reference, so the function is emitted `(result (ref $string))` over a
// body whose `array.get` yields an i32.
// Distinct from EMIT_ERROR_SRC above: the emitter raises nothing at all here.
//
// The previous specimen was a union whose two CLOSURE arms are ONE TYPE (field-permuted
// parameter objects) — fixed by making `emitIs`' union-box arm ask the STORAGE question as
// well as the registry one, and `tySameAt` compare object fields by SET rather than by
// position, so this test went red exactly as the note below said it would, and the same
// instruction was followed.
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
// The previous specimen was the PLAIN-FUNCTION rung of this same family —
// `function pick(self: ("a" | "b")[]): "a" | "b"` — and it graduated: the RETURN boundary
// grew the inline-literal-union arm it lacked (`retStrWiden` covered `: string`,
// `string | null` and an inferred `string`, but not `: "a" | "b"`), so the atom now widens
// into the string slot and `soundness/xfail-miscompile-inline-litunion-element-read.vl` is a
// `@run` fixture. Same instruction as ever, and followed here: swap in another
// `@no-instantiate` shape rather than deleting the assertion.
//
// This specimen is the GENERIC rung of the family, one position further out — the fix above
// was per-BOUNDARY (each decides its slot type in its own ladder), so the generic instance's
// boundary is untouched by it. The remaining rungs are a BINDING (`const v: "a" | "b" =
// tags[0]`, which is worse: a VALID module printing the raw atom id, and unpinnable with the
// directives that exist) and this one. Both wait on `ctxKeepsLitUnion` picking a
// position-independent rule, which is why this should outlast the last few specimens.
// A program that CHECKS CLEAN and whose module does not validate — the whole point of
// `--codegen`. It must be a LIVE instance of that class, so it needs replacing whenever
// the defect it rides closes.
//
// It used to be `function pick<T>(self: T[]): T { self[0] }` over `("a" | "b")[]` — the
// generic rung of the inline-literal-union element family. That rung is FIXED (see
// `tests/cases/soundness/generic-litunion-element-read.vl`) and the program now runs, which
// reddened this file exactly as intended.
//
// Its previous replacement was the same family's ELEMENT-ASSIGNMENT boundary
// (`self[1] = self[0]` inside a generic instance over `("a" | "b")[]`). That closed too —
// the filing's "the STORE direction has no mirroring narrow" was a mis-diagnosis; the store
// ladder's TARGET classification was blind inside a monomorphized instance, so the ladder
// fell past its atom-element arm to a string WIDEN that should never have been reached.
// See `tests/cases/soundness/generic-litunion-element-bind-and-store.vl`.
//
// Its previous replacement left the literal-union family entirely: `??` over a LIST INDEX
// whose element is `string | null`, which lowered to an if-expression typed at the NON-NULL
// string it promises and re-read `array.get` off an `(array (mut (ref null $str)))` backing
// in its ELSE arm without narrowing. That closed too — the re-read is gone, replaced by the
// `br_on_non_null` block every other nullable-REF niche already used, so the narrow IS the
// branch and there is no value arm left to get wrong. See
// `tests/cases/lists/nullable-elem-list-coalesce.vl`, the `@run` fixture that replaced the
// pin, and it reddened this file exactly as intended.
//
// The specimen that replaced THAT was `std:array`'s `mapIndexed` with a STRING literal-union
// callback result `U`, and it lasted one commit: it is fixed here. A monomorphized instance
// was binding its body's annotated locals from the pin NAME and its RETURN annotation from
// the ARGUMENT's arena row, and the two disagree at a function-type parameter — whose pin
// renders the type parameter's SOFTENED spelling — so one instance spelled `U[]` as both an
// atom-backed and a string-backed list. See
// `tests/cases/std/array-mapindexed-litunion-result.vl`, the graduated grid.
//
// TWO SPECIMENS IN A ROW WERE SHAPES SOMEONE WAS ALREADY REPAIRING, which is how this
// constant ends up naming a program that runs. The one chosen next for NOT being anyone's
// current work was CALLING a function VALUE whose annotated type declares an INLINE string
// literal-union RESULT — `ctxKeepsLitUnion` preserved a literal union's members at
// `RC_FN_RES` and softened them at `RC_ROOT`, so `const f: (i32) => ("a" | "b") = toAB`
// interned a signature whose result is the i32 ATOM while the `toAB` it held returned the
// string ref its own declaration softened to. It is fixed: the three surviving preserve
// positions are CONTAINERS (element / field / map value), a function RESULT is the same
// scalar position a declaration's return annotation occupies, and that one is `RC_ROOT`. Its
// grid is folded into `tests/cases/literal-unions/fntype-litunion-result-controls.vl`, all
// eight cells running.
//
// THE WHOLE LITERAL-UNION BOUNDARY CLASS WENT WITH IT, which is why this specimen leaves the
// family entirely rather than moving one position over inside it: the monomorphized ARGUMENT,
// the function-value CALL RESULT, the callback reaching a call through a BINDING and the call
// result stored into a LIST or MAP all closed together, and the `@no-instantiate` class was
// briefly EMPTY — which the tripwire below would have read as a sweep that saw nothing.
//
// This specimen is therefore a `u8[]` handed to a `std:array` generic. It is not a literal
// union at all: `u8` is a PACKED array element with no value-position rep, and a generic call
// spells `u8` nowhere, so the instance is pinned from the argument's REP (the byte-array
// wrapper) while its body resolves the i32-list wrapper. `std/array.vl`'s storage-type
// section has recorded it as pre-existing and unpinned since #1927, with all three of its
// outcomes measured; it is now pinned as
// `tests/cases/std/xfail-miscompile-u8-array-generic-needle.vl`.
const INVALID_MODULE_SRC = `import { indexOf } from "std:array"\n` +
  `\n` +
  `const xs: u8[] = [1, 2, 3]\n` +
  `print(xs.indexOf(2))\n`;

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
    // TWO DIRECTORIES, because the class is not confined to one. `soundness/` was the only
    // home until the inline-litunion element family's generic rung closed and graduated out
    // of it, leaving the last live case in `std/` — at which point a soundness-only scan
    // found ZERO marked files and tripped the "read nothing" guard below. The guard was
    // right and the scan was too narrow: a check-clean-invalid-wasm shape can be filed
    // wherever its subject lives. Membership has moved repeatedly since, and the literal-union
    // BOUNDARY class then emptied both at once — its four directions closed together — before
    // the std review of that same commit refilled `soundness/` with a shape from outside the
    // family (a narrowed NULLABLE function value passed as an argument) and the `u8[]` generic
    // argument refilled `std/`. One member per directory again, from two unrelated causes.
    //
    // THE SCAN MUST STAY TWO-DIRECTORY REGARDLESS. An empty directory costs one `vl check`
    // invocation; a directory dropped because it happened to be empty is what stops the gate
    // seeing the class move back into it, and a `soundness/`-only scan is exactly the
    // narrowing that tripped the "read nothing" guard the last time this list emptied. The
    // guard below is on the UNION, not on either directory.
    const dirs = [`${ROOT}/tests/cases/soundness`, `${ROOT}/tests/cases/std`];
    const marked = new Set<string>();
    let scanned = 0;
    for (const dir of dirs) {
      for await (const e of Deno.readDir(dir)) {
        if (!e.isFile || !e.name.endsWith(".vl") || e.name === "README.vl") continue;
        scanned++;
        const src = await Deno.readTextFile(`${dir}/${e.name}`);
        if (/^\/\/\s*@no-instantiate\b/m.test(src)) marked.add(e.name);
      }
    }
    // ONE INVOCATION PER DIRECTORY. `vl check` takes a single path — handing it two
    // silently sweeps NEITHER (measured: two dirs flagged 0, each alone flagged its own),
    // which would have turned this gate into a test that passes by looking at nothing.
    const dec = new TextDecoder();
    const flagged = new Set<string>();
    for (const dir of dirs) {
      const { stdout, stderr } = await new Deno.Command(VL, {
        args: ["check", "--codegen", "--concise", dir, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
      }).output();
      for (const line of (dec.decode(stdout) + dec.decode(stderr)).split("\n")) {
        if (!line.includes("not valid wasm")) continue;
        const file = line.slice(0, line.indexOf(":"));
        flagged.add(file.slice(file.lastIndexOf("/") + 1));
      }
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
    // THE "READ NOTHING" GUARD, on the SCAN rather than on the CLASS. It used to require at
    // least one marked file, which conflates two different states: a scan that walked no files
    // (the real hazard — a renamed directory, a filter that matches nothing) and a class that
    // is genuinely EMPTY, which is the outcome every fix in this family is working toward. The
    // literal-union boundary class emptied both directories at once and the old form would have
    // reddened on a tree with no defect in it. What has to be non-zero is the number of case
    // files this test READ; whether any of them is marked is the finding, not the precondition.
    if (scanned === 0) {
      throw new Error("the @no-instantiate sweep walked no case files — check the directories");
    }
  },
});
