# `match` — exhaustive value/variant dispatch

Status: **design agreed; phase 1 in progress.** Motivated by the compiler code review's C2
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
  a compile error. Open scalars (`i32`, `string`) require a `_` wildcard.
- **Redundancy check.** A pattern already covered by an earlier arm is a compile error (dead arm).
- **Scrutinee evaluated once.**

## Patterns

Phase 1 (now):
- **Literal** — a litunion member (`"struct"`), and later `i32` / `string` / `boolean` literals.
- **Or-pattern** — `"f64arr" | "i64arr" | "f32arr" => …`. First-class kind-grouping (the compiler
  groups "the scalar list kinds" / "the nullable kinds" constantly).
- **Wildcard** — `_` (the default arm; also satisfies exhaustiveness for open types).

Deferred (follow-ups, captured here so we don't reinvent them):
- **Variant patterns + binding** — `match n { FuncDecl f => f.fnName, … }`, narrowing the scrutinee
  to the variant in the arm. *Unifies with the existing `is` narrowing* and replaces the C3
  dispatchers. (Phase 2 — the big C3 win.)
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
2. **Variant patterns + narrowing** — replaces the C3 `is`-chain dispatchers (the big win).
3. **Expression-position polish** — ensure arms-yield-value works everywhere `if`-expressions do.
4. **Guards** (`pat if cond =>`).
5. (Maybe) ranges / `i32` density → `br_table` codegen.

## Pipeline touch-points (per the language-features playbook)

Adding the `MatchExpr` node requires handling at every per-variant dispatch site (VL has no common-field
read / no exhaustiveness *yet* — bootstrap irony): `nodePos` (fmt_util), `format.vl`'s statement/expr
dispatch, emit's top-level walks (start-stmt collect, drwWalk, monoWalk), `checkNode`, and the emitter.
Miss one → silent drop or emit error.
