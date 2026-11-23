# IR: an annotated binding of a bundle holder's read (2026-11-23, lane IR-D1)

`declaration coercion` on master c5edbae4's forced IR-only census was 13 functions and no start.
A probe at the miss printed each value type and binding type:

| value > binding | fns | taken |
| --- | --- | --- |
| bundle holder `{c0: (f64) => f64, c1: (i32) => i32}` > one of its closures | 9 | yes: `RHolderPick` |
| `(() => Circle \| Sq)[]` > `(() => Sq \| Circle)[]` | 1 | no, next |
| `B \| D` > `A` (D16321's union of contained records) | 1 | no, next |
| `i32[][]` > `(i32[] \| null)[]` | 1 | no, next |
| `_ \| null` > `C \| null` | 1 | N5's batch 7 |

## Mechanism

Legacy's `emitLetInitValue` asks `emitTypedHolderInit` before every other initializer arm. Where
`typedHolderMember` names a member (D15862, D15863), it writes the holder's read and the
`struct.get` of that member (`bundleMemberPickOf`). The builder now does the same, at the same
point. The holder's record goes first (`exprAt`, as the argument hand pick reads it), then the
new `RHolderPick { hkV, hkAt, hkArg }`, typed at the binding's rep and type. Its lowering asks
the same two queries and writes the same `struct.get`. `RHandPick` is not reused: its member
query is call-specific (`bundleHandMemberAt`).

A module-scope `const` holder read in a start body (`emitTypedHolderInit(gst, -1)`) is out of
scope: no start row exists.

## Verifier

`RHolderPick` is rule 2: its operand is a record and its result a closure. Keyed self-tests:
- `holder-pick-of-i32`: refused, 2;
- `holder-pick-record-into-i32`: refused, 2;
- `holder-pick-record-into-closure`: holds, 0.

## Legacy tails the IR calls

None new: `bundleMemberPickOf` and `typedHolderMember` are queries.

The measurements are in the PR body.
