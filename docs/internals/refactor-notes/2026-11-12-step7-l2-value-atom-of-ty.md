# Step 7 L2 §7: whether a coerced union boxes a value atom is asked of its type (59 → 58 parses), 2026-11-12

`emitUnionCoerce` (`wasmEmit.vl`) boxes a value into a union only when the union has a value-atom
member. It asked `unionHasValueAtom(unionName)`, which splits the spelling and runs
`atomsHaveValueAtom` (`emit_base.vl`) over the atoms, with a `nameIsLitUnionType` parse for a
literal-set atom. The union's type, `uTy`, is in hand at the call.

The base is master, with fixpoint seeds on both sides. The population is the whole sweep:
23,933 programs.

## The twin, and the mixed-width literal set

The first type twin asked each canonical member (`canonUnionMemberTysOf`) for a read atom kind
or a string literal set. It disagreed in 57 programs, all mixed-width numeric literal unions
spelled like `i64|i32|i64`. Lane w316 traced why, from the code. `canonUnionLeaves` keeps an
all-literal union as one leaf, and `canonUnionMembersWalk` keeps its literals when they stand
alone. So the one canonical member is the literal set itself. `boxTagOfTy` has no single kind
for a mixed-width set, so the member reads -1. `tyIsLitUnionOrLit` accepts only string
literals. The spelling's per-member answer is the softened literals' atoms, so the twin asks
those too, following w316's suggestion.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the
accumulator of the predicates note. The reach tag is the control: 4,542 programs reach the
call. `uTy` is missing in none of them, and the twin and the spelling disagree in none.

## Changed

- `emitUnionCoerce` asks `unionTyHasValueAtom(uTy)`, a private function beside it. It is true
  for a member with a read atom kind, a string literal set, or an all-literal set with a
  softened literal that has one.
- `unionHasValueAtom` (`emit_union_registry.vl`) and `atomsHaveValueAtom` (`emit_base.vl`) had
  no other caller, and are deleted.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,933 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** With `--findings`, the count goes from 28 renders and 59 parses to 28 and
  58. `emit_base.vl` goes from 21 parses to 20. `--write-baseline` is in this PR.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,445 with 0 failed. lint-self is
  clean. The export budget, with findings, has 0 dead exports.
