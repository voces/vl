# IR coverage: `coalesce optional box field chain` (lane COV-UNION, 2026-11-25)

`a?.b?.v ?? d` where `v` is a union box field (`T | null` held as a value box): legacy's
`emitOptCoalesceBoxLeaf` writes the chain's null test (`emitOptChainIsNull`, every link and the
field), the plan's `if`, the default, then the chain's value (`emitOptChainValue`) and the box read
at the result's rep. The IR took only a base that is no link.

## Mechanism

- Builder (`coalOptLeafBuild`): for a box leaf whose receiver is itself a `?.` link, the operand is
  the chain's root (`optChainRootOf`), owing no recover, read again at each use or a place.
- Lowering (`coalOptBoxChain`): the same walkers the standalone `?.` read uses (`optChainIsNullAt`,
  `optChainValueAt`) over an `ROptRead` view of the `??`'s root, with the `??`'s staging settled
  after the null test; a staged chain stays a named miss.

## Measurements

- Class cut (`scripts/ir-i8-census/classes/coalesce-optional-box-field-chain.txt`, 3 programs,
  plus the sweep), master tree before and this tree after:
  - `coalesce optional box field chain` 3 → 0 start rows (10 → 0 with the sweep's 7 functions);
  - `field-write-literal-into-wider-built-receiver-runs.vl` and `d15214_deep.vl` start bodies
    claimed; `optional-chain-nullable-field-coalesce.vl`'s start moves to `null test optChain`;
  - claimed functions and start bodies 8 → 17.
- Q58 sweep `tests/cases/soundness/optional-box-field-chain-coalesce-in-each-position.vl` (a
  parameter, local and global root, a three-link chain, scalar and union results, a return, an
  argument, a binding, a loop, an `if`): 7 functions missed before, all claimed after; output
  equal to master's.
