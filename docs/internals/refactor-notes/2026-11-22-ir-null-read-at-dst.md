# IR: a read narrowed to `null` at its destination (2026-11-22, lane IR-N3)

The coordinator ruled the `nullread` arm of `narrowed read` to IR-N3. Ranked by an instrumented
miss on master 47b9d7bb, the rows were locals with a nullable storage (`N:i32`, `N:str`) read where
the checker types the node `null` (`arm=nullread`, all at a delivery). Legacy's `emitIdentNode`
writes the destination's own null when its rep kind is not the storage's (`emitNullReadAtDst`), and
otherwise reads past the null arm, which is the storage local as it stands.

## The change

- `wasmEmit.vl`: `emitNullReadAtDst`'s decision is `nullReadDstOwnOf`, the `NULL_OWN_*` it writes
  or -1. The union branch is `emitNullOwn(NULL_OWN_BOX)`, the same bytes. Legacy asks it as before.
- `ir_build.vl` `deliver`: an identifier read on the `nullread` arm (`nullReadOwnAt`) is an
  `RNullOf` at the destination where `nullReadDstOwnOf` names a null (checked by
  `nullOwnRepFits`), else the seated read of the local, which must already sit at the
  destination's rep (`null read storage rep` otherwise).
- `narrowedLocalRead`: a seated `nullread` read whose arm past the null is `local` is the local.

## Left open

- A `nullread` read outside a delivery (`print(r)` with `r` narrowed to `null`,
  `null-narrowed-niche-read-keeps-its-cell`) still misses on `narrowed read`.
- A stored read at another rep than the destination's misses on `null read storage rep` (1 row in
  `null-let-read-takes-its-most-recent-write`).

## Witness

`tests/ir-shadow-rows/null-read-at-its-destination.vl`: `other` (an `i32 | null` cell read into a
`string | null`, the destination's null) and `same` (a `string | null` cell read into a generic
`T = string | null` parameter, the storage read).

## Measured vs merge-base a00578d1f (fixpoint seeds on both sides)

- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14018, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7606, differ 0; witnesses same 60, differ 0. These cover the
  union branch's move from inline bytes to `emitNullOwn(NULL_OWN_BOX)`.
- tests/cases legacy A/B: identical 7326, differ 0.
- tests/cases armed shadow: covered 68,073 → 68,078, matched 68,072 → 68,077 (+5);
  `uncovered narrowed read` 142 → 136; one new `uncovered null read storage rep`.
- Corpus no-blocker functions unchanged at 44,857 (narrowed read 10 → 10).
- Self-compile L2 fuel +0.57% per PR: `deliver` asks `nullReadOwnAt`, and through it
  `identReadArmOf`, for each identifier it delivers.
