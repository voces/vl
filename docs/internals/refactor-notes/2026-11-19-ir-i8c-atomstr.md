# IR I8c part 1: the atom decode as an op (`RAtomStr`), 2026-11-19

I8c retires `armSeat` and `atomSeat` from the IR's side (`2026-11-16-ir-i8-coercion-ops.md`).
On master `01a145c14` the blocker census showed `armSeat` with no row left: no coercion is a box
into a record. `narrowedLocalRead` already builds `RBoxNarrow` for a narrowed boxed read. So this
part takes `atomSeat` alone; retiring `armSeat` is a later legacy-side deletion.

## Sizing

A scratch build named each coercion miss with its reps. 119 corpus functions were blocked alone
by `{assignment, global store, return, argument, declaration} coercion nullable>nullable`.
Counted by originating grid, that is two grids: `d3290` (104) and `d3140` (15). They are one
mechanism: a `K | null` delivered at a `string | null`, typically at a generic pin. Beside it
were `atom>nullable` (about 6) and `string atom` (17).

## The change

- **`RAtomStr { sxV, sxAt }`** (`ir.vl`, family `scalar`). `widenTo` builds it where an atom
  meets a `string` or `string | null` destination, or a `K | null` meets a `string | null`, and
  the node is a literal atom (`exprIsLitAtom`).
- **Verifier rule 2:** the source is an atom or its `K | null`. The destination is `str` or
  `string | null`, and a nullable source needs a nullable destination.
- **Lowering:** the operand, then `atomStrTail` (`wasmEmit.vl`). It picks the members legacy's
  `emitAtomToStr` picks: the checker's record where `atomFloorWhy` lets it serve, else the
  site's own. It then stashes the id and writes the decode.
- **Legacy shares the decode.** `emitAtomToStrTower` and `emitNulAtomToStr` both end in
  `atomStrDecode`, the member tower behind an optional `-1` → `ref.null` test.

Compiler lines are +83 −10, 73 net: IR +35, legacy +32, lint tables 0. No legacy line is
deleted: the seat still serves unclaimed functions. Eight lines of the null decode moved into
`atomStrDecode`, and `atomStrTail` is new. It is a coverage step, graded on coverage.

## Readings

| reading | master `01a145c14` | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 30,652 | 30,785 (+133) |
| corpus covered = verified = matched (shadow) | — | 30,785 of 45,675 (67.4%) |

About 1.8 corpus functions gained per net compiler line.

| bar | reading |
| --- | --- |
| self-build | fixpoint |
| `ir-identity.sh <master> <cand> --names` | identical 9034, fail under both 3267, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7511, fail under both 68, differ 0 |
| L2 self-compile fuel | 99,286,294,489, +0.3% on the 99.03G baseline |
