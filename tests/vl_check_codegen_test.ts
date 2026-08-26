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
// THAT SECOND INVARIANT IS TESTED TWICE, ON PURPOSE, AND THE SPLIT IS THE POINT OF
// THIS FILE'S SHAPE:
//
//   * the MECHANISM — validator runs, the `invalid-module` diagnostic renders with
//     the engine's own reason, the exit code goes non-zero — is exercised by the
//     host's TEST-ONLY fault injection ($VL_FAULT_INJECT, scripts/vl-host/src/main.rs).
//     It needs no compiler bug, so it is PERMANENT.
//   * the end-to-end PAIRING — a real VL program `vl check` calls clean and
//     `--codegen` catches — can only be tested with a live miscompile, because a
//     synthesized module cannot come out of `vl check`. `INVALID_MODULE_SRC` below
//     is that specimen, and it is only ever as permanent as the defect it rides.
//
// Before the split, `INVALID_MODULE_SRC` carried BOTH jobs, which meant this file
// could only assert anything at all while a live miscompile existed. The genealogy
// above that constant is what that cost: the constant was re-pointed at a fresh
// defect at least five times in one day, each swap needing someone to go find
// another one, and the two ways out were both bad — loosen the assertion until
// something matches, or leave a real defect unfixed to feed a test. The mechanism
// half no longer participates in that. The pairing half still does, and when the
// class is empty that is now a DECLARED, corpus-CHECKED state (see the standing
// note and the tripwire) rather than a silent gap.
//
// The emit-error fixture (`EMIT_ERROR_SRC`) is a closure whose result struct carries
// a nullable REF-list field — well-formed as a type (fast path clean), with no
// lowerable rep, so the emitter rejects. If it graduates, swap in any other shape
// that type-checks clean but emit-errors; that class is not scarce, and unlike
// `INVALID_MODULE_SRC` the emitter names its own error. (The native emitter reports
// it with an `error [line:col]` diagnostic plus the `(emit error)` summary marker.
// We assert the exit-code contract + that emit-stage marker, not the wording.)
//
// This is the native counterpart to the retired tests/cli_codegen_test.ts.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
// The fault-injected tests take the SAME gate — they drive the same binary over the
// same seed, so there is nothing extra for them to skip on.

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

// `VL_FAULT_INJECT: ""` is pinned rather than left inherited, and that is not
// tidiness: an empty value is the host's explicit "no fault", so every test here
// that expects an UNINJECTED run gets one even if the surrounding shell has the
// variable set. Without the pin, one stray export in a developer's environment
// would turn the controls below green-for-the-wrong-reason and the injected tests
// into tests of nothing.
const check = async (
  source: string,
  flags: string[] = [],
  env: Record<string, string> = {},
): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_cg_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["check", file, "--concise", "--compiler", COMPILER, ...flags],
      stdout: "null",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_FAULT_INJECT: "", ...env },
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
// THE SUCCESSOR WAS NOT LEFT TO BE RE-DERIVED, AND IT DID NOT COME FROM THE INVENTORY. The
// note this paragraph replaces said D30 and D32 were the last two live rows and that there
// might be no live member of the class left — which was true of the FILED rows and false of
// the tree. The `std-api-reviewer` pass over D32's own retirement went looking for the cross
// cell that retirement had no fixture for and found one. That is the third consecutive time
// that review has produced the closing change's next piece of work — D26 from the ninth
// retirement's review, D32's understatement from D26's, and a whole row from D32's — and only
// the first and third of those are rows, which is the honest form of the pattern:
// `silent-class-inventory.md` **D33** — a type parameter first
// bound through a CALLBACK'S ANNOTATION resolving a union ARM onto a declared standalone
// struct of that arm's exact layout. The constant below is its `mapIndexed` spelling
// (`(T, i32) => Circle`); `reduce`'s accumulator at `A = Circle[]` is the same row and is
// pinned beside it. The row was first written up as "the callback-RESULT position" and the
// review's SECOND pass corrected it to the property, with the control that decides it: the
// same `Circle[]` reaching a type parameter through the RECEIVER runs, twin and all.
//
// IT IS THE SAME FAMILY AS D32 AND A DIFFERENT RUNG, which is why D32's gate does not reach
// it: the element NAME of the instance's minted `U[]` is not `Circle` at all — a probe at
// `rlElemStructRow` reads `name=[Dot] arena=0 byname=0 canon=0 vi=-1`, so the monomorphizer's
// substitution had already resolved `U`'s structural spelling onto the declared twin's
// NOMINAL name, and every rung below is answering correctly for the name it was given.
// Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0 with NO
// diagnostics at all, `--codegen` rc 1 with `not valid wasm` + `type mismatch: expected (ref
// $type), found (ref $type)`, and NO `emit error` marker — every property the three
// assertions below need. Pre-existing and byte-identical on `a80c6717`. Pinned as
// `tests/cases/soundness/xfail-miscompile-mono-result-list-elem-twin.vl`.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE STANDING NOTE, REWRITTEN ONCE — this is now the PAIRING half only.
//
// The genealogy above is the record of a constant that could only ever name a live
// compiler bug, re-pointed at a fresh one at least five times in a single day. What
// changed is not that record but what depends on it: the MECHANISM this file exists
// to prove (validator runs, `invalid-module` renders with the engine's reason, exit
// goes non-zero) moved to the fault-injected tests above and is permanent. This
// constant now carries ONE job — the end-to-end pairing, "a real VL program that
// `vl check` calls clean and `--codegen` catches" — which a synthesized module
// genuinely cannot stand in for, because a synthesized module cannot come out of
// `vl check`. That job is worth keeping while a specimen exists and is worth nothing
// faked.
//
// WHAT TO DO WHEN THE CLASS REFILLS OR EMPTIES — the whole procedure, in one place:
//
//   * EMPTIES (the defect you just closed was the last one). Set this constant to
//     `null` and delete the `@no-instantiate` directives in the SAME commit. The
//     three specimen tests below deactivate, the file says so out loud at load, and
//     the tripwire at the foot CHECKS that the corpus agrees. Add a paragraph to the
//     genealogy saying what closed. Do NOT comment the tests out, and do NOT loosen
//     an assertion until something matches — that is the failure this structure
//     exists to make impossible.
//   * REFILLS (a new check-clean-invalid-wasm shape lands, or you find one). Set
//     this constant to it, and pin it `@no-instantiate` in the SAME commit — #1939:
//     an unpinned successor reddens the tripwire, and the tripwire is now what makes
//     "the class is empty" a checkable claim instead of a comment.
//
// BEFORE CONCLUDING IT IS EMPTY, look past the inventory: it grades only the rows
// someone filed, and the std review of the closing change has out-produced it three
// times running. That advice is unchanged and it was nearly needed twice.
//
// Exactly one of the two states above is legal at any time, and which one holds is
// CROSS-CHECKED against the corpus — see the biconditional in the tripwire. Neither
// state can be entered halfway.
// ─────────────────────────────────────────────────────────────────────────────
const INVALID_MODULE_SRC: string | null = `import { mapIndexed } from "std:array"\n` +
  `\n` +
  `type Circle = { r: i32 }\n` +
  `type Sq = { s: i32 }\n` +
  `type Shape = Circle | Sq\n` +
  `type Dot = { r: i32 }\n` +
  `\n` +
  `function mk(x: i32, i: i32): Circle { return { r: x + i } }\n` +
  `\n` +
  `print(mapIndexed([1, 2], mk)[0].r)\n`;

/// Whether a live specimen is named. Gates the three tests below, and is the left
/// half of the tripwire's biconditional.
const HAVE_SPECIMEN = INVALID_MODULE_SRC !== null;

// Reaching this with no specimen means the `ignore` gate below is wrong — a wiring
// bug in this file, not a fact about the tree — so it throws rather than skipping.
const specimen = (): string => {
  if (INVALID_MODULE_SRC === null) {
    throw new Error("a specimen test ran with no specimen — its `ignore` gate is wrong");
  }
  return INVALID_MODULE_SRC;
};

// An inactive test is announced, never silent. The distinction being drawn here is
// the one that matters to whoever reads the run: the mechanism is still covered, the
// pairing is not, and that is a state someone chose and the tripwire verified.
if (ENABLED && !HAVE_SPECIMEN) {
  console.warn(
    "[vl-check-codegen] the check-clean-invalid-wasm class is EMPTY — the three end-to-end " +
      "specimen tests are INACTIVE. The MECHANISM (validator runs → `invalid-module` renders " +
      "→ non-zero exit) stays covered by the fault-injected tests. What is not covered is the " +
      "PAIRING. See the standing note above INVALID_MODULE_SRC for what to do when it refills.",
  );
}

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

// --- the validate-and-render path, without a live compiler bug ---------------
//
// `$VL_FAULT_INJECT=corrupt-validate-bytes` makes the host rewrite the first
// function body of the module CMD_VALIDATE is about to validate, so the bytes fail
// the engine's validator with a TYPE error. The seam is BETWEEN emission and
// validation, so everything downstream of it is the real path: wasmtime's real
// `Module::validate`, its real message crossing back on the real `cliResult`
// channel, cli.vl's real positionless `invalid-module` diagnostic, the real exit
// code. Only the reason the bytes are bad is synthetic.
//
// The host mutates the bytes that ARRIVED rather than substituting a hand-authored
// blob, and refuses to inject into anything that is not a module. That refusal is
// what stops these tests going green over a dead `rbyte` channel: with a
// substitution, an emitter that produced nothing would still have failed validation
// and these would still have passed.
//
// ALTERNATIVES REJECTED, because the reasons are the design:
//   * a hand-authored invalid `.wasm` handed to the host directly — covers
//     `Module::validate` and wasmtime's wording, and NOTHING of the CMD_VALIDATE
//     round-trip, `cliValidateCommit`, the cli.vl rendering or `cliExitCode`, which
//     is nearly all of the wiring these tests exist to prove;
//   * calling the renderer with a canned string — never runs the engine at all;
//   * a test-only branch in `compiler/*.vl` — would change emitted bytes and
//     pollute the byte-exact seed fixpoint. The host is deliberately outside it;
//   * a bare CLI flag — reachable by a user, and a documented flag is API. The hook
//     needs an unmistakable variable name AND a named value, and an unrecognized
//     value is a hard error (asserted below) so a typo cannot silently disarm it.
const FAULT_INVALID_MODULE = { VL_FAULT_INJECT: "corrupt-validate-bytes" };

Deno.test({
  name: "vl-check-codegen --codegen (fault-injected): the engine's refusal renders as `invalid-module`",
  ignore: !ENABLED,
  fn: async () => {
    // THE CONTROL IS IN THE SAME TEST, over the SAME source and the SAME flags, so
    // the pair cannot drift apart: the only difference between these two runs is
    // one environment variable. If the uninjected run were ever non-zero, the
    // injected run's non-zero would prove nothing.
    const control = await check(CLEAN_SRC, ["--codegen"]);
    if (control.code !== 0) {
      throw new Error(
        `the control run must be clean or the injected run proves nothing, got ${control.code}:\n${control.err}`,
      );
    }
    const { code, err } = await check(CLEAN_SRC, ["--codegen"], FAULT_INVALID_MODULE);
    if (code === 0) {
      throw new Error(`expected non-zero exit — the injected module does not validate:\n${err}`);
    }
    // Same three properties the specimen test below asserts, which is what makes
    // this a real replacement for its MECHANISM half: the wording that says the
    // program is not at fault, the engine's own reason passed through, and NO
    // emit-stage marker (the emitter ran to completion; the corruption is after it).
    if (!err.includes("not valid wasm")) {
      throw new Error(`expected the invalid-module diagnostic, got:\n${err}`);
    }
    if (!err.includes("type mismatch")) {
      throw new Error(`expected the engine's own reason to be passed through, got:\n${err}`);
    }
    if (err.includes("emit error")) {
      throw new Error(`expected no emit-stage error — the emitter succeeded:\n${err}`);
    }
  },
});

Deno.test({
  name: "vl-check-codegen (fault-injected, no --codegen): still exits 0 — the seam is never reached",
  ignore: !ENABLED,
  fn: async () => {
    // THE HONESTY CHECK ON THE CODEGEN-FREE PATH. The plain-`vl check` tests assert
    // exit 0 because that path never emits. With the fault armed, that claim becomes
    // POSITIVELY testable rather than assumed: the injection lives at CMD_VALIDATE,
    // the codegen-free path issues no CMD_VALIDATE, so the 0 here is the same 0 for
    // the same reason. If `check` ever started emitting on the fast path, this goes
    // red — and it is the only test in this file that would.
    const { code, err } = await check(CLEAN_SRC, [], FAULT_INVALID_MODULE);
    if (code !== 0) {
      throw new Error(
        `the codegen-free path must not reach the validate seam, got ${code}:\n${err}`,
      );
    }
  },
});

Deno.test({
  name: "vl-check-codegen (fault-injected, --no-validate): exits 0 — the opt-out is upstream of the seam",
  ignore: !ENABLED,
  fn: async () => {
    const { code, err } = await check(
      CLEAN_SRC,
      ["--codegen", "--no-validate"],
      FAULT_INVALID_MODULE,
    );
    if (code !== 0) {
      throw new Error(`--no-validate must skip the validate seam entirely, got ${code}:\n${err}`);
    }
  },
});

Deno.test({
  name: "vl-check-codegen: an unrecognized $VL_FAULT_INJECT value is a hard error, not a no-op",
  ignore: !ENABLED,
  fn: async () => {
    // The failure mode this forecloses: a typo in the fault NAME leaves the injecting
    // test above exiting exactly the way an uninjected run does. That test would then
    // fail on the exit code, but only after someone spent a while wondering why the
    // injection "didn't work" — so the host names it instead.
    const { code, err } = await check(CLEAN_SRC, ["--codegen"], {
      VL_FAULT_INJECT: "corupt-validate-bytes",
    });
    if (code === 0) {
      throw new Error(`an unknown fault must not be silently ignored, got ${code}:\n${err}`);
    }
    if (!err.includes("unrecognized $VL_FAULT_INJECT")) {
      throw new Error(`expected the host to name the bad fault value, got:\n${err}`);
    }
  },
});

// --- a module the emitter accepts and the engine refuses ---------------------

Deno.test({
  name: "vl-check-codegen (no --codegen): an invalid-module file exits 0 (no emit at all)",
  ignore: !ENABLED || !HAVE_SPECIMEN,
  fn: async () => {
    const { code } = await check(specimen());
    if (code !== 0) throw new Error(`expected exit 0 on the codegen-free path, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-codegen --codegen: an invalid module is an `invalid-module` error",
  ignore: !ENABLED || !HAVE_SPECIMEN,
  fn: async () => {
    const { code, err } = await check(specimen(), ["--codegen"]);
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
  ignore: !ENABLED || !HAVE_SPECIMEN,
  fn: async () => {
    const { code } = await check(specimen(), ["--codegen", "--no-validate"]);
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
        // `VL_FAULT_INJECT: ""` for the same reason `check` pins it: with the hook
        // armed in the surrounding shell, EVERY file in these directories would flag
        // `not valid wasm` and this gate would report the whole corpus as the class.
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_FAULT_INJECT: "" },
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
    // THE CLASS-EMPTY DECLARATION IS A CHECKABLE CLAIM, not a comment. #1939 recorded
    // that a successor specimen must be pinned in the SAME commit or this gate goes
    // red; read from the other end, `INVALID_MODULE_SRC` being non-null and the marked
    // set being non-empty are the SAME FACT stated in two files, so they can be
    // cross-checked. Each half alone is a state someone can enter by accident:
    //   * a specimen named but never pinned — the gate above then never sees it, and
    //     the corpus has no frozen record of the shape;
    //   * the constant left pointing at a program that now RUNS, while the pins that
    //     would have caught that are already gone.
    // Before this check, "the class is empty" was a sentence in a comment that nobody
    // could grade. Now it is the only state in which this passes with no pins.
    //
    // It binds to the SCAN's two directories, which is where every pin has ever lived.
    // Pin a specimen somewhere else and this reddens — add that directory to `dirs`
    // above, which the note there already asks for on its own terms.
    if (HAVE_SPECIMEN !== (marked.size > 0)) {
      throw new Error(
        HAVE_SPECIMEN
          ? "INVALID_MODULE_SRC names a live specimen but NOTHING in the scanned " +
            "directories is marked @no-instantiate. Pin the specimen in this commit " +
            "(#1939), or set INVALID_MODULE_SRC = null if the class is really empty."
          : "INVALID_MODULE_SRC is null — this file declares the check-clean-invalid-wasm " +
            `class EMPTY — but the corpus still pins ${JSON.stringify([...marked].sort())}. ` +
            "One of those is the next specimen; name it, or drop the directives.",
      );
    }
  },
});
