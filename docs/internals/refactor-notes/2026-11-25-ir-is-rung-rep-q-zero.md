# IR: `is rung` and `rep ?` to zero on every population (2026-11-25, lane COV-IS)

The 2026-11-20 census gave these classes 1,201 / 183 / 9 (`is rung`) and 232 / 83 / 15 (`rep ?`)
distinct functions on tests/cases / witnesses / probes, and 386 / 71 / 1 for `null test boxTag`.
On master 7eddff27, most of that was already gone. This PR closes what was left.

## Measured on master 7eddff27 (fixpoint seed, census.sh's probe build)

| class | tests/cases | witnesses | probes |
|---|---:|---:|---:|
| `is rung` | 0 | 0, and 1 start body (`floatLits`, D16704's witness) | 0 |
| `null test boxTag` | 0 | 0 | 0 |
| `rep ?` | 2 (`string` in `wild`, `mat`) | 0 | 0 |

Distinct functions claimed, whole population: tests/cases 44,370 of 45,442 (97.6%), witnesses
11,463 of 11,645 (98.4%), probes 644 of 650 (99.1%).

## What landed

- **`floatLits`**: `isArmOf`'s rung for a float box tested against integer literals. Legacy
  writes each member's `emitUnionLitIs`, or-ed, which is the `numBox` literal arm's code. The
  builder routes the rung to `isLitArmsTest` at `numBox`. The lowering's plan check takes `numBox`
  where the rung is `floatLits`.
- **An untyped string pattern**: a `match` over an open scrutinee desugars to `==` against the
  arm's string literal, which has no type. Where it takes no member atom (`strLitTakesAtom`) it
  is built at the string rep, as legacy's `emitStr` writes any literal.
- **Census split**: `census.sh`'s probe compiler names the rung of an `is rung` miss and the node
  kind of a `repMissAt` miss. The shipped classes are unchanged.

## Legacy tails the IR calls

None new.

## Witnesses (Q58 position sweeps, armed shadow, mode 2)

- `tests/cases/unions/float-box-int-literal-is-positions.vl`. Base: 3 `is rung`. Head: 66 of 66
  matched. Two functions whose receiver is a call stay `is staged`, a separate mechanism.
- `tests/cases/match/open-scrutinee-string-pattern-positions.vl`. Base: 6 `rep ?`. Head: 8 of 8
  matched.

## After (`census.sh`'s probe build, restricted to the class's programs: 2 cases, 1 witness)

| reading | base | head |
|---|---|---|
| tests/cases distinct functions claimed | 14 of 20, 2 `rep ?` | 16 of 20, 0 `rep ?` |
| witness start bodies claimed | 0 of 1, 1 `is rung floatLits` | 1 of 1 |

Both are 0 on all three populations. The rest of those two cases is `atom tower place` (3) and
`pre-path atom hook` (1), another class.
