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
- `ir_verify.vl`: the `RRetag` rule admits `cloHoleRetag`. The negative self-test is a retag
  between closure lists that differ in a concrete parameter, refused under rule 2.

## Witness

`tests/cases/closures/hole-fn-list-handed-to-concrete-param.vl` hands each B shape to a
concrete-parameter callee that calls the closures and reads the records. The old seed leaves its
`@start` uncovered, at `argument coercion`.
