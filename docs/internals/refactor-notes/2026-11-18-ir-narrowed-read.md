# IR: a narrowed local read (coverage step), 2026-11-18

Lane STORE, assigned the `narrowed read` door beside IR2's B4, on IR2's step pattern. On B3
(`ir-b3-list-length`), the self-compile blocker census put 653 functions behind this class alone:
`identRead` refused any local read whose rep differs from its variable's. A probe naming the two reps
split them: a box read at a record (552 alone) and a nullable read at its inner rep (91 alone).

## What landed

- **Shared tails legacy consumes.**
  - `narrowedVariantTail(vi)` writes the box payload's cast to variant `vi`. `emitVariantCoerce`'s
    box arm and `narrowedFieldTail` now call it.
  - `localNulStrRecovers(ix, fnIx)` names the `string | null` local read that recovers non-null.
    `emitIdentLocalRead` now asks it.
- **Predicates the IR reads.**
  - `identReadsLocalPlain` says `emitIdentNode` takes the plain local read: no null read, unbox or
    capture arm fires.
  - `narrowedBoxVariantPlain` adds the box arm's own conditions: a union read with no bare variant
    and no cross-tag fit owing a refusal.
- **`RBoxNarrow { bnV, bnAt }`** (box family): the box local, then `narrowedVariantTail`. **`RRecover
  { rcV, rcAt }`** (scalar family): the nullable local, then `ref.as_non_null` where
  `localNulStrRecovers`. The builder's `narrowedLocalRead` takes a box read at a record, or a
  nullable read at exactly its inner rep. Anything else stays the named miss `narrowed read`. The
  verifier requires a box, or a nullable, operand.
- **Claim hazard.** `emitIdentNode`'s list arms (the union-of-lists override, the list-fit shadow
  and capture stand-in) and the unrolled-slot read consult state the body lowering writes. The
  predicate does not ask them: those arms only fire for a read typed as a list, and these reads are
  typed as a record or as a nullable's inner rep, and `identRead`'s existing path does not ask the
  unrolled slot either. Everything it does ask is checker, rep or pre-pass state. Mode 3 is clean.

## Coverage

Fixpoint seeds of B3 (`40b4835a`) and of this step, each built from its own checkout.

| reading | B3 | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 11,022 | 11,642 | **+620** |
| corpus covered = matched = claimed (12,297 cells) | 30,409 | 30,494 | +85 |
| self-compile blocked by `narrowed read` alone | 653 | 7 | |

Net compiler lines are +117 (+140, −23): 5.3 self-compile functions per line. Most of the cost is
the predicate that mirrors `emitIdentNode`'s ladder.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; armed self-build covered = verified = matched = 11,642 |
| corpus identity, B3 seed vs this seed | 9,030 identical, 3,267 fail under both, 0 differ, 0 one-only; self-compile identical |
| `--names` identity | the same: 0 differ, self-compile identical |
| `--claims` | corpus 30,494, `ir-shadow: ok`, 0 fell back; self-compile 11,642 claimed, 0 fell back |
| mode 3 (this seed under `$VL_IR_SHADOW=3` against B3's default) | 9,030 same, 0 differ, 0 one-only; self-compile identical |
| shadow | corpus all matched, `ir-shadow: ok` |
| L2 self-compile fuel | 96,453,502,814 (B3) to 96,326,992,124 (−0.13%) |
| witnesses (`vl_ir_shadow_test`) | a narrowed box read whole at its variant; a `string \| null` parameter read at its string; 23 passed |

The `--claims` readings need a host with the shipped claim. The shared `vl` here predates it, so they
were taken with one built in an isolated target dir.
