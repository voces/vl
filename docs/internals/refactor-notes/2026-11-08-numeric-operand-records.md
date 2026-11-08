# An operator's operands carry a numeric record (2026-11-08)

Step 5. Follows `2026-11-08-numeric-pair-table-kind.md` (#6822), whose largest floor was
`emitBinOperandAs` at `no record`: an operand is delivered at no position, so no ctx stamp
recorded its pair.

## The record

`binRetTy` (`check_operators.vl`) stamps both operands where it is not quiet, beside the
operands' `atomSrcStamp`. The destination is the pair rule's answer (`numPairOpTy`) over the
operands' scalar types (`numOperandTy`: the checked type, a literal peeled to its base, the
instance's where an elaboration re-checks it), which is the width `binNumWidth` lowers at.
`numOperandStamp` writes `src * 8 + dst` into the same sparse maps as `numPairStamp`
(`nodeNumPair`, `elabCapNumPair`) where the destination is `i64`, `f64` or `f32`. An operand has
no ctx record to read a one-kind pair from, so this stamp stores that pair too. It stamps nothing
where an operand has no type yet (a `-1` hole: without this guard, 18 programs trapped in the
compiler) or a type that is not a number (an un-annotated parameter), where the record would
make no claim.

## Shadow (`run.sh`, sweep population)

| | master `8434f8a7` | this PR |
|---|---|---|
| table | 168,974 | 309,409 |
| floor: no record | 165,816 | 25,380 |
| floor: src differs | 20,428 | 20,429 |
| `emitBinOperandAs` table | 0 | 140,273 |
| `emitBinOperandAs` no record | 141,979 | 1,707 |
| `emitBinOperandAs` src differs | 0 | 1 |

The one `src differs` operand (`tests/cases/generics/annotated-join-coalesce-at-pin.vl`) has a
record of `i32` where the site widens from `f64`. It is listed in `floors.tsv`, and the site's
pair stands. The 1,707 left at `no record` are instance operands whose type is a hole or a type
variable at the check and a number only at the pin: an un-annotated parameter given `f64` by a
value call (`d15206_f64.vl`), a generic `T` instanced at `i64` (D2712). That is a missing
record, not a legitimate floor.

## Proof

| | |
|---|---|
| sweep, 23,679 programs, master fixpoint vs candidate | identical records: 0 `runs → not-runs`, 0 movers |
| plumb-shape main | fuel −0.1%, peak RSS 319.3 MB (+0.4%) against the baseline |
| plumb-shape tail | fuel −1.2%, peak RSS 319.0 MB (+0.4%) |
| fixpoint seed | 6,531,155 bytes (+549 against master's fixpoint) |
| `vl_box_dst_shadow_test` | 42/42, with a new operand case under both controls |
