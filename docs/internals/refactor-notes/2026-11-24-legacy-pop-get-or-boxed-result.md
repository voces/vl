# Legacy: a `pop`/`get` `?? d` stored as a box leaves the fused read (2026-11-24, lane IR-D1)

D17382, express. `coalArmOf`'s fused `popOr` (`coalPopOrFits`) and `listGetOr` arms read a scalar
list's checked element or its default as one scalar. They asked an `f32` or `i64` list for a
result of the element's prim, but nothing of an `i32` list (both arms) or an `f64` one (`.get`), so a
`??` stored as a union box wrote the default's box where the element's scalar goes.

## Mechanism

Both arms leave a `??` stored as a union box (`exprUnion`) to the general arms. A result that is
the element, a boolean or an atom keeps the fused read byte for byte: requiring the element's prim
instead would have moved `boolean[]` and atom-list reads, whose results are not `i32`-primmed.

## Readings

Fixpoint seeds both sides; the base master `ca4313b0` in its own tree.

- Legacy A/B over `tests/cases` and the probes: `3 DIFF, 8121 same`, the moved exactly
  `pop-get-or-result-rep-i32.vl`, `pop-get-or-result-rep-f64.vl` and
  `pop-or-call-default-once.vl`, each invalid wasm on master.
- Per cell, `--names` builds of the 108 matrix cells split one per program: `90 same, 18 moved`.
  The 18 are `pop`/`get` over `i32` and `get` over `f64`, results `T | null` and `T | string`, at
  a binding, an argument and a return, each invalid wasm on master; every element and chain cell,
  and every `i64`, `f32`, `boolean` and atom cell, is byte-identical.
- `pop-or-call-default-once.vl` prints `9 0 1 5 1 1 9 0 2` on the head seed and the claimless
  compiler: the pop runs once, and the default's call only on an empty list, after it.
- Census per tree: over the 22,530 files both trees hold, no function's claim moves in any
  population; 0 claimed functions lost. The 18 moved cells are IR-claimed in the head tree.
- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 8059,
  differ 0`; claimless `identical 14481, differ 0` (claimless compiler sha256 `2e6f307f…3889`,
  built in `33a7ece5`, `compiler/` clean). The Q58 matrix files are claimless-identical,
  `identical 13`.
- Fuel: per PR +0.00%; the pair is L2 128243290336 against base 128242332663.

## Legacy tails the IR calls

None new.
