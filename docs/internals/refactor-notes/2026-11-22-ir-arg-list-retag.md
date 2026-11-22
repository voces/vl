# IR: a list handed at its parameter's storage is retagged (2026-11-22, lane IR-N3)

The coordinator queued IR-M1's `start: argument coercion` rows (list → list and list → box at a
call argument, 24 cells) to IR-N3. `directCallAt` missed wherever `deliver` returned the argument
at a rep other than the parameter's.

## Ablation

The rep pair at the miss was read from a scratch probe, which is not committed. Each family was
then cut to the ingredient that decides it.

| family | cells | rep pair | ingredient |
|---|---|---|---|
| B | 8 | `list(clo(U,=>U))`, or a list of such lists, → `list(clo(i32,=>i32))` | the value's closures hold the hole and the parameter's are concrete |
| B' | 2 | `list(clo(U,=>U))` → `list(clo(=>void))` | held back |
| B'' | 1 | `list(clo(f64,=>f64))` → `list(clo(i32,=>i32))` | two instances, held back |
| A | 1 | `list(X)` → `list(X \| null)`, X a string, list, bool or atom | a readonly widening legacy shares, held back |
| C | 11 | `list(T)` → box | a generic callee: `len<T>(t: T[] \| i32)` misses and `len(t: i32[] \| i32)` matches; a separate change |
| D | 2 | `list` → an unresolved parameter rep | held back |

## The change

- `ir_build.vl` `directCallAt`: where the argument's rep is not its parameter's, a `listRetag`,
  `listRetagHole`, `cloHoleRetag` or `recRetag` pair with an empty pre-path builds `RRetag`, as the
  binding and the return already do. It writes no bytes.
- `ir.vl`: `cloHoleRetag(src, dst)` is the one predicate for two reps that differ only in closure
  openness, either way round, a map's values included. It is IR-N6's (`ir-closure-hole-retag`),
  added here under the same name, signature and body; whichever lands second takes the other's.
- `ir.vl` `repFillsHole`: a record arm is heap identity. Two records are one value exactly where
  one heap stores both, so a recursive record pair (`L1 = {n: L1 | null}` beside its twin `L2`)
  ends the walk, and twins on two heaps never retag. The heap is the one the builder noted on the
  IR (`irRecHeapNote`, from `recHeapOf`, before it asks a hole retag); the verifier compares the
  notes and makes no emit query. An unnoted record retags nothing.
- `ir_verify.vl`: the `RRetag` rule admits `cloHoleRetag`. The negative self-test is a retag
  between the lists of two field-alike records (`{a: i32}`, `{b: i32}`) noted on two heaps, refused
  under rule 2.
- The remaining edge is `recRetag`, whose verifier arm still calls `recHeapOf`, an emit query
  (D17049, IR-D1's to move onto the same note).

## Witness

`tests/ir-shadow-rows/recursive-twin-list-handed-across.vl` hands a recursive record's list to its
twin's: a seed whose record arm recursed through fields traps on it.

`tests/cases/closures/hole-fn-list-handed-to-concrete-param.vl` hands each B shape to a
concrete-parameter callee that calls the closures and reads the records. The old seed leaves its
`@start` uncovered, at `argument coercion`.

## Measured vs merge-base 5be659a8 (fixpoint seeds on both sides)

The branch is stacked on #9590 (the arm unbox), and this proves both.

- `--names` self-compile identical. `ir-identity.sh --cases`: identical 7630, fail under both 68,
  differ 0; witnesses same 61, differ 0. `structs/structural-twin-heap-dedup.vl`, which a first cut
  trapped on, is among the identical cases. `--claimless`: identical 14021, fail under both 3267,
  differ 0.
- tests/cases shadow sum: matched 70012 → 70036, start matched 6252 → 6290. `start uncovered
  argument coercion` 122 → 88, `uncovered argument coercion` 64 → 51, `uncovered narrowed read`
  53 → 44 (the arm unbox).
- Corpus shadow: 45254 of 45678 functions covered, verified and matched.
- L2 self-compile fuel +0.19% on base 5be659a8 (per-PR tier +1%). The same-tree pair, both seeds
  compiling the base tree, reads 112531634429 → 112527900535 (−0.003%), so the rise is source
  growth.
- Deep-nesting margin: base and branch alike, 920 KB fail, 930 KB pass.
- Late tag rows 307; `ladder-sets` 101 sets clean; phase state ok (surface 2867); `ir prepost`
  (mode 6) and `ir claims` ok with no new row; `gate.sh --fast` passed; lint-self clean.
