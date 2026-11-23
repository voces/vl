# IR: the `expression as` arms left after #9679 (2026-11-23, lane IR-D1)

Follows M1's #9679 (`2026-11-23-ir-m1-expression-as.md`). A probe at `numCast`'s miss, run on
master e6cb8541 with the arm and result rep, split the class (functions):

| arm (`asCastArmOf`) | fns | taken |
| --- | --- | --- |
| `holeOpt` | 11 | yes: by `holeOptShapeOf`, null box or `RHoleOptBox` |
| `instMiss` | 10 | `as?` only (8): operand dropped, then the cast's null |
| `mapProbeTrap` | 5 | yes: `RMapGet.mtTrap` |
| `mapOptBox` | 4 | yes: the box plan's boxed read |
| `numUnion` | 3 | yes: `RNumUnionConvert` |
| `holeMiss` | 2 | no |

## Mechanisms (one commit each)

- `mapOptBox`: `emitMapGetScalarBox` is the probe plus `emitMapGetScalarBoxTail`, which
  `RMapGet.mtBox` already lowers. `mapGetAt` now takes the temp's type: the cast's own, where the
  Index node's type is the value's.
- `numUnion`: `emitNumUnionConvert` is the box plus `numUnionConvertTail`, the `RNumUnionConvert`
  a numeric-union delivery takes; `nuAt` is the operand, whose members legacy dispatches on.
- `mapProbeTrap`: legacy's `emitAsMapProbeTrap` is split into `emitMapPrep` and an exported
  `asMapProbeTrapTail`. `RMapGet` gains `mtTrap`, which lowers to the probe and then that tail,
  and banks no element-read row, as legacy's direct call banks none.
- `instMiss` under `as?`: the operand, an `SDrop`, then `RNullOf` at `asInstMissNullOwn`, now
  one query that `emitAsInstMiss` also asks (a union result's null box, else its type's null).
- `holeOpt`: `holeOptShapeOf` names `emitHoleNumAsOpt`'s three shapes.
  - "null": the null-tagged box, operand unread, so `RNullOf` at `NULL_OWN_BOX`.
  - "exact": unchanged, the exact cast.
  - "box": legacy writes the tag, then the plain cast, then the value and union boxes. So
    `numCastKindOf` and `numCastTail` answer the plain cast (IR-only, legacy bytes do not move),
    and the new `RHoleOptBox { hxV, hxAt }` lowers to `leaf()`, `holeOptBoxHead`, the operand,
    then `holeOptBoxTail`. `emitHoleNumAsOpt` writes through the same head and tail.

## Verifier

`RHoleOptBox` is rule 2: its operand is a scalar, and its result a box (`boxShaped`). Keyed
self-tests: `hole-opt-box-of-record` (refused, 2), `hole-opt-box-of-i32` (holds, 0).
`RMapGet.mtTrap`'s result is the map's value; it passes the existing `mapGetDstOk`.

## Legacy tails the IR calls

- `asMapProbeTrapTail`, through `RMapGet.mtTrap`.
- `holeOptBoxHead` and `holeOptBoxTail`, through `RHoleOptBox`.
- `numPlainCastTail`, through `numCastTail`'s `holeOpt` arm at the "box" shape.

## Left in the class

- `holeMiss` (2), and `instMiss` under `as!` and bare `as` (2): each is an operand, then a trap
  or a `return` inside the expression, so the cast has no value after it. They need a
  path-ending expression (an `STrap` or `SReturn` with a dead value).
- `holeOpt` pinned at `boolean` (`as-type-param-boolean-pin.vl`, 2): the plain cast's operand is
  the `boolean` rep, which `numCast` refuses as `as operand coercion`.

The measurements are in the PR body.
