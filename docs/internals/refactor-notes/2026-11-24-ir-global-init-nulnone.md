# IR: a `null`-typed module global's initializer, 2026-11-24

Lane IR-N4. Base: master 67327cc9. Class `start: global initializer nulnone`.

## Change

- Legacy's `emitStartGlobalInitValue` writes the `"nulnone"` arm of `startInitArmOf` as
  `emitNulNoneBoxPayload(init)`, then `emitUserGlobalSet`. That writes:
  - a value `if` for effect, then `ref.null none`;
  - otherwise `emitNulNoneLeafPayload`: a call's own value; `a ?? b` as `a` for effect, then
    `b`'s payload; an assignment yielding a `null` literal (`asgYieldsNullLit`), then
    `ref.null none`; anything else for effect (`emitNulNoneLeafForEffect`), then `ref.null none`.
- `globalInit`'s `nulnone` arm builds the same ladder (`nulNonePayload`), then the store
  (`gsSym`/`gsSrc`, with `irGlobalWriteMiss`):
  - a call: `irBExpr`, at the cell's rep or a named miss (`global initializer nulnone call rep`);
  - `a ?? b`: the existing `nulNoneEffect(a)`, then `b`'s payload;
  - an assignment: the IR's own `assign`, then the `NULL_OWN_NONE` operand;
  - anything else: `nulNoneEffect`, the twin of `emitNulNoneLeafForEffect` for a non-`if` node,
    then the `NULL_OWN_NONE` operand (`ref.null none`, `emitNullOwn`).
- A value `if` keeps a named miss, `global initializer nulnone if`. The IR has no twin of
  `emitIfForEffect`, so the 2 such starts are a follow-up.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `startInitArmOf` `"nulnone"` (existing) | `emitStartGlobalInitValue` |
| `plainCoalesceAt` (existing, new use) | `emitNulNoneLeafPayload`'s `??` arm |
| `asgYieldsNullLit` (existing, new use) | `emitNulNoneLeafPayload`'s assignment arm |
| `nulNoneWritesNothing` (existing, via `nulNoneEffect`) | `emitNulNoneLeafForEffect` |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

Witnesses, all committed:
- `tests/cases/types/null-typed-global-initializer-positions.vl`, the Q58 sweep.
  - Three `null`-typed globals: `fromLit = null`, `fromCall = nothing()` (a counting call) and
    `fromAsg = (gs = null)` (`gs` starts at `"z"`, and the final `a` shows the assignment ran).
  - Each is read as a call argument, nested, at a `return`, into an annotated binding, as a `??`
    operand, in a record field and in a null test.
  - The counter reads `0` before the initializers and `1` after: one run.
  - A function called before the initializers run reads `fromCall` as `true` (null) under both
    seeds; legacy has no guard trap there, since the unset cell reads null.
  - The `if` arm position is D17124 (below), so it is named, not run.
  - Concat and an interpolation hole are check refusals for `null`.
- `tests/ir-shadow-rows/null-typed-global-initializer.vl`: the same globals and reads in one row.
- No capability probe carries the class.
- A call returning `null` into a `T | null`-annotated global takes the `plain` arm (a `nulstruct`
  cell), which master's seed already matches. The `nulnone` arm is always the null-unit rep, and a
  call result off it keeps a named miss.

**D17124**, filed here (clause 1, on master too). A `null`-unit binding read as an `if` arm that
joins into an annotated `T | null` binding is invalid wasm. The IR leaves that function uncovered
(`if arm coercion`), so legacy's bytes ship. The ablation is in the row.

Fixpoint seeds on both sides, master 67327cc9 against this branch. Each census arm was built in a
tree at its own commit: the base arm in a `git archive` of 67327cc9, the branch arm in the
worktree. `VL_STD` is the tree's.

| class (tests/cases census) | master | branch |
| --- | ---: | ---: |
| start: global initializer nulnone | 17 | 2 (`... nulnone if`) |
| tests/cases armed starts matched | 7201 | 7212 |

Of the 17 starts, 10 match fully: the 7 `null` literals, the 2 calls (`recorded-result-bound-tail-write`,
`tail-write-null-or-map-yields-value`) and the assignment (`null-binding-initialiser-runs`). The
other 5 move on, each a row new on the branch:
- `null test of null`: 2 (`null-bound-annotated-nullable-result-neighbours`,
  `null-unit-result-and-read`);
- `print nulNone`: 2 (`null-only-optional-read-and-call`, `null-unit-type-positions`);
- `operand type`: 1 (`optional-member-null-only-receiver`).

The 2 value `if`s (`if-join-null-first-arm`, `exit-arm-null-join-binding`) stay on the class as
`global initializer nulnone if`, the follow-up.

Under mode 6, every witness reads 0 order, mismatch or fail rows. All 19 run alike under both seeds
(rc and output), and claimless over them is identical (19).

Checks:
- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20548 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes.
- `ir-identity --names`: identical 9433, fail under both 3267, differ 0, built under one only 0;
  self-compile identical. `--claimless`: identical 14462, differ 0.
- `--cases`: identical 7840, fail under both 68, differ 0, expected divergence 2 (master's
  declared, the same on both); witnesses same 68, differ 0.
- tests/cases legacy A/B: identical 7555, fail under both 67, differ 0; the moved list is empty.
- Armed shadow: 24 fail or mismatch rows on both, a byte-identical file (master's declared
  divergences). `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900.
- `tests/vl_ir_door_guard_test.ts` 13, `tests/vl_emitter_state_audit_test.ts` 7 and
  `tests/vl_ir_claim_fallback_test.ts` 7 passed.
- Fuel: L2 126040832146 against master's 126040827824 (per PR +0.02% on base 67327cc9).
- Late demands 10/10; late tag rows 310/310. Seed size +0.7% on its baseline.
