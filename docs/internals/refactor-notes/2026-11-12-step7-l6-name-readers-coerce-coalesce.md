# Step 7 L6: the coerce member set and the `??` literal-arm test read the union's type, 2026-11-12

This is the second batch of the name-reader census's round-trip sites (census in
`2026-11-12-step7-l6-name-readers-census.md`). Both callers hold the union's arena type beside its
name.

- `emitUnionCoerceUnder` resolved an alias name to its member set with `unionMemberSetOf`. It now
  reads the member set of the row the destination type keys to (`unionMemberSetOfRow`), keeping
  the name where the type keys none.
- `coalesceResultUnionName` admitted a literal-arm join when its rendered name was bound to a row.
  It now asks whether the node's type keys one.

## Probe

A probe compared the new answer with the old at each site. The population is the whole sweep,
24,130 programs, plus a self-build of `compiler/entry.vl` under the probe compiler, which reaches
`emitUnionCoerceUnder` and agrees.

| site | programs | same | differ | no type row |
| --- | --- | --- | --- | --- |
| `emitUnionCoerceUnder` | 6,609 | 6,594 | 1 | 30 |
| `coalesceResultUnionName` | 57 | 57 | 0 | — |

The one difference is the member-order twin `literal-unions/litunion-mixed-type-member-dispatch.vl`
(`i32|string` and `string|i32`). Its module is byte-identical below.

## Proof

- **Self-compile.** `--prove-fixpoint` holds. The head source built by the previous seed and by
  this one is byte-identical.
- **Targeted.** The 5,339 file cells reaching either site were built on the previous seed and this
  one: 5,339 byte-identical modules. CI's sweep is the proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. A fresh `render-parse-census.vl`
  report reads 12 renders and 44 parses, the baseline. A fresh `dead-exports.vl` report has 0 dead
  exports.
