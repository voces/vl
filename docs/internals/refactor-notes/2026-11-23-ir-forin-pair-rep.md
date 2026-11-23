# IR: a map walk's value at any rep, 2026-11-23

Lane IR-N4. Base: master ff34a69e4. Class `for in pair rep`.

## Change

`for k, v in m` binds `v` to the pair slot that legacy's walk writes each value into
(`forInPairInit` and the per-iteration write), whatever the value's rep. The lowering already
binds the second name to that slot (`forInPairSlotOf`, checked against `varSlot`) and writes
nothing there itself. The builder admitted the binding only at an `i32` or a `string`, and the
verifier had the same rule.

- `forInStmt`: a map walk's second name takes its value type's rep
  (`repNodeOfTy(forInBindTy(...))`); a sequence's index must still be an `i32`.
- `ir_verify`: a non-map walk's second name is an `i32`; a map walk's value may be any rep, which
  rule 3 ties to its type.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `forInBindTy` (the pair's type, read by the builder) | legacy's pair-slot declaration and `forInPairInit` |

## Legacy tails the IR calls

- None new.

## Witnesses

`tests/ir-shadow-rows/forin-pair-map-value-reps.vl` walks maps whose values are a float, a
boolean, a record, a list, a closure, a union box, an `i32 | null` and a `string | null`. Master's
seed leaves eight of its functions and the start on `for in pair rep`; this branch matches all ten
and the start, with the same output and bytes.

Verifier self-tests, each paired with its flip: a map walk's record value at its type's rep holds
(`walk-pair-map-value-record`, 0) and at a rep its type does not name is rule 3
(`walk-pair-map-value-off-type`); a string walk's `i32` index holds (`walk-pair-string-index`, 0)
and a `boolean` one is rule 2 (`walk-pair-string-index-of-bool`).

## Readings (master ff34a69e4's fixpoint seed against this branch's)

| class | master | branch |
| --- | ---: | ---: |
| start: for in pair rep | 14 | 0 |
| for in pair rep (functions) | 5 | 0 |
| tests/cases starts matched | 6809 | 6817 |
| tests/cases functions matched | 78990 | 78995 |
| distilled corpus functions matched | 45451 | 45460 |
| start: for in element map / nulclosure / nulmap | 3 / 1 / 0 | 4 / 3 / 1 |
| start: for in map element | 7 | 8 |

## Proof

Fixpoint seeds on both sides, `VL_STD` the tree's:

- `scripts/gate.sh --fast` passed; the shadow suite runs the four self-tests.
- Self-compile: 20355 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's. tests/cases armed shadow: 0 fail or mismatch rows on both.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0; self-compile identical.
  `--claimless`: identical 14044, differ 0. `--cases`: identical 7720, fail under both 68, differ 0;
  witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7433, fail under both 67, differ 0; nothing moved.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB
  and fails at 900, as master's seed does.
- Fuel: L2 120882309581 against master's 120882309187.
- Late demands 9 of 9, late tag rows 307 of 307.
