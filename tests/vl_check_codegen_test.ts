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
// The `u8[]`-into-a-`std:array`-generic specimen that followed it is gone too, and it left the
// class by a different door than a codegen fix: the RULE it violates ("`u8[]` cannot be passed
// to a generic parameter" — `T` ranges over value types, `u8` is storage) already existed and
// reached only the DIRECT spelling, because it sits in the argument loop and a UFCS receiver
// arrives ahead of one. Giving `ufcsCallTy` the receiver rung turned every UFCS spelling into
// the same checker error its direct twin already gave. Its grid is
// `tests/cases/std/error-u8-array-generic.vl`, which runs the two spellings side by side.
//
// The object-literal-into-a-`Circle | null`-parameter specimen that followed it is gone too, and
// so is the WHOLE `nulvariant` call-boundary class it belonged to. That class was three filed
// rows — the literal needing the niche and getting a box, a narrowed niche needing a box and
// getting none, and the monomorphizer's pin answering `i32` for both reps — and gridding the
// cross product turned up eleven more cells of the same two roots at other POSITIONS (a struct
// field's three code-16 sites, a local assignment, a capture). All of it graduated to
// `tests/cases/soundness/nulvariant-call-boundary.vl` and `…/nulvariant-generic-pin.vl`, and
// the two reps the pin still cannot NAME are loud now
// (`…/error-generic-nulreflist-field-pin.vl`, `…/error-generic-u8-list-pin.vl`).
//
// The specimen that survived that sweep was the NARROWED-ARGUMENT cell (D25): a narrowed
// `Circle | null` handed to a generic identity `<T>(x: T): T` came back out with the
// instance's declared result type, because the pin read the PARAMETER's annotation
// (`Circle | null`) while the checker had already typed the narrowed expression `Circle`.
// That is closed and it took a RULING rather than an arm (`DECISIONS.md`, "which channel
// owns a narrowed argument's type"): the instance's RESULT now substitutes through the same
// column its parameter slot and body bindings take, so an instance is a function of its
// registry key, and a narrowed argument pins the narrowed spelling wherever that spelling is
// one of the annotation's own members. Its grid is
// `tests/cases/soundness/generic-narrowed-arg-pin.vl`, all 24 cells running, and it reddened
// this file exactly as intended.
//
// THE D26 SPECIMEN THAT STOOD HERE — `std:array`'s `reduce` instantiated twice in one
// program, once at a UNION accumulator and once at one of that union's own MEMBER structs —
// LASTED ONE COMMIT. It is closed, and the close is worth a sentence because the reason this
// constant kept naming it was wrong: the diagnosis in its own pin (a heap-type TWIN the two
// tables never cross-dedup) described a true fact that was not the mechanism. The mechanism
// was that `letInitReboxesToVariant` compared the two tables using ONE index that belongs to
// the VARIANT namespace, and its `< sHeapIdx.length` test was a BOUNDS check standing in for
// a namespace check. Graduated to `tests/cases/unions/unannotated-bind-variant-call-beside-plain-struct.vl`
// and to the fifth accumulator of `tests/cases/std/array-reduce-narrowed-variant-init.vl`.
//
// THE D30 SPECIMEN THAT STOOD HERE — the CALLER's view of an inferred REF-VALUED map
// return from an if-arm TAIL assignment — IS CLOSED. It was the one this constant had
// NAMED as its own successor, which is the practice that keeps the swap a two-line edit
// instead of a re-derivation, and it went the same way: the call site was asking a
// different question than the callee. #1938 gave the CALLEE's result valtype its map SHAPE
// (`inferredRetMapSlot`); the CALL SITE resolved the same function through
// `mapRetExprShape(fnRetExprOf(...))`, and `fnRetExprOf` reads the body's last STATEMENT,
// which for a tail `if` is not an expression at all. The call site now asks the callee's own
// function. What kept the row FILED rather than fixed was real and is handled rather than
// dodged: routing the call site there opens a cycle through an un-annotated cell's
// initializer, ablated to measure rather than argued about — under 3s to `the call stack was
// exhausted` with the in-flight check deleted, and 317s of silent hang with no guard
// machinery at all. The guard's answer on re-entry is the CHECKER's recorded type on the call
// node, not the mono map — returning the mono map would have reintroduced the very defect for
// the self-referential case. Graduated
// to `tests/cases/maps/inferred-map-return-if-arm-tail-caller.vl`, 1,215 grid cells of which
// 383 moved and none moved backward, and it reddened this file exactly as intended.
//
// THE D32 SPECIMEN THAT STOOD HERE — a `Circle[]` ref-list ELEMENT resolving its heap through
// the STRUCT table whenever a LAYOUT TWIN of the element type exists — LASTED ONE COMMIT, and
// it was pinned and closed by two branches open at the same time. `rlElemStructRow`'s
// canon-key rung now declines for a name the variant table claims, which is the exact
// COMPLEMENT of the gate `exprVariantIndex`'s `Index` arm had carried all along: one
// predicate, read in two directions, so the array a `Cat[]` read unpacks through `uVarHeap`
// is the array the heap pass types. 140 of a 480-cell grid moved and none moved backward.
// Graduated to `tests/cases/unions/variant-element-list-beside-layout-twin.vl` — seven
// consumptions rather than the one this constant needed — and
// `xfail-miscompile-list-elem-struct-twin.vl` is DELETED, which is that file's own written
// instruction for the day it starts passing.
//
// THE D33 SPECIMEN THAT STOOD HERE — a type parameter FIRST BOUND through a CALLBACK'S
// ANNOTATION resolving a union ARM onto a declared standalone struct of that arm's exact
// layout — IS CLOSED, and it went the way its two predecessors did: the rule the fix needed
// was already written and simply not consulted. `shapeNominalOfTy` maps a structural shape
// back to a nominal NAME through four rungs, and only ONE of them was nominal by
// construction (`structIndexOfTy`, the struct-table arena sidecar). Its twin —
// `variantRowOfTy`, matching `uVarTyIx[i] == ty`, i.e. the arm DECLARATION's own identity —
// existed, was documented as correct, and was not asked. Below it sat two STRUCTURAL
// field-set scans, one per table, and a layout twin is claimed by both, so their fixed order
// was the whole answer. Probed on the row's own witness: `arenaS=-1 arenaV=0 fsS=0 fsV=0`.
// One rung, placed where D32 placed its own — after the arena struct rung, so struct identity
// still wins where it exists. 34 of a 360-cell grid moved, 28 from check-clean invalid wasm
// and 6 from a LOUD emit refusal (`std:array`'s last live carve-out, `A = Circle` beside an
// exact twin, retired in the same predicate), and none moved backward. Graduated to
// `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl` — ten cells including
// both `reduce` parameter orders and the three RECEIVER controls that make the row a property
// rather than a list of positions — and the two `xfail-miscompile-mono-*-twin.vl` pins are
// DELETED, which is those files' own written instruction for the day they start passing.
//
// THE SUCCESSOR AGAIN DID NOT COME FROM THE INVENTORY, and this time it came from the GRID
// built to close the predecessor. D33's 360-cell grid crossed (binding column x substituted
// type x twin) and left 42 cells silent under BOTH compilers — flat across the twin axis,
// which is what said they were a different root. Four rows came out of that residue and out
// of the constructed controls beside it (`silent-class-inventory.md` D34-D37). The one below
// is **D36**: an anonymous `{r: i32}` object literal in a LAMBDA's inferred LIST return, in a
// module that declares BOTH a union arm of that layout and a standalone struct twin of it.
// It needs no import and no generic, it is 14 lines, and it is byte-identical on `235b365b`
// and on the D33 branch — a pin rather than a regression.
//
// Its controls, each ONE line different and each measured rather than inherited: `Dot`
// DELETED is LOUD (`emitProgram: field access but no struct type declared`), and deleting
// `Sq`/`Shape` so `Circle` is not an arm RUNS and prints 7. So it needs BOTH tables to claim
// the layout, which is the family resemblance to D32 and D33 — and it is a DIFFERENT rung
// from both, because the shape here is ANONYMOUS: there is no declared arm being resolved
// onto a twin, there is an inline literal being resolved onto an arm.
//
// Re-RUN against this tree at the swap rather than inherited, which is every property the
// three assertions below need: `vl check` rc 0 with NO diagnostics at all — not even a hint —
// `--codegen` rc 1 with `not valid wasm` + `type mismatch: expected (ref null $type), found
// (ref $type)`, and NO `emit error` marker. Pinned as
// `tests/cases/soundness/xfail-miscompile-lambda-list-anon-elem-arm-twin.vl`.
//
// THE STANDING NOTE ABOUT WHAT TO DO IF THE CLASS EMPTIES IS UNCHANGED. This test needs a
// program that type-checks clean and whose module the engine refuses, and only a real
// miscompile is one — a synthesized module cannot come out of `vl check`. If the class is
// genuinely empty, that is a decision to take deliberately (leave one row open with the
// reason stated here, or retire these three assertions and say what replaced them), not one
// to make by loosening `INVALID_MODULE_SRC` until something matches. What the last three
// swaps add is where to look BEFORE concluding it is empty: the inventory grades only the
// rows someone filed; the std review of the closing change has out-produced it three times
// running; and the GRID built to close a row is now the fourth source, having produced four
// more rows than the row it was built for.
const INVALID_MODULE_SRC = `type Circle = { r: i32 }\n` +
  `type Sq = { s: i32 }\n` +
  `type Shape = Circle | Sq\n` +
  `type Dot = { r: i32 }\n` +
  `\n` +
  `function f() {\n` +
  `  const g = (n: i32) => {\n` +
  `    const o = [{ r: n }]\n` +
  `    return o\n` +
  `  }\n` +
  `  return g(7)[0].r\n` +
  `}\n` +
  `\n` +
  `print(f())\n`;

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
