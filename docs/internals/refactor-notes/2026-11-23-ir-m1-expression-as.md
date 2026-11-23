# IR-M1: the `expression as` class (2026-11-23, lane IR-M1)

The `expression as` miss is `numCast`'s answer when `numCastKindOf` has no operand-and-tail arm
for the cast. Three mechanisms, one commit each.

## The exact cast in every mode

`numCastKindOf` now answers legacy's `exact` and `holeExact` arms in every mode, not only `as!`
and `as?`. Legacy writes all three modes through `emitNumExactCastFrom`: the operand at
`numExactCastKind`'s kind, then `numExactCastTail`. For a bare `as`, the tail's sad path returns
the function's own null through `emitReturnValue`. `numCastKindOf` is IR-only, so legacy's bytes
do not move.

## Literal-union casts (`RAsTail`)

`asCastArmOf`'s `litAtom` and `numLitScalar` arms are an atom id or a numeric-literal scalar,
staged once and compared with each target member. Legacy's `emitAsLitAtom` and
`emitAsNumLitScalar` are split, byte for byte, into three parts:

- a refusal: `asLitAtomWhy`, `asNumLitScalarWhy`;
- `emitExpr` of the operand;
- an exported tail: `asLitAtomTail`, `asNumLitScalarTail`.

`asLitTail` dispatches the two tails by arm, as a `_`-less match.

The IR builds the operand by its own `exprAt` and lowers `RAsTail { akV, akAt }` as that operand,
then `asLitTail`. The builder requires three things:

- the refusal is "";
- the result rep is the cast's own;
- the operand is a scalar or an atom.

The verifier refuses any other operand under rule 2. Its self-tests are `literal-cast-of-record`
(refused) and `literal-cast-of-i32` (holds).

## `as%`'s narrowed mask and literal fold

- `narrowMask`: `asWrapArmOf`'s narrowed mask is `srEmitNarrowed` over `srWrappedMask`'s
  `[y, k, 1, m]`. That is the IR's `shiftMaskFold` with no outer shift, `[y, k, 1, m, -1]` at
  width 32.
- `litFold`: an integer literal is `emitNumWrapLit`, the low word `parseI64Pair` denotes, followed
  by `and 255` at the `u8` domain.

## Readings

The tests/cases census, master 084c9e87 → head, on fixpoint seeds:

| reading | master → head |
| --- | --- |
| `expression as` | 55 → 23 |
| `start: expression as` | 10 → 4 |
| programs fully IR-only, of 7,109 | 5,193 → 5,206 |

35 functions are newly claimed and none newly missed. Three reach a later miss: one each in
`box of a valued if`, `for range hoisted` and `start: pre-path atom hook`.

## Legacy tails the IR calls

- `numExactCastTail`, through `numCastTail`, for the exact cast's bare `as`.
- `asLitAtomTail` and `asNumLitScalarTail`, through `asLitTail`'s dispatch (`RAsTail`).

## Left in the class

These need their own mechanism:

- `holeOpt` (7): legacy writes the box tag before the operand, or never evaluates it.
- `instMiss` (6): the operand is dropped, then a trap or a return.
- the map arms: `mapProbeTrap` (5), `mapOptBox` (4).
- `zextLoad` (4).
- `numUnion` (3).
