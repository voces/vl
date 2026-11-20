# IR: a tag leaf at an open function type, 2026-11-20

## Sizing (census on master `890abde55` + #9233, by originating grid)

`tag leaf rep` alone was 105 functions: d15119 55, d15116 24, d15117 6, d15208 3, d16278 3,
d16279 3. Pairs: `index none + null test boxTag + tag leaf rep` 32 (d15116), `indirect call + tag
leaf rep` 14 (d15068).

The mechanism: a generic function used as a value, as in `function mk() { return { f: id1 } }`.
`id1`'s node is typed at its open function type, so `primRepOf` names no `i32`. Legacy still
writes the member's id there as an `i32.const` (`fnTagLeafEmitted`).

## The change

`tagLeaf` (`ir_build.vl`) builds the leaf at the `i32` rep whatever rep the node's own type
names. A destination that is not the set's `i32` (a closure slot, say) still misses at its own rep
check, so the leaf is only ever delivered where legacy's id lands.
