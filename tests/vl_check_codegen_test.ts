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
// THE D33 SPECIMEN THAT STOOD HERE — a type parameter FIRST BOUND through a CALLBACK'S
// ANNOTATION resolving a union ARM onto a declared standalone struct of that arm's exact
// layout — IS CLOSED (#1944), and it went the way its two predecessors did: the rule the fix
// needed was already written and simply not consulted. `shapeNominalOfTy` maps a structural
// shape back to a nominal NAME over four rungs, and only ONE was nominal by construction
// (`structIndexOfTy`, the struct-table arena sidecar). Its twin — `variantRowOfTy`, matching
// `uVarTyIx[i] == ty`, the arm DECLARATION's own identity — existed, was documented as
// correct, and was not asked. Below it sat two STRUCTURAL field-set scans, one per table, and
// a layout twin is claimed by both, so their fixed order was the whole answer. Probed on the
// row's own witness: `arenaS=-1 arenaV=0 fsS=0 fsV=0`. One rung, placed where D32 placed its
// own. 34 of a 360-cell grid moved, 28 from check-clean invalid wasm and 6 from a LOUD emit
// refusal (`std:array`'s last live carve-out, retired by the same predicate), none backward.
// Graduated to `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl`, and the
// two `xfail-miscompile-mono-*-twin.vl` pins are DELETED.
//
// THE SUCCESSOR AGAIN DID NOT COME FROM THE INVENTORY, and this time it did not come from the
// std review either — it came from the GRID built to close the predecessor, which is a fourth
// source and the first that is a by-product of the closing change rather than a reading of it.
// D33's grid crossed (binding column x substituted type x twin) and left 42 of 360 cells
// silent under BOTH compilers, flat across the twin axis — which is what said they were a
// different root rather than a residue. Four rows came out of that residue and out of the
// constructed controls beside it (`silent-class-inventory.md` D34-D37).
//
// THE D36 SPECIMEN THAT STOOD HERE — an anonymous `{ r: i32 }` object literal in a LAMBDA's
// inferred LIST return, beside a union arm of that layout and a standalone struct twin of it —
// IS CLOSED, together with D38, and they were ONE root. It went the way its three predecessors
// did: the rule the fix needed was already written and simply not consulted. Three classifiers
// that must agree ARM FOR ARM (`arrLitElemName`, `arrLitElemKind`, `arrLitElemHintTy`) each
// carried their own un-gated copy of `objVariantName`, a global FIELD-NAME-SET scan of the
// variant table — so an anonymous `{ r: n }` matched `Circle` structurally and the arms
// WIDENED that to the whole union, building a kind-2 BOX list under a reader that unboxes.
// `arrLitBoxElemName` is the complement: it asks the ARENA whether the CHECKER recorded the
// array's element as a union, was written for `collectU`'s registration, and had no caller on
// the object-literal path. Probed at the site: `vn=[Circle] box=[] si=0` on D36,
// `vn=[Circle$m0] box=[] si=-1` on D38, and `vn=[Circle] box=[Circle|Sq] si=-1` on the
// heterogeneous control that must keep boxing. 37 of a 900-cell grid moved, 28 from
// check-clean invalid wasm and 9 from a loud emit refusal, none backward; the moved cells are
// `anon` 37 of 37 on the producer axis and `list` 37 of 37 on the container axis, which is
// what says the two rows are one root rather than two — while the twin axis SPREADS (none 9,
// namediff 9, armtwin 9, exact 5, after 5) and decides only which failure the cell had first. Graduated to
// `tests/cases/unions/anon-objlit-list-elem-beside-arm.vl` and
// `…/anon-objlit-list-elem-arm-no-twin.vl`, and
// `xfail-miscompile-lambda-list-anon-elem-arm-twin.vl` is DELETED, which is that file's own
// written instruction for the day it starts passing.
//
// THE SUCCESSOR IS THAT CHANGE'S OWN RESIDUE, which is a fifth source and the most honest one
// available: the closing grid left 8 of its 900 cells silent under BOTH compilers, at the same
// coordinates, and this is their minimal witness. `function mk(n: i32): Circle[] { const o =
// [{ r: n }]  return o }` beside `type Dot = { r: i32 }` — eleven lines, no import, no
// generic, no lambda. The anonymous element resolves to `Dot`'s row (struct table first, the
// ladder every consumer uses) while the function's declared `Circle[]` RESULT says
// `uVarHeap[Circle]`, because the checker does not push a return annotation into an
// un-annotated local. It is `silent-class-inventory.md` D39.
//
// Its axis is one line: DROP the return annotation and it runs. So do each of `Dot` deleted,
// `Sq`/`Shape` deleted, a same-arity different-NAME twin, and annotating the local — five
// controls, all measured, all RUN. Re-RUN against this tree at the swap rather than inherited:
// `vl check` rc 0 with NO diagnostics at all — not even a hint — `--codegen` rc 1 with `not
// valid wasm` + `type mismatch: expected (ref $type), found (ref $type)`, and NO `emit error`
// marker. Pre-existing: silent on `f2064bec` too, same message; what the D36/D38 change moved
// is its BYTES, not its outcome. Pinned as
// `tests/cases/soundness/xfail-miscompile-annotated-list-return-anon-elem-twin.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THAT D39 SPECIMEN IS CLOSED, together with D40 and D41, and the three were THREE INDEPENDENT
// ROOTS rather than one — which an ABLATION says and a resemblance could not. One compiler per
// candidate fix, each swept against the same 480-cell grid: the alias-hop patch fixes 40 cells,
// the array-element patch 60, the return-annotation pin 16, and the three moved sets are
// PAIRWISE DISJOINT (0 ∩ 0 ∩ 0). Twelve further cells need TWO of them together — an alias of a
// list of a `: Circle`-annotated value, which needs the lookup to reach the right `let` AND that
// `let`'s literal to classify as a ref list — so the union of the singles (116) is smaller than
// the branch's 128, which is the shape a COMPOSITION has and a shared root does not. 132 of 480
// cells moved, 0 backward; silent 90 → 20.
//
// D39 itself went the way its predecessors did, except in one respect worth recording: for the
// first time in this genealogy the complement was NOT already written. The rule an anonymous
// `{ r: n }` needs is which of its two nominal claimants the CONTEXT wants — `structIndexOfObj`
// finds `Dot` by field set, `objVariantName` finds `Circle` by field set, and with no annotation
// at all `Dot` is the RIGHT answer and the program runs. So there was no unasked predicate to
// call; the annotation had to be carried to the local that never saw it, which is what
// `synthEmptyListAnn` and `synthNullableAnn` already do for two other inferences and what
// `synthRetPinAnn` now does for this one.
//
// THE SUCCESSOR IS AGAIN THAT CHANGE'S OWN RESIDUE, and this time the grid names its axis
// outright: all 20 surviving silent cells are `decl=arm`, and 16 of them are `twin=exact`. The
// minimal witness is eleven lines with no list and no result annotation — `const c: Circle =
// { r: n }  return c` beside `type Dot = { r: i32 }`. The local's own cell resolves the ARM
// (its annotation is nominal and unambiguous) while the INFERRED result valtype takes `Dot`'s
// row from the structural ladder, and the two `$type`s in the engine's message are those two
// heap types. It is `silent-class-inventory.md` D52.
//
// Its axis is one line: DELETE `Dot` and it runs. So do a same-arity different-NAME twin,
// `Sq`/`Shape` deleted, and annotating the RESULT — four controls, all measured, all RUN.
// Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0 with one
// redundant-annotation HINT and no error, `--codegen` rc 1 with `not valid wasm` +
// `type mismatch: expected (ref $type), found (ref $type)`, `--codegen --no-validate` rc 0, and
// NO `emit error` marker. Pre-existing: silent on master `c0873a06` too, same message. Pinned as
// `tests/cases/soundness/xfail-miscompile-annotated-arm-local-beside-layout-twin.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THAT D52 SPECIMEN IS CLOSED, and it went the way all but one of its predecessors did: the
// rule the fix needed was already written and simply not consulted. D39 -- the same seam read
// from the other end -- was the exception that needed a CHANNEL, because an anonymous
// `{ r: n }` has two nominal claimants and only the CONTEXT separates them. D52 is not that
// case, and the distinction is worth keeping: the annotation is on the LOCAL, `criRetLocalLet`
// already hands the result-valtype pass that very binding, and `letAnnVariantIdx` -- exported,
// documented "the union-VARIANT table index a `LetDecl`'s annotation names" -- reads one
// unambiguous nominal answer off it. There was nothing to carry. What WAS missing is the
// ROUTE the answer travels: `fRetKind` had no inferred `"variant"` tier and
// `emitOneFuncType`'s inferred `infSlot` ladder had no `variant` arm -- the three items D51's
// row had predicted in writing.
//
// THE HALF-FIX IS WORTH RECORDING BECAUSE IT LOOKED LIKE A WHOLE ONE. With only the functype
// corrected, `mk` validated and the CALLER did not: `print(mk(7).r)` lowered `struct.get 0 0`,
// the layout twin's row, over a `(ref 1)` receiver. The engine's complaint moved from `mk` to
// the start function and changed one word (`expected (ref null $type)`). A grader reading only
// "still invalid_wasm" cannot tell that from no progress; the disassembly can, and did.
// `fnRetVariantIndexSid`'s un-annotated arm is the other half, and it follows that function's
// own stated rule -- gate on the predicate the callee's functype result is emitted from.
//
// 180 of a 9,450-cell grid moved and NONE moved backward: 84 check-clean invalid wasm and 96
// loud emit rejects, all to `runs`. D66 closed with it, moving loud -> runs and retiring the
// asymmetry its own row recorded ("annotate the CALLBACK'S RETURN; annotating the local does
// not"). Corpus: of 2,278 files, 1,851 emit under both compilers and 1,850 are byte-identical
// -- the single difference is this specimen's own predecessor pin. Graduated to
// `tests/cases/unions/annotated-arm-local-return-beside-layout-twin.vl`, five cells including
// the PARAMETER storage class, and
// `xfail-miscompile-annotated-arm-local-beside-layout-twin.vl` is DELETED, which is that
// file's own written instruction for the day it starts passing.
//
// THE SUCCESSOR IS AGAIN THAT CHANGE'S OWN RESIDUE -- the fifth source, and the closing grid
// names its axis outright. All 116 surviving silent cells are `decl=arm` and every one has an
// exact-layout twin; 104 of them carry NO annotation on the local, which is what says they are
// D39's channel problem rather than D52's missing call. The largest single leg is the module
// GLOBAL destination (48 cells), its twin is a callee PARAM (40): an anonymous `{ r: n }`
// whose nominal claimant is decided by the DESTINATION's annotation, at a destination
// `synthRetPinAnn` does not reach. It is `silent-class-inventory.md` D81.
//
// Its axis is one line: DELETE `Dot` and it runs. So does annotating the local `: Circle`,
// which is the D52 rung this change installed. Re-RUN against this tree at the swap rather
// than inherited: `vl check` rc 0 with one redundant-annotation HINT and no error, `--codegen`
// rc 1 with `not valid wasm` + `type mismatch: expected (ref $type), found (ref $type)`,
// `--codegen --no-validate` rc 0, and NO `emit error` marker. Pre-existing: silent on master
// `a97c9ae1` too, same message. ONE WARNING carried from the pin: the `return n` and the
// top-level read are LOAD-BEARING -- a retyped minimisation that drops them is a LOUD
// `emitProgram: ref valtype with no interned shape`, which is a different program and a
// different row. Pinned as
// `tests/cases/soundness/xfail-miscompile-anon-objlit-into-arm-typed-global.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THAT D81 SPECIMEN IS CLOSED, together with D75 and D82, and the ablation splits the three
// filed rows into FOUR roots rather than three. One compiler per candidate, all swept over
// one 3,144-cell grid: the monomorphizer's variant pin moves 276 cells and closes D75 and
// D82 TOGETHER (one rung, two rows), while D81's destination channel is THREE separate legs
// moving 36 / 36 / 108. All six pairwise intersections are EMPTY and the union of the
// singles is set-identical to the composed branch's 456 — so no leg closes another's cells
// and, unlike D39/D40/D41, no cell needs two patches. 456 moved, every one FORWARD, and the
// grid's check-clean-invalid-wasm count goes 264 -> 0.
//
// D81 IS STILL THE EXCEPTION IT CLAIMED TO BE, and D75/D82 are still the rule. D75's
// complement was already written — `exprVariantIndex` is `structIndexOfExpr`'s storage-class
// twin arm for arm and `monoArgTyName` simply never asked it — which makes it the ninth rung
// of this family to close on an un-called call. D81 had no such predicate: an anonymous
// `{ r: n }` has two nominal claimants, neither scan is wrong, and only the DESTINATION's
// annotation separates them, so the annotation had to be carried. Its one new fact is the
// PASS ORDER: the carry has to happen BEFORE monomorphization, because a hand-written
// generic between the literal and its destination is otherwise cloned off the very row the
// un-annotated literal resolved to, and by `collectLocals` time the instance's signature is
// already wrong. 30 grid cells separated the late position from the early one.
//
// THE SUCCESSOR IS NOT THIS CHANGE'S RESIDUE — this change has none, and that is exactly the
// state the note below warns about. It came from RE-RUNNING AN OLDER GRID: D52's own
// 9,450-cell population, which master `8bf0f20f` grades at 212 silent where #1951 reported
// 116. The extra 96 are one family, `cont=mapval`, and they are a REGRESSION with a bisect:
// they RAN on `6ac49ac9` (seed rebuilt from that commit's own sources, 1,437,150 bytes,
// reproducing the size that PR reported) and are check-clean invalid wasm on `2ea654d2`
// (1,437,704 bytes) and every commit since. #1952's own 770-cell grid had no map-valued
// container, so it could not see them. It is `silent-class-inventory.md` D87.
//
// Its axis is one line: DELETE `Dot` and the same program is a LOUD `only i32, i64, f64,
// f32, boolean, struct, union, array, or string parameters are supported`. ANNOTATE the map
// local and it is a DIFFERENT loud floor (`unsupported map value type …`), so it is not the
// annotated-map path. Re-RUN against this tree at the swap rather than inherited: `vl check`
// rc 0 with NO diagnostics at all — not even a hint — `--codegen` rc 1 with `not valid wasm`
// + `type mismatch: expected (ref $type), found (ref $type)`, and NO `emit error` marker.
// Pinned as
// `tests/cases/soundness/xfail-miscompile-arm-valued-map-local-into-map-param.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// AND IT ADDS A SIXTH SOURCE TO THE LIST BELOW, earned rather than guessed: when a closing
// change leaves NO residue, re-grade an EARLIER change's grid against today's master. The
// inventory grades only the rows someone filed, and a grid grades only the axes it varied —
// but an old grid re-run is a population large enough to catch what a new one held constant.
//
// THAT D87 SPECIMEN LASTED ONE ROUND OF REVIEW, and it closed rather than moved: #1954
// landed while the branch was in review and turned the annotated spelling
// (`const c: {[string]: Circle} = Map()`) from a loud floor into a RUNNING program. The
// moment that control flipped, D87 stopped being "the mv region's problem" and became the
// same destination channel this change already carried, one producer over — an empty
// `Map()` commits no value rep at its initializer, exactly the property that licenses an
// object literal to be re-aimed. Two helper widenings (`armPinAnnName` accepts a map whose
// VALUE names an arm; `armPinLitInit` accepts a bare `Map()`/`Set()`) and it closes, moving
// 76 of its 96-cell family and 0 cells of the 3,144-cell grid — inert where it is not the
// answer, which is what says it belongs to this change rather than beside it.
//
// THE SUCCESSOR IS THAT FIX'S OWN RESIDUE, the fifth source again: the 20 cells it does not
// reach are ONE family and every control that separates its neighbours is inert on them.
// Delete the generic hop and they RUN; delete the layout twin and they do NOT (so it is not
// the twin family); annotate the local and they do NOT (so it is not D87's channel). What is
// left is the MONOMORPHIZER meeting an arm-valued map. Re-RUN against this tree at the swap
// rather than inherited: `vl check` rc 0 with NO diagnostics at all, `--codegen` rc 1 with
// `not valid wasm` + `type mismatch: expected (ref $type), found (ref $type)`,
// `--codegen --no-validate` rc 0, and NO `emit error` marker. Pre-existing on `933e2cbf`
// with the same sentence. It is `silent-class-inventory.md` D88, pinned as
// `tests/cases/soundness/xfail-miscompile-arm-valued-map-through-generic.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THAT D88 SPECIMEN CLOSED, AND THE SUCCESSOR IS THE FIRST ONE IN THIS GENEALOGY WITH NO
// DECLARED TYPE IN IT. D88 was the monomorphizer meeting an arm-valued map: `monoArgTyName`
// pinned the instance from `nodeTyMapName`, whose renderer spells a declared union ARM
// STRUCTURALLY, so the clone's annotation named a fresh anonymous arena index and `collectA`
// minted a SECOND mv slot for one map. The complement was already written one container over
// — `shapeNominalOfTy` recurses through `TyArray` for a LIST element and the MAP was the one
// container it never grew — and the fix is that missing twin. It moves 24 cells of this
// change's 2,850-cell grid and takes the 9,450-cell D52 grid to **0 silent cells**, which is
// the first time that population has been empty.
//
// THE SIXTH SOURCE EARNED ITS KEEP AGAIN, and this time in the OTHER direction: re-grading
// D52's grid is what confirmed D88 was that grid's last silent family, and re-grading the
// 3,144-cell D75/D82 grid (0 moved, 0 backward) is what said the fix was inert everywhere it
// was not the answer. Neither number was available from this change's own grid.
//
// A SEVENTH SOURCE, AND IT IS THE ONE THAT FOUND THE SUCCESSOR'S NEIGHBOUR: diff the
// MESSAGES, not only the outcome classes. Closing D100 moved 18 cells from a positionless
// `ref valtype with no interned shape` to an anchored `binding's inline-shape type has an
// unsupported field` — loud to a DIFFERENT loud, invisible to every outcome-class count —
// and that second sentence is `letAnnIsUninternedShape` asking `structIndexByName` where
// D53 taught `paramStructIndex` to ask the bridge. Filed as D111, with the measurement that
// says the obvious widening is NOT the fix (it moves 64 cells to `runs` and 19 to SILENT).
//
// THE SUCCESSOR IS A NESTED MAP WHOSE INNER VALUE IS AN ANONYMOUS SHAPE, and it is chosen
// for what it does NOT contain: no union, no arm, no exact layout twin, no generic, no
// import, no declared type at all — every axis the last five specimens turned on. Its
// message differs in NULLABILITY (`expected (ref null $type), found (ref $type)`) rather
// than in heap type, so it is a different seam as well as a different program. Two controls
// bracket it, both re-RUN against this tree: one nesting level less RUNS, and the same
// nested map with a MONO inner value RUNS. Re-RUN against this tree at the swap rather than
// inherited: `vl check` rc 0 with NO diagnostics at all, `--codegen` rc 1 with `not valid
// wasm` + `type mismatch: expected (ref null $type), found (ref $type)`, `--codegen
// --no-validate` rc 0, and NO `emit error` marker. Pre-existing on `764ad0dd` with the same
// sentence. It is `silent-class-inventory.md` D112, pinned as
// `tests/cases/soundness/xfail-miscompile-nested-map-anon-shape-value.vl` per the REFILLS
// procedure below, in the same commit that swapped this constant.
//
// THAT D112 SPECIMEN CLOSED — AND ITS OWN FILED READING OF THE MESSAGE WAS WRONG, WHICH IS
// THE PART OF THIS ENTRY WORTH KEEPING. The row above says the sentence "differs in
// NULLABILITY, not in heap type" and calls that "the tell that it is a vals-CELL
// nullability seam and not the two-heap-types family every recent specimen came from."
// Disassembled, it is exactly that family: `(ref null $12)` expected, `(ref $11)` found,
// two DIFFERENT map structs behind one placeholder, and the `ref null` is the vals ARRAY
// ELEMENT's own type, not a nullability defect. Probed at the site rather than read off
// the text:
//
//   D112PROBE mslot=1 valKind=6 valName={[string]:{r:i32}} rlSlot=1 elemKind=3
//             isMap=T innerShape=0 ctxMapSlot=-1 pendingMapSlot=-1 nullable=F
//             innerMapTypeIdx=12 monoMapTypeIdx=11
//
// `isMap` and `innerShape` already answered; nothing seeded the context; `nullable=F`.
// THREE specimens running now have carried a nullability-sounding sentence over a
// two-heap-type mechanism. Disassemble. Never grade a specimen by its message.
//
// THE FIX IS THE COMPLEMENT ALREADY WRITTEN, for the eleventh time: `emitMapValDefault`
// — the `??` DEFAULT boundary for a ref-valued map — had an arm for every value kind
// (scalar, union box, struct list, string/f64/i64/f32 list, struct, nullable niche) except
// a NESTED MAP, so `emitMapNew` read the ambient `pendingMapSlot` (-1) and built the MONO
// map struct. `mvValIsMap` / `mvInnerMapShape` is the map STORE's own pair, called one line
// away in `emitMapSetV` and never called here. Seven `Map()` boundaries had each been
// taught this separately — let, global-init, return, struct field, variant field,
// assignment, store — and the `??` default is the one nobody came back for. A RUNG 2 came
// out of the neighbourhood sweep: `mvInnerMapShape` did not peel `| null` while its
// ref-list twin `rlElemMapShape` always had, so BOTH its callers were wrong together on a
// `{[K]: {[K2]: V} | null}` value and one line fixed both.
//
// 452 of a 1,114-cell D112 grid and 430 of the 2,850-cell D88/D100 grid, every one
// `check-clean invalid wasm` → `runs`, 0 backward and 0 same-class message changes. The
// sixth source stayed inert where it should: the 9,450-cell D52 grid and the 3,144-cell
// D75/D82 grid both moved 0 cells and both still grade 0 silent.
//
// AND THE CLASS DID NOT EMPTY — the grid is what says so, and it is the reason this entry
// is a REFILLS and not the `null` branch. 61 cells of the D112 grid and 100 of the D88 grid
// survive as `check-clean invalid wasm`, in TWO families and neither of them D112's:
// **D123**, the nominal ladder (`nodeMapArmNominalName` is a ONE-LEVEL special case, not a
// rung inside the recursive `shapeNominalOfTy`, so an arm-valued map nested in a map or in
// a list is spelled structurally), and **D124**, the mv layer minting a SECOND slot for the
// `{[K]: V | null}` spelling of a layout that already has one, which `mvTwin` does not
// merge. Both are pre-existing and both were found by the grid, not by the inventory —
// which is the standing advice below, honoured rather than quoted.
//
// AN EIGHTH SOURCE, AND IT IS THE ONE THAT KEPT THIS HONEST: a PARTIAL fix inside one
// outcome class is invisible to the grader of that class. The D124 cells contain two
// `?? Map()` sites; this change moved the first to the right struct and left the second
// disagreeing with the store, so the cells stayed `check-clean invalid wasm` while their
// WASM changed under them (`struct.new $10` → `$12` on one site only). No outcome-class
// count can see that. `cmp` the modules across the fix and disassemble the survivors, or a
// half-moved family reads as an untouched one.
//
// THE SUCCESSOR IS D124'S OWN MINIMAL WITNESS, and it is the shortest specimen this
// genealogy has carried: SEVEN LINES, no function, no union, no generic, no import, no
// lambda, no `??`, one annotation. Its three controls were built and RUN, not reasoned:
// drop the `| null` and it runs; make the inner map MONO and it runs; annotate `l2` with
// the outer's own nullable-valued spelling and it runs. Disassembled, `$11` and `$12` are
// byte-identical struct definitions at two indices — so this specimen's sentence mentions
// nullability too, and its mechanism is two heap types AGAIN. Re-RUN against this tree at
// the swap rather than inherited: `vl check` rc 0 with NO diagnostics at all, `--codegen`
// rc 1 with `not valid wasm` + `type mismatch: expected (ref null $type), found (ref
// $type)`, `--codegen --no-validate` rc 0, and NO `emit error` marker. Pre-existing on
// `7b600b57` with the same sentence. It is `silent-class-inventory.md` D124, pinned as
// `tests/cases/soundness/xfail-miscompile-nullable-map-value-spelling-twin.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THAT D124 SPECIMEN IS CLOSED, together with D123, and an ABLATION says they are TWO
// ROOTS rather than one — which the resemblance (both are "one map layout, two mv slots")
// could not. Three candidate edits, one compiler per candidate, both grids swept with one
// host binary: the niche peel in the twin's canonical identity moves 49 of the 1,114 D112
// cells and 0 of the 2,850 D88 cells; the two D123 edits move 56 D88 cells and 0 D112
// cells; the pairwise intersection is 0 and the union is set-identical to the full branch.
// The ablation baseline is PROVEN rather than assumed this time: stripping all three
// candidates out of the branch reproduces `89f88840` byte-for-byte (1,451,224 bytes).
//
// D124 went the way most of this genealogy has: the rule was already written, in the
// header of the very function whose peel the mint already takes. `nulRefMapValInnerOf`
// says a `{[K]: V | null}` value "resolves its struct/map identity — and keys its vals
// ref-list slot — through the single non-null member, so the slot SHARES the vals rep (and
// the heap dedup) with the non-null twin". The mint honoured the first half;
// `repMapValSlotsTwin` keyed on `mvValCanonId`, which reads the value's own arena index,
// and a `TyNullable`'s `repCanonId` is by construction not its inner's. Probed at the mint:
// `slot=0 {[string]:i32} canon=2 rl=0 rlwrap=5` beside `slot=1 {[string]:i32}|null canon=3
// rl=0 rlwrap=5` — the same vals slot, the same wrapper, and `canon` the only column that
// differs.
//
// D123 was TWO EDITS AND ONE ROOT, and the ablation is what separates that from two roots:
// the comparator rung alone moves 8 cells, the value-row read alone moves 0 (and 0 corpus
// files), and the two together move 56. `repMapValSlotsTwin`'s kind-1 arm asked a PROXY —
// D34's arm-identity split — for a question `rlSlotsLayoutTwin` answers directly and that
// the kind-6 arm one branch down already asks; and once the slots merge, the value SEEDS
// still read `mvValVariantIdx` / `mvValStructIdx` off the slot the spelling minted, so they
// join the three consumers that already canonicalize through `mvCanonRepOf`.
//
// AND THE CLASS DID NOT EMPTY, for the third close running, and the grid is again what says
// so: 44 of the D88 cells and 12 of the D112 cells survive, and after these two rows they
// are ONE family — every survivor is `decl=armtwin`.
//
// ── D139 (#PR) — the specimen's own row closed, and the class did not empty ───────────────
//
// D139 was the program above: an arm-valued map bound at MODULE scope beside a standalone
// struct of the arm's exact layout. It RUNS now, and what closed it is the pattern this
// genealogy keeps landing on — a complement already written and never called.
//
// THE FILED DIAGNOSIS WAS HALF RIGHT AND THE PROBE IS WHAT SPLIT IT. The row said the two mv
// slots hold two genuinely different heaps (`uVarHeap[Circle]` and `sHeapIdx[Dot]`) and that
// merging them would be wrong. Both true, both untouched. It also said the residue was a
// binding-RESOLUTION problem and named the cheapest next probe — "why does the module-scope
// binding resolve the render's slot where the local resolves the arm's?". Run, that probe
// answered in one column:
//
//   function scope:  letMapShapeOf ix=18 fn=30 letType=37 ({[string]:Circle})  -> shape 0
//   module   scope:  letMapShapeOf ix=18 fn=-1 letType=-1                      -> shape 1
//
// The local ALREADY CARRIED THE ANNOTATION. D81's `synthDstPinAnns` pins an un-annotated
// `Map()` from the annotation of every destination it is delivered to, and it walked
// `fnStmts` only — so a module-scope binding, which has no `fnStmts` row and never reaches
// `collectLocals` either, reached the mv layer un-annotated. The fix is that pass's module
// run over `globalStmts` with the PROGRAM node as the scope, sharing the destination scan and
// the disagreement gate rather than copying them. The row's own guess — "most likely a THIRD
// member of the `synthRetPinAnn` / `synthEmptyListAnn` family" — is refuted: the third member
// is `synthDstPinAnn`, it already accepted a bare `Map()` initializer and an arm-valued map
// annotation, and what it was missing was a caller.
//
// FOUR GRIDS RE-GRADED AND ALL FOUR STAY AT 0: D52 (9,450), D75/D81/D82 (3,144),
// D111/D117 (1,710), D131 (1,732) — 0 moved, 0 backward, 0 silent on each. The two grids the
// row lived on move 0 as well (D88/D100 2,850; D112 1,114), which is the finding rather than
// a null result: EVERY cell of both builds the map as a function LOCAL, so neither could ever
// have seen this row. The 36-cell binding-storage-class grid that CAN
// (`scripts/silent-sweep/d139/`) moves 3 — one `check-clean invalid wasm` -> `runs` and two
// `loud emit reject` -> `runs`, 0 backward.
//
// THE ABLATION BASE IS PROVEN AGAIN: stripping the change out of the branch reproduces
// `54780e0b` byte-for-byte at 1,452,568 bytes, and the three OTHER candidates that were
// built and measured beside it are NOT in this commit — see D156 for why. One of them moved
// 70 D88 cells forward and FOUR D112 cells backward (`runs` -> check-clean invalid wasm),
// which is the whole reason the ablation was run per-candidate rather than on the sum.
//
// THE SUCCESSOR IS THE SAME PROGRAM WITH THE MAP RETURNED FROM A CALL. Twelve lines, no
// import, no generic, no lambda, no `??`, one nesting level. Its seven controls were built
// and RUN: deleting `Dot` and a non-twin `Dot` are both LOUD, deleting the union runs,
// annotating the local runs, ANNOTATING THE RESULT runs (which is what names the channel),
// binding the map directly runs (that is D139's close), and wrapping the call site in a
// function is STILL SILENT — so unlike D139 this one is storage-class INDEPENDENT and the
// `bind` axis does not discriminate it. Pre-existing on `54780e0b`, same message at the same
// offset. It is `silent-class-inventory.md` D155, pinned as
// `tests/cases/soundness/xfail-miscompile-arm-valued-map-from-a-call-result.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// ── D155 (#PR) — the call site was a destination the scan never had ───────────────────────
//
// D155 was the program above: an arm-valued map built and RETURNED by `mkm`, handed to
// `thru(x: {[string]: Circle})` at a call site in another scope. It RUNS now, and the
// mechanism is the one this genealogy keeps landing on — the channel exists, and it stopped
// one hop short of its own population.
//
// THE ROW'S DIAGNOSIS IS CONFIRMED AND ITS "CHEAPEST NEXT PROBE" IS NOT WHAT ANSWERED. The
// row proposed asking whether `computeRetInference` already knows `mkm` returns a
// `{[string]: Circle}`. It does not need to: the deciding annotation is `thru`'s PARAMETER
// and it is at the CALL SITE, one scope out of the body `dstPinAnnIn` scans. Probed at the
// pin on `1559d80c` the dump is one line — `DPA let=18 name=c ret=-1 n=0`, no destinations at
// all — against `n=1 [0]=<{[string]:Circle}>` for the function-scoped sibling.
//
// THE FIX IS ONE RUNG AND ONE SCAN. `dstPinSrcIsAt` learns that an ordinary call to an
// UN-ANNOTATED callee is transparent to the binding that callee hands back
// (`dstPinCalleeRetLet`, using the same `retLocalLetOfBlock` alias walk every other rung of
// this family uses), and `dstPinCallerDests` runs the same `dstPinScan` over every other
// function body and over the module — but ONLY for a binding that is its own function's tail
// value, which is what keeps this from being a whole-program scan per binding. A DECLARED
// result answers -1 and is not a hop: it is the destination, `dstPinRetDest` already records
// it from inside the callee, and a caller must not overrule it.
//
// SIX GRIDS RE-GRADED, ALL AT 0: D52 (9,450), D75/D81/D82 (3,144), D88/D100 (2,850),
// D111/D117 (1,710), D131 (1,732), D112 (1,114) — 0 moved, 0 backward, 0 to a silent class,
// 0 same-class message changes on each. The 36-cell binding-storage-class grid
// (`scripts/silent-sweep/d139/`) moves 3, every one forward: `armtwin x mapval x none x
// callres` check-clean invalid wasm → runs, and `arm` / `armdiff` at the same coordinate
// loud emit reject → runs.
//
// THE ABLATION BASE IS PROVEN AGAIN: stripping the change out of the branch reproduces
// `1559d80c` byte-for-byte at 1,452,766 bytes, and TWO OTHER CANDIDATES (C1 and C2) WERE
// BUILT AND MEASURED AND ARE NOT IN THIS COMMIT — see D157. Together they make the D157 pin
// fire with the right name (probed) and move ZERO cells, because a SECOND root then keeps
// every one of them silent; separately each moves nothing at all, so they are a COMPOSITION
// whose composed effect is still 0 forward and 4 same-class message moves. A candidate that
// only changes a message is not a fix, and this genealogy has been fooled by that disguise
// before.
//
// THE SUCCESSOR IS THE SAME SEAM REACHED THROUGH A LIST CONDUIT. Ten lines, one import, no
// lambda, no `??`, one nesting level: an arm-shaped literal whose only nominal claim is the
// enclosing function's DECLARED RESULT, delivered through `reverse([c])[0]`. Its eight
// controls were built and RUN and are identical on `1559d80c` and on this tree: deleting the
// conduit runs, annotating the local runs, deleting `Dot` runs, a non-twin `Dot` runs,
// deleting the union runs, binding the list as `const xs: Circle[] = [c]` runs — and a
// HAND-WRITTEN `rv<T>(xs: T[]): T[]` in place of `reverse` fails identically, so the class is
// not std-bound. Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0
// with NO diagnostics at all, `--codegen` rc 1 with `not valid wasm` + `type mismatch:
// expected (ref $type), found (ref $type)`, `--codegen --no-validate` rc 0, and NO `emit
// error` marker. Pre-existing on `1559d80c`, same sentence. It is
// `silent-class-inventory.md` D157, pinned as
// `tests/cases/soundness/xfail-miscompile-arm-literal-through-a-list-conduit.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant.
//
// THE SUCCESSOR IS THAT FAMILY'S MINIMAL WITNESS: NINE LINES, no import, no generic, no
// lambda, no `??`, one nesting level. An arm-valued map beside a standalone struct of the
// arm's exact layout — the render `{r:i32}` resolves to the twin through the struct table
// before anything can ask whether an arm of that layout exists, so the two slots hold two
// genuinely different heaps and the D123 merge correctly declines them. Its six controls
// were built and RUN, not reasoned: delete `type Dot` → LOUD; a non-twin `Dot` → LOUD;
// delete the union → runs; annotate the map → runs; wrap the two statements in a function
// → runs (the SCOPE axis, D19's); the two-level sibling → silent with the `ref null`
// sentence. Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0
// with NO diagnostics at all, `--codegen` rc 1 with `not valid wasm` + `type mismatch:
// expected (ref $type), found (ref $type)` — note NO `ref null` this time, the first
// specimen in four whose sentence does not even look like a nullability defect —
// `--codegen --no-validate` rc 0, and NO `emit error` marker. Pre-existing on `89f88840`,
// same message, and its module is byte-identical across the change. It is
// `silent-class-inventory.md` D139, pinned as
// `tests/cases/soundness/xfail-miscompile-arm-valued-map-beside-struct-twin.vl` per the
// REFILLS procedure below, in the same commit that swapped this constant. (That row is
// CLOSED as of the paragraph below; the file graduated to
// `tests/cases/soundness/arm-valued-map-beside-struct-twin.vl`, `@run` + three `@log 7`.)
//
// SWAPPED AGAIN 2026-08-28 (silent-class-inventory D280 / D156 / D158 / D171). The
// read-site-annotation specimen this constant carried is CLOSED and graduated to
// `tests/cases/soundness/arm-and-its-layout-twin-share-one-heap.vl`, `@run` + four `@log 7`.
// What closed it is not a nineteenth carrier: it is ONE HEAP TYPE. A union ARM and a
// declared STRUCT of its exact layout were two WasmGC heap types in two tables that never
// cross-deduped, while the checker accepts either wherever the other is expected — which is
// the same "they MUST share one heap type" argument `DECISIONS.md` derives the struct
// layer's own `sTwin` from. The predecessor's "eighteen candidate compilers have been graded
// against it without moving it" was true and was measuring the wrong axis: every one of the
// eighteen was a CARRIER (a pin, a hop, a read leg, an element key) and the defect was a
// TABLE. That is the lesson this genealogy entry adds — "stable against every candidate so
// far" is evidence about the candidates, not about the specimen.
//
// THE SUCCESSOR IS CHOSEN AGAINST BOTH MECHANISMS, which is a tightening of the previous
// selection rule (that one chose for stability against the pin family alone, and the thing
// that closed it came from elsewhere). This one has no delivery for the pin family to read
// AND declares no second claimant of the arm's layout for the heap merge to merge:
// `armLayoutContested` is false on it, `variantStructHeapTwinAt` answers -1, and `uVarTwin`
// has no second arm to collapse. Re-RUN against this tree at the swap rather than inherited:
// `vl check` rc 0 (one redundant-annotation HINT, no errors), `--codegen` rc 1 with `not
// valid wasm` + `type mismatch: expected (ref null $type), found (ref $type)`, `--codegen
// --no-validate` rc 0, and NO `emit error` marker. Pre-existing on `28425535` with the SAME
// sentence at the SAME offset across the change. Pinned as
// `tests/cases/soundness/xfail-miscompile-read-default-annotation-through-unannotated-param.vl`
// per the REFILLS procedure above, and filed as silent-class-inventory D282, in the same
// commit that swapped this constant.
//
// SWAPPED AGAIN 2026-08-28 (silent-class-inventory D282). The un-annotated-parameter
// specimen this constant carried is CLOSED and graduated to
// `tests/cases/soundness/arm-and-an-anon-row-of-its-layout-share-one-heap.vl`, `@run` +
// four `@log 7`. It went the way D280 went, one position out: the arm's layout claimant
// was an interned `#anonN` row rather than a declared struct, and `variantStructHeapTwinAt`
// keys on `repSlotOfTy`, whose bridge scans DECLARED rows only. `repRowOfTyStruct` is the
// same double gate keyed on an arena type instead of a second slot, it already covers the
// `#anon` rows through `slotCanonId`'s arena rung, and it was simply not asked.
//
// AND THE PREDECESSOR'S OWN SELECTION RULE IS WHAT FAILED, WHICH IS THE LESSON THIS ENTRY
// ADDS. That one was chosen against BOTH mechanisms of the variant⇄struct family —
// `armLayoutContested` false, `variantStructHeapTwinAt` -1, `uVarTwin` with no second arm
// to collapse — and every one of those three facts stayed true; the merge that closed it
// made `variantStructHeapTwinAt` answer where it had answered -1. Choosing against the
// mechanisms a family HAS is choosing against the candidates again, one abstraction up.
//
// SO THE SUCCESSOR LEAVES THE FAMILY, and this time that is checkable rather than argued:
// it DECLARES NO UNION. `uVariants` is empty, `variantStructHeapTwinAt` and `uVarSTwin` are
// never called (counted at the site: `entries=0`), `emitUnionCoerce` is unreachable, and
// `armLayoutContested` is false for want of an arm. Every mechanism that has closed a
// specimen in this genealogy since D33 is structurally inapplicable rather than untried.
// It is `silent-class-inventory.md` D209 — the most-attacked open row in that document,
// with TWO candidate fixes BUILT, MEASURED and REFUSED (the resolver side and the read
// side), each refuted by a program it reddens and each pinned as its own refutation row
// (D271, D272). Two candidates that were built, priced and declined is evidence about the
// SPECIMEN; "stable so far" is only ever evidence about the candidates.
//
// Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0 with NO
// diagnostics at all, `--codegen` rc 1 with `not valid wasm` + `type mismatch: expected
// i32, found (ref $type)`, `--codegen --no-validate` rc 0, `vl build` writes the `.wasm`
// and exits 1, and NO `emit error` marker. Pre-existing on this change's merge base
// (1,463,065), and its module is BYTE-IDENTICAL across the change. Pinned as
// `tests/cases/soundness/xfail-miscompile-declared-struct-captures-anon-list-element.vl`
// per the REFILLS procedure above, in the same commit that swapped this constant. Its own
// NAMED successor, so the next swap is a two-line edit: `silent-class-inventory.md` D224,
// whose fix is likewise built and refused at a measured 207 census cells.
//
// SWAPPED AGAIN 2026-08-28 (silent-class-inventory D209). The declared-struct-captures-an-
// anonymous-literal specimen this constant carried is CLOSED and graduated to
// `tests/cases/soundness/adopted-box-field-read-is-a-channel.vl`, `@run` + seven `@log 7`.
//
// AND THE SELECTION RULE FAILED AGAIN, ONE ABSTRACTION UP FROM LAST TIME. That one was chosen
// for being OUTSIDE the variant⇄struct heap-merge family — a checkable property, and it HELD:
// `uVariants` stayed empty, `variantStructHeapTwinAt` was never called, and nothing in that
// family closed it. What closed it came from a place that family does not reach: the code-16
// READ, where the emitter's rep (a box the adoption produced) and the checker's type (a bare
// atom it never widened) disagree. **Leaving a family is not leaving the reach of every future
// argument**, and "no mechanism I can name applies" is still a statement about the mechanisms
// someone had already named. Its own recorded successor, D224, was CLOSED by #1985 the same day
// — before this swap could take it — so that hand-off expired too.
//
// THREE FAILED SELECTION RULES IS ENOUGH TO STOP CHOOSING. This successor was picked by a
// CENSUS instead: every one of `silent-class-inventory.md`'s 136 rows had its OWN filed program
// run against this tree (`vl check` rc 0 and a non-zero `vl run` that is not an emit error).
// Exactly ONE row is check-clean invalid wasm — D209, the row this commit closes — and after
// its pin is deleted the corpus carries no `@no-instantiate` directive at all. **So this is not
// a choice between candidates; it is the only live member of the class**, which is the one
// selection rule that cannot be wrong about the population.
//
// It is `silent-class-inventory.md` D291, D209's own residue: the same three lines with one
// token changed, `i32` to `i64`. That token makes the adoption WIDEN — the field's declared
// member is i64 so the store boxes tag 3 / `struct.new $vbI64`, while the checker still types
// the read `i32` — so THREE sources disagree and no two agree. It inherits the property D209
// was chosen for: it declares no union, `uVariants` is empty, and the whole variant⇄struct
// family is structurally inapplicable.
//
// THE CAVEAT IS STATED RATHER THAN GLOSSED. This one is NOT out of reach of the mechanism that
// just closed its sibling: D209's channel predicate SEES it and declines, counted at the site
// as `reach=1 ans=0`, on its third condition ("the box can actually hold the checker's atom").
// Drop that condition and this row closes and 36 `d272` cells redden with it — the `R alone`
// column of D209's own ablation. It survives on a MEASURED refusal, the same class of evidence
// D224 had when its 199-cell price turned out to be a bundle of 134 + 65.
//
// Re-RUN against this tree at the swap rather than inherited: `vl check` rc 0 with NO
// diagnostics at all, `--codegen` rc 1 with `not valid wasm` + `type mismatch: expected i32,
// found (ref $type)`, `--codegen --no-validate` rc 0, `vl build` writes the `.wasm` and exits 1,
// and NO `emit error` marker. Pre-existing on this change's merge base (1,463,129) and on its
// shipped seed (1,463,730), and its module is BYTE-IDENTICAL across the change (274 bytes,
// `cmp`-equal). Pinned as
// `tests/cases/soundness/xfail-miscompile-adopted-read-three-source-atom.vl` per the REFILLS
// procedure above, in the same commit that swapped this constant.
//
// THERE IS NO NAMED SUCCESSOR THIS TIME, and that is the honest state rather than an omission:
// the census above found no second live member. WHEN THIS CLOSES, re-run that census before
// assuming the class refilled — and if it has not, set this constant to `null` and let the
// announced-inactive path below do its job rather than reaching for a program that is not
// really in the class.
const INVALID_MODULE_SRC: string | null = `type Circle = { r: i64 | null }\n` +
  `const lv1 = [{ r: 7 }]\n` +
  `print((lv1[0]).r)\n`;

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
