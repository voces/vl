# D1885: `match` over an open parameter type is checked over its arm union (2026-11-13)

`match p { … }` over an un-annotated parameter, or a type parameter `T`, was refused as "match
scrutinee must be a union or an integer, got _" (or `got T`). Its `is` and `==` twins ran. Only
integer-literal arms had a path for a hole scrutinee (D1572).

## The change

The whole change is in `check_match.vl`, in `checkMatchOpenScrut`. When the scrutinee's type is a
hole or a type variable and its arms are not all integer literals:

- The arms name a union: each type pattern's type, each literal's literal type, and `null`.
- The `match` is checked over that union, as the parameter annotated with it is. No annotation
  is invented: the scrutinee keeps its open type.
- Each arm narrows to its own pattern, the last one included. An open scrutinee's complement is
  still open, so the else arm's complement alone would leave the parameter unnarrowed there
  (D16004, filed for the `is` spelling).
- Unless a `_` takes the rest, the scrutinee's parameter records an ordinary argument demand
  toward the arm union, at its own position (`noteArgCstr`, form = parameter index). The pin is
  asked exactly the annotation's argument question, through the literal-aware `argCstrFitsAt`.
  A literal argument, a forwarder (`outer(q) { color(q) }`) and a generic parameter therefore
  behave as `p: "red" | "green"` does.

So the change accepts no pin the annotated spelling refuses. An uncovered pin is refused at the
call: "argument 1: expected "red" | "green", got string (the call of `color` …)".

## Position matrix

One program per union element type, each with its controls. The cells are now
`tests/cases/match/open-scrutinee-*.vl` and `error-open-scrutinee-pin-not-covered.vl`.

| scrutinee | master | this change |
| --- | --- | --- |
| literal union (the witness) | refused | `1` |
| value union `i32 \| string` | refused | `hi!` |
| record union `A \| B` | refused | `yy` |
| generic `T`, literal arms | refused | `0` |
| generic `T`, type arms, two pins | refused | `hi! 4` |
| annotated, `is`, `==`, local, integer controls | run | unchanged |
| literal argument `color("green")` | refused | `0` |
| nullable pin with a `null` arm | refused | `-1 1` |
| a `_` arm with a `string` pin | refused | `0 1` |
| forwarder with a literal | refused | runs, as the annotated forwarder does |
| `string` pin, no `_` | refused (scrutinee) | refused at the call (argument) |
| `i32 \| string \| boolean` pin over `i32`/`string` arms | refused (scrutinee) | refused at the call: expected `i32 \| string` |

The record union with the `is` spelling, `if p is A { p.x } else { p.y }`, still refuses on
master and here. It is filed as D16004: its bare `else` leaves the hole open.
