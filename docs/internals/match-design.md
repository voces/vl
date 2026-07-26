# `match` — exhaustive value/variant dispatch

Status: **phases 1 and 2a shipped; phase 2b (payload binding) open.** Motivated by the compiler code review's C2
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
- **Scrutinee evaluated once.**

## Patterns

Phase 1 (now):
- **Literal** — a litunion member (`"struct"`), and later `i32` / `string` / `boolean` literals.
- **Or-pattern** — `"f64arr" | "i64arr" | "f32arr" => …`. First-class kind-grouping (the compiler
  groups "the scalar list kinds" / "the nullable kinds" constantly).
- **Wildcard** — `_` (the default arm; also satisfies exhaustiveness for open types).

Phase 2a (now):
- **Variant patterns** — `match n { FuncDecl => n.fnName, … }`, narrowing the scrutinee to the
  variant in the arm. *Unifies with the existing `is` narrowing* (literally: the pattern is an
  `IsExpr`) and is the discrimination half of the C3 win. The BINDING half (`FuncDecl f => f.fnName`)
  is phase 2b.

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
   - **2b — payload binding** (`Move{x, y} => x + y`). Open.
3. **Expression-position polish** — ensure arms-yield-value works everywhere `if`-expressions do.
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
