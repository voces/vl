# D16004 / D3234: a union argument meets a hole's demand member by member (2026-11-13)

`function take(p) { if p is A { p.x } else { p.y } }` called with `A | B` was refused:
"argument 1: expected A | {y: _}, got A | B". The `else` arm's `p.y` grows the parameter's
demanded shape `{y: _}`, and the `is` guard registers `A` as an alternative. `holeDemandOk` asked
that disjunction of the whole argument, and `A | B` is neither. Each value of the argument takes
one path, so the close asks it of each member (check_demands.vl, `holeDemandOk`, with the
alternative loop split out as `holeAltOk`): `A` takes the guard, `B` meets `{y: _}`. A member
neither fits is still refused at the argument.

## A refuted first attempt

The first candidate minted the `else` arm's `HD_GNOT` remainder for a record tested type: it
deleted `holeElseRemainderOk`'s record exclusion. It ran every matrix program. Its sweep had two
problems:

1. **One runs → not-runs:** `generics/hole-field-else-arm-admitted-write-keeps-remainder.vl`,
   D3420's field-path fact. A guard on field paths fixed that.
2. **A soundness net lost a refusal:** `soundness/hole-is-guard-alternative-reject.vl`. With the
   remainder minted, the arm's field demands moved onto the derived hole and off the argument
   check, which is the exclusion's own stated reason. `foobar({ baz: "baz" })` was no longer
   refused at the argument; only the instance's elaboration refused it, later and only on its own.

The candidate is not landed. D16008 records the reads that still need a remainder (scalar uses),
with the constraint that a fix keep field demands on the argument check.

## Position matrix

| program | master | this change |
| --- | --- | --- |
| `else { p.y }` over `A \| B` (the witness) | refused | `yy` |
| three-member chain over `A \| B \| C` (D3234) | refused | `2.5` |
| early return, then `p.y` | refused | `yy` |
| pin `A \| B \| D` (both non-`A` members hold `y`), direct and forwarded | refused | `dd` |
| two pins, `B` then `A \| B` | refused | `bb 1` |
| pin `A \| B \| C` (`C` lacks `y`), direct and forwarded | refused | refused, unchanged |
| the soundness net's three calls | refused | refused, unchanged |
| a field read on a hole's field with an admitted write (D3420) | runs | runs |
| `!(p is A)` | refused | refused — D16007 |
| `else { useB(p) }`, an argument demand | refused | refused — D16005's family |
| `else { print(p) }` over `A \| i32` | refused | refused — D16008 |
| two pins with a scalar `else` | refused | refused — D16006, the annotated `p: i32` refuses too |

## Measurement

The sweep against a fixpoint of the merge base: 24,250 programs the same, with 0 bytes-only
movers, 3 output movers (the D16004 and D3234 witnesses and the new fixture, each now running)
and 0 runs → not-runs.
