# IR coverage: `coalesce optional staged receiver`, box leaf (lane COV-UNION, 2026-11-25)

`ks[0].j?.f ?? d` where `f` is a union box field and the receiver is no place legacy reads again
(`optChainStagesRecv`): legacy's `emitOptCoalesceBoxLeaf` tees the base into the `?.` stash on its
first read and reads it back from there (`emitOptRecvBase`). The builder refused a staged receiver
on the box leaf.

## Mechanism

The box leaf takes a staged receiver and routes it through `coalOptBoxChain`, whose walkers
(`optChainIsNullAt`, `optChainValueAt`, `optChainRoot`) already write the stash tee and its reads
for the standalone `?.` read. A record leaf or a scalar leaf over a nested chain with a staged base
stays a named miss.

## Measurements

- Class cut (`scripts/ir-i8-census/classes/coalesce-optional-staged-receiver.txt`, 3 programs, plus
  the sweep), master tree before and this tree after: `coalesce optional staged receiver` 3 → 1
  start rows (`nullable-nested-record-built-wider-beside-own-binding-runs.vl` and
  `d15214_list_dst.vl` claimed; `optional-chain-guarded-dot.vl`'s start, a scalar leaf over a
  staged nested chain, stays); claimed 12 → 16 with the sweep.
- Q58 sweep `tests/cases/soundness/optional-box-field-staged-receiver-in-each-position.vl` (an
  element, a call's result, a field over an element; a return, an argument, a binding, a loop, an
  `if`; the call counted once): `bind` and `cond` missed before, both claimed after; output equal
  to master's.
- Legacy refuses the sweep's first spelling, `m[k]?.f ?? d` with `f` a value-union box on the map's
  record value: `emitCoalesceOptMapField` has no leaf for a box field (`optLeafKindOf`); the same
  read through a local runs. Not filed (lane brief O3); the IR claim for the fused map read's box
  leaf would close it.
