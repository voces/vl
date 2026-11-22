# IR: a union box narrowed to its niche (2026-11-22, lane IR-N3)

The coordinator ruled IR-N5's narrowed-read family A to IR-N3: 27 tests/cases functions where a
nullable union box is read at a narrowed nullable member (str 6, bool 7, record 7, atom 5, list 2).
Legacy's `emitIdentNode` takes a local box narrowed to a `boolean | null` or `string | null` niche
on its `niche` arm (`nicheReadKindAt` 1 or 2): `emitNarrowedNicheRead` reads the box at its storage,
stashes it, and writes the null tag as the niche's null, any other arm unboxed. The IR had no rung.

## The change

- `wasmEmit.vl`: `emitNarrowedNicheRead`'s tail after the storage read is `emitNicheReadTail`.
- `ir.vl`: `RNicheRead { nrV, nrAt, nrKind }`, in the `box` family.
- `ir_build.vl` `narrowedLocalRead`: on the `niche` arm, kind 1 or 2 over a box cell builds
  `RNicheRead` of the local.
- `ir_lower.vl`: the operand, then `emitNicheReadTail`.
- `ir_verify.vl`: the operand is box-shaped; kind 1 lands at a `boolean | null` niche, kind 2 at a
  `string | null`, anything else rule 2. Self-test case 25, a niche read over an `i32` operand, is
  refused under rule 2.

The family's record, list and atom rows take other arms; this covers the str and bool rows.

## Witness

`tests/ir-shadow-rows/narrowed-box-read-at-its-niche.vl`: a `string | i32 | null` and a
`boolean | i32 | null` local narrowed past `i32` and passed at their niche.

## Measured vs merge-base 14d707ae (fixpoint seeds on both sides)

- `--names` self-compile identical; mode 3 self-compile byte-identical.
- `ir-identity.sh --cases`: identical 7624, fail under both 68, differ 0; witnesses same 61,
  differ 0. `--claimless`: identical 14019, fail under both 3267, differ 0.
- tests/cases shadow sum: covered and matched 69434 → 69447 and 69433 → 69446 (+13);
  `uncovered narrowed read` 62 → 49. Those are the 13 niche rows of family A; the 14 record, atom
  and list rows still miss.
- Corpus shadow: 45201 of 45678 functions covered, verified and matched.
- L2 self-compile fuel +0.13% on base 14d707ae (per-PR tier +1%).
- Deep-nesting margin: base and branch alike, 920 KB fail, 930 KB pass.
- Late demands 9 (baseline 9); late tag rows 307 (baseline 307); `ladder-sets` 100 sets clean;
  `ir prepost` (mode 6) and `ir claims` ok, with no new row.
