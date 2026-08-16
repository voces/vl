# `match` — exhaustive value/variant dispatch

Status: **phases 1, 2a and 2b shipped.** Motivated by the compiler code review's C2
(uncentralized kind-codes) and C3 (two ~1,000-line `is`-chain dispatchers, 95 arms, silent
fallthrough). `match` is the construct that makes the litunion/union cleanup *safer than the
status quo*, not just renamed.

## Why

A closed set of named alternatives dispatched by equality/variant is exactly what `match` is for.
VL's unions ARE the compiler (`Node`, `Ty`), and it now has literal unions (closed string sets).
The killer feature is **exhaustiveness**: a missing member/variant becomes a compile error, so
adding a kind or AST node lights up every incomplete `match`. That is the whole point — without
it, `match` is just an if-chain with nicer syntax.

## Survey (the throughline)

Every *good* design has **exhaustiveness + no implicit fallthrough**: Rust, Swift, Kotlin `when`,
modern Java, F#/OCaml/Haskell. The bad ones (C, TypeScript `switch`) have fallthrough-by-default
and no exhaustiveness — precisely the C3 bugs. The modern surface is **arrow arms `pat => expr`,
expr may be a block** (Rust/Kotlin/Java/F#); the colon-`case:`-with-`break` style is legacy.

## Decisions

- **Expression, value-returning.** `match` yields a value (VL is expression-oriented). A
  `void`-yielding `match` is used in statement position, exactly like `if`. All arms must yield a
  common type in value position.
- **Arrow arms `pat => expr`**, where `expr` may be a block `{ … }` (whose trailing expression is
  its value). Simple mapping (`"a" => 1`) and block bodies (`"a" => { …; v }`) are the same rule.
- **No fallthrough.** Exactly one arm runs (the first whose pattern matches). No `break`.
- **Exhaustive over closed sets** (literal unions, registered unions): a missing member/variant is
  a compile error. Open scalars (`i32`, `string`) require a `_` wildcard. (As built: an open scalar
  is not a scrutinee at all — `match scrutinee must be a union, got i32`. A bare `i32` has no closed
  member set, so a `_`-only match over one would be an `if` with extra syntax.)
- **Redundancy check.** A pattern already covered by an earlier arm is a compile error (dead arm).
- **Scrutinee evaluated once.** ⚠️ **NOT WHAT WAS BUILT — measured 2026-07-28.** Phase 2a mints
  each arm's pattern as an `IsExpr` over the SHARED scrutinee NODE, and the desugar uses those
  pattern nodes as the chain's conditions, so the scrutinee EXPRESSION is re-emitted once per
  tested arm. A counting probe over a 3-arm match reads **2** evaluations (n−1, the exhaustive-
  last-arm rule), identically on this branch and on master — so it is phase 2a's, not phase 2b's.
  It is unobserved by the corpus because a scrutinee is almost always a plain place. Phase 2b
  inherits it and adds one read per bound field, bounded by the same reason: a binding needs the
  arm to NARROW the scrutinee, and only a place narrows, so a side-effecting scrutinee cannot
  carry a payload clause at all (it reports `field 'x' is not on every member of … — narrow with
  \`is\` first`). The honest fix is to bind the scrutinee to a synthesized temp once, ahead of the
  chain — a desugar change, not a surface one.

## Patterns

Phase 1 (now):
- **Literal** — a litunion member (`"struct"`), and later `i32` / `string` / `boolean` literals.
- **Or-pattern** — `"f64arr" | "i64arr" | "f32arr" => …`. First-class kind-grouping (the compiler
  groups "the scalar list kinds" / "the nullable kinds" constantly).
- **Wildcard** — `_` (the default arm; also satisfies exhaustiveness for open types).

Phase 2a (now):
- **Variant patterns** — `match n { FuncDecl => n.fnName, … }`, narrowing the scrutinee to the
  variant in the arm. *Unifies with the existing `is` narrowing* (literally: the pattern is an
  `IsExpr`) and is the discrimination half of the C3 win. The BINDING half is phase 2b.

Phase 2b (now):
- **Payload binding** — `Move{x, y} => x + y`: a PUNNED field list after a variant pattern, binding
  one arm-local `const` per named field. Field punning only (`{x, y}`, not `{x: a}` and not nested
  patterns) — see "Phase 2b as built" for why the two richer forms are deferred rather than absent.

Deferred (follow-ups, captured here so we don't reinvent them):
- **Guards** — `pat if cond => …` (`when`-style). Keep `if`-conditions OUT of the pattern grammar
  otherwise; arbitrary-condition `when` (Kotlin) would make exhaustiveness meaningless.
- **Ranges** — `0..9 => …` for `i32`.
- **Nested destructuring**, **`@`-bindings**, **tuple/multi-scrutinee** — ML-style richness, only if
  a concrete need appears.

## Semantics + codegen

- First-match, one arm, no fallthrough.
- Exhaustiveness lets the LAST arm lower to the trailing `else` with **no comparison** — so an
  exhaustive `match` is *cheaper* than a hand-written if-chain (which redundantly re-tests). This is
  a real, novel-for-VL upside: correctness AND smaller code.
- Lowering (phase 1): evaluate the scrutinee once, then a nested `if/else` chain of equality tests
  (atom compares for litunions), the final arm as the bare `else`.
- Phase 2 (variants): reuse the union box `{tag,value}` dispatch + the existing `is`-narrowing.

## What we deliberately avoid

- C/TS fallthrough and mandatory `break` (footguns).
- Non-exhaustive-by-default for closed types (defeats the purpose).
- Kotlin-style arbitrary-condition `when` as the *core* (blurs value-dispatch with `if`; guards are
  an additive arm clause, not the foundation).
- Over-rich v1 patterns (destructuring/ranges/`@`) before there's a need.

## Phasing

1. **Litunion `match`** — literal + or-pattern + `_`, exhaustiveness + redundancy, value-returning,
   lowered to the if-chain with the exhaustive-last-arm optimization. Unblocks the C2 kind cleanup.
   **SHIPPED.**
2. **Variant patterns + narrowing** — replaces the C3 `is`-chain dispatchers (the big win).
   - **2a — scrutinee + discrimination. SHIPPED.** See "Phase 2a as built" below.
   - **2b — payload binding** (`Move{x, y} => x + y`). **SHIPPED.** See "Phase 2b as built".
3. **Expression-position polish** — ensure arms-yield-value works everywhere `if`-expressions do.
   **A BINDING arm in value position: SHIPPED.** See "A binding arm in value position" below.
4. **Guards** (`pat if cond =>`).
5. (Maybe) ranges / `i32` density → `br_table` codegen.

## Phase 2a as built

**Scrutinee.** Any union: struct (`C | D`), scalar (`i32 | string`), mixed, and both `| null`
spellings — a DECLARED `type U = A | null` interns as a `TyUnion` with a `null` member, an INLINE
`A | B | null` interns as a `TyNullable`. Admission walks `flattenVariantsInto`, which flattens
either into the same variant list, so the two spellings behave identically. Refused, each with its
own reason: a non-union (no closed member set), and a union with LITERAL members (an arm's `is 0`
has no rep — see ROADMAP B21).

**Arm pattern.** ONE type ATOM per pattern (`parseTypeAtom`, not `parseTypeName`) so `|` stays the
OR-pattern separator: `A | B => …` is two patterns, not one union-typed pattern. That is forced,
not stylistic — a single `is` against a union check type does not lower.

**The pattern IS an `IsExpr`.** `parseMatchPattern` mints `mkIsExpr(scrut, ty, pos)` + `setAnnTs`,
the exact node `scrut is T` produces. Consequences, all free: the module merge renames the check
type through the same arm (`modRwIsType`); lint's flat type-name scan sees it; the checker banks
`isVarTyIx` so the emitter's `isVarTyIxOf`/`narrowTys` ABI is filled from its usual place; and
`desugarMatchAt` uses the pattern node ITSELF as the arm's condition. It is minted in the PARSER,
not at desugar time, because `nodeTyIx`/`isVarTyIx` are sized to the arena at `checkProgram` entry —
a node minted later reads back -1 forever.

**Narrowing, including the last arm.** Then-arms narrow through `collectThenNarrows`' `is` fact;
the arm that becomes the bare `else` narrows through `collectElseNarrows`' union COMPLEMENT
(`subtractTy`), progressively subtracted in CHAIN order. The checker mirrors the chain rather than
guessing at it: `matchElseArmOf` is ONE function read by both `checkMatchTypeArms` and
`desugarMatchAt`, so the arm a body is checked under cannot drift from the arm the chain builds.

**Exhaustiveness.** Every member covered or a `_` present; a miss is a hard error naming the
missing member types. `_` is allowed but never required. Coverage is by ARENA TYPE
(`sameVariantTy`) — the judgement `nameToTy` already used to dedup the union's own members — so it
is STRUCTURAL: `type C = {c: i32}` and `type C2 = {c: i32}` are one member and one arm, because no
runtime test could tell them apart either.

**Why not a tag `switch`.** The union box's tag test is what `is` already compiles to, and the
exhaustive-last-arm rule means an n-member match emits n-1 tests where a hand-written chain emits
n — this section's own "cheaper than an if-chain" claim, now true for value unions too. A
`br_table` over the tag is a constant-factor win on top, and it is item 5 above, gated on `i32`
density, not on phase 2. Phase 2b rides the chain directly: an arm is already
`if scrut is Move { <block> }`, so binding `Move{x, y}` prepends `const x = scrut.x` statements to
that block — no change to the chain, the narrowing, or the emitter.

## Phase 2b as built

**Syntax.** A variant pattern may carry a PUNNED field list: `Move{x, y} => …`. The clause is
`'{' IDENT (',' IDENT)* ','? '}'` immediately after the pattern's type atom, and it binds one
arm-local `const` per field, named after the field. `Move{}` is legal and binds nothing.

**Lowering — the if-chain twin, verbatim.** The recorded plan ("Why not a tag `switch`", above) is
what shipped: `desugarMatchAt` PREPENDS the arm's `const x = scrut.x` statements to the block the
arm already became, so

    match cmd { Move{x, y} => f(x, y), Attack{target} => g(target) }

lowers to the same node shape as its hand-written twin

    if cmd is Move { const x = cmd.x; const y = cmd.y; f(x, y) }
    else { const target = cmd.target; g(target) }

— the chain, the narrowing, the exhaustive-last-arm `else` and the emitter are all untouched. The
*byte* claim is checked as a corpus cell, not asserted: the two spellings must compile to the same
module. Nothing here is a new emitter path, so a binding arm can only fail where its twin fails.

**Where the bindings live: a column on `MatchExpr`, not the body.** `matchBinds` is a new i32
column PARALLEL TO `matchPats` (so `matchBinds[armStart[k] + j]` is pattern *j*'s clause): each
entry is either -1 or a `Block` node holding that pattern's `LetDecl`s. Three properties fall out,
and each is the reason a simpler placement was rejected:
- The `LetDecl`/`Member` nodes are minted in the PARSER, beside the pattern's `IsExpr` — the same
  rule phase 2a is built on. `nodeTyIx` is sized to the arena at `checkProgram` entry, so a node
  minted at DESUGAR time reads back -1 forever.
- The formatter still sees an unmodified arm body. Had the parser prepended the `const`s to the
  body directly, `vl fmt` would print the synthesized statements — the desugar's output, not the
  user's source.
- `matchBinds` holds a `Block` rather than three parallel start/count columns: one new field on
  the flat `Node` record instead of three.

**Bindings are pattern data, so nothing that walks VALUES walks them.** `nodeChildren` (lint) and
`modRwExpr` (the module merge) both exclude the clause for the reason they already exclude the
pattern: a bind's initializer is a `Member` over the SHARED scrutinee node, so walking it would
count/rename the scrutinee once more per bound field. The merge needs ONE thing instead — the arm
body is rewritten while the bound names are on `modShadow`, or a module-level `const x` would
capture an arm that binds `x` (the exact shadowing the merge already does for a `const` written
inside the block).

**Two rejects that exist because the desugar SPLICES.** Post-splice the bindings share the body
block's scope, which the checker never type-checks them in (it checks them in the arm's narrowing
scope, one level out). Two collisions would therefore be accepted by the checker and only decided
by the emitter's local allocator:
- `Move{x, x}` — a duplicate binding.
- `Move{x} => { const x = "s" … }` — a body declaration shadowing a binding. Pre-desugar these are
  two scopes and legal; post-splice they are one scope and two locals of possibly different types.

Both are hard errors at the pattern. Rejecting is not a taste call: the alternative shape (wrap the
body in an outer block instead of splicing) needs a Block-as-statement the emitter does not have,
and VL has no bare-block surface to have built one from.

**Or-patterns take no clause.** `A{x} | B{x} => …` is rejected. Forced, not stylistic: the checker
gives a multi-pattern arm NO then-narrowing (`collectThenNarrows` reports none for the `a || b`
condition the desugar builds), so the scrutinee is still the whole union inside the arm and
`scrut.x` does not type. Rust's rule (identical bindings in every alternative) needs narrowing to a
JOIN of the alternatives, which is item 4 of ROADMAP B21 — a pre-existing emitter gap.

**Deferred, measured, not absent.**
- **Renaming** `Move{x: a}` — the clause's binding name is read back off the `LetDecl` (`letName`)
  by the formatter, so renaming is one parser branch plus a formatter that prints `field: name`
  when they differ. Deferred because punning covers the command-dispatch shape the roadmap wants.
- **Nested destructuring** `Move{p: {x, y}}` — needs the binding's initializer to be a `Member`
  CHAIN and the checker to narrow through it; a real feature, still "only if a concrete need
  appears" (see Deferred, above).

Neither gets EASIER from the value-position work below: renaming is still one parser branch plus a
formatter print, and nested destructuring is still a `Member`-chain initializer plus narrowing
through it. What they get is that whatever they bind lands in the arm's PRELUDE, so both work in
value position on the day they ship rather than needing a second slice for it — nested
destructuring especially, since it is the form that puts the most `const`s in one arm.

## A binding arm in value position

`const r = match u { A{a} => a, B{b} => b }` reported `emitProgram: if-expression arm is not a
single value`. The grid that localises it — binding/non-binding × statement/tail/value position,
for `match` and for the hand-written `if` twin — reads: 8 of 10 cells lowered on master, and the
two that did not were binding × VALUE position, `match` and `if` alike. So it was the BINDING that
broke value position, not `match` in value position, and not phase 2b: the desugar's output is the
`if` twin, and the twin failed identically.

**An arm's value is its LAST statement.** `blockTailIsValue` already applies that rule in tail
position and `emitStmts` walks a statement-position arm of any length; only the if-EXPRESSION arm
emitters demanded a one-statement Block. `ifArmValueExpr` now yields the last statement, and
everything before it is the arm's PRELUDE — which is exactly what a payload clause produces
(`if u is A { const a = u.a; a }`). `emitIfArmOpen`/`emitIfArmClose` lower the prelude inside the
arm's own lexical frame; each of the five arm emitters (numeric join, ref join, union box, concrete
variant, return sink) and the two binding-init sinks (nullable local, union-box pair) still lower
the VALUE in its own rep. Stack-wise the prelude is neutral: it runs inside the arm's `if`/`else`
frame and leaves only the value the blocktype promises.

**The constraint is the local-slot PRE-ORDER, and it is why two positions are refused.** Wasm
locals are function-scoped, and `emitLetDeclStmt` claims them off a linear cursor whose order the
collect pass must have replayed exactly — a slot claimed out of order is another binding's cell,
which is a silent wrong answer, not a crash. So the collect pass walks the two statement positions
whose order the emitter reproduces (`collectIfExprLocals`): a binding INITIALIZER and a `return`
operand. It does NOT walk an if-expression nested deeper inside an expression (an argument, an
arm's own tail value), nor a TOP-LEVEL binding, whose `const` is a module global that the start
function's local collection never descends into. `armPreludeBlocks` records the arms collect walked
and `emitIfArmOpen` requires membership, so those two shapes are diagnostics naming the supported
spelling. Without that test both were compiler TRAPS (`out of bounds array access`) the moment the
arm emitters accepted a multi-statement arm — the mark is what converts a silent-or-crashing
misalignment into a loud one. Widening either position means teaching collect to walk expressions
in the emitter's evaluation order; the pre-order is the whole cost.

`armPreludeBlocks` holds arena NODE indices, so it resets in `emitProgram`'s sidecar block with the
other index columns. A stale index that happens to name a node in the next program grants
permission collect never gave — reachable only when one instance lowers several programs, which is
why the corpus driver (not the CLI, not the fixpoint ladder) is where it showed.

## Pipeline touch-points (per the language-features playbook)

Adding the `MatchExpr` node requires handling at every per-variant dispatch site (VL has no common-field
read / no exhaustiveness *yet* — bootstrap irony): `nodePos` (fmt_util), `format.vl`'s statement/expr
dispatch, emit's top-level walks (start-stmt collect, drwWalk, monoWalk), `checkNode`, and the emitter.
Miss one → silent drop or emit error.

Phase 2a added a second thing to keep in sync: a `MatchExpr`'s PATTERNS became real nodes with
meaning, not inert literals. The three sites that had a "patterns hold nothing renamable /
referenceable" assumption written into them:
- `driver.vl` `modRwExpr`'s `MatchExpr` arm — must rename each pattern's check TYPE, and only that
  (`modRwIsType`): a full `modRwExpr` on the pattern would re-walk the SHARED scrutinee node once per
  arm and rename it n+1 times (`x` → `x$m0` → `x$m0$m0`).
- `format.vl` `matchExprFmt` — a pattern must NOT render through `expr`, which prints the `IsExpr`
  guard surface `scrut is C`. It renders as its own verbatim source span.
- `lint.vl` — needed nothing: `collectTypeNameRefs` is a FLAT arena scan, so it finds the pattern's
  type name on its own, while `nodeChildren` still excludes patterns so the scrutinee is not counted
  as a use twice.

Phase 2b added a THIRD: a pattern's payload clause is a nodes-bearing column that is neither a
pattern nor a body, so every walk that enumerates one or the other has to be told about it
explicitly. `format.vl` renders it (the pattern's own `[pos, end)` span stops at the type atom — the
`IsExpr` is minted before the clause is parsed — so a verbatim slice DROPS `{x, y}`, which is the
contextual-syntax trap #1278 recorded); `driver.vl` shadows the bound names over the arm body;
`typecheck.vl` checks the clause's `LetDecl`s in the arm's narrowing scope and splices them at
desugar. `lint.vl` again needed nothing, because by lint time the splice has already put the
bindings inside an ordinary block.
