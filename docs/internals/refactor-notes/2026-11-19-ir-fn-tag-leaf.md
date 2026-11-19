# IR: a tagged function set's value (the tag leaf), 2026-11-19

The first of three steps on the `pre-path` family's function-tag half (the coordinator's family
A): the tag leaf, then the dispatch over a set's arms, then locals and parameters of a set's rep.
The other `pre-path` family, `listCopy` coercions, is deferred: most of its rows are paired with
`array ref` or the map classes.

## Sizing (census on master `160e76b88` + #9142, by originating grid)

Alone: `pre-path tag dispatch` 88, `pre-path tag leaf` 87, `open parameter type` 73, `open local
type` 14, and their pairs (`open local type + tag dispatch` 165, `open parameter type + tag
dispatch` 103). Grid `d16846` dominates (66 cells), then `d15068`, `d15116`, `t3p` and `d16301`.
The mechanism is a generic function used as a value: legacy writes it as an `i32` id of a
function-tag set (`fnTagLeafId`) and a call through it as a dispatch over the set's arms
(`fnTagArmsAt`).

## The change

- **One decision, `fnTagLeafEmitted(ix, fnIx)`** (`wasmEmit.vl`): the member id, unless the read
  is a maker twin's returned closure (`monoTokenReturnedFe`, D14825). `emitExpr` writes it, and
  `exprPrePathWhy` names the miss from it.
- **The builder** takes `pre-path tag leaf` in `irBExpr`'s prelude, before any node kind, as an
  `i32` immediate (`tagLeaf`). A closure-rep function value stays STORE's `cloValue`
  (#9130), which a tag leaf never reaches: the checker's `fnTagSetIsTagged` makes the split.

Compiler lines are +22 −7, 15 net (`ir_build.vl` +11, `wasmEmit.vl` +4).
`tests/vl_ir_shadow_test.ts` moves the tag leaf from the named-miss list to a covered-and-matched
case.

## Readings

| reading | master `a5b0bdf18` | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 32,083 | 32,152 (+69) |
| corpus covered = verified = matched (shadow) | | 32,152 (70.4%) |
| L2 self-compile fuel | 99,714,309,014 | 99,724,564,849 (+0.01%) |
