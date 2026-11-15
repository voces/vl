# Triage of a 50-seed oracle fuzz: 51 new disagreements, three compiler rows, eight oracle bugs, 2026-11-15

Lane B. Net compiler lines: 0. Pin-helper delta: 0. The sweep was `scripts/oracle/fuzz.sh --seeds 50
--count 200` on a fixpoint seed of master `3d526470a`: 30,000 cells, 26,790 in the oracle's
subset, 26,594 agree, COMPILED-BAD 145 (set aside), UNSOUND 17, DISAGREE 34. All 51 come from the
arithmetic generator (`ar_*`); the rep generator's 20,000 cells gave none.

## Method

Each case was minimised by deleting lines while the verdict held. For an UNSOUND case, the oracle
had to keep its fault and `vl check` had to pass. For a DISAGREE case, both had to run, `vl check`
had to pass, and the outputs had to differ. Each witness was then ablated against both sides and
against the ruling (DECISIONS.md, "Exact constant arithmetic"). The family is the ablated mechanism,
not the message.

## Compiler defects (rows)

| family | cells | witness | row |
| --- | --- | --- | --- |
| a constant shift-count tree beside an unfolded constant operand is never range-checked, so wasm masks it | 1 UNSOUND (`ar_s21_0127`) | `print((-3) >>> (40 + 1))` prints `8388607`; `(-3) >>> 41` is refused | D16318 |
| a radix literal beside an `if` or `match` of integer constants, at an `i64` destination, computes at `i32` | 3 DISAGREE (`ar_s10_0105`, `ar_s45_0161`, `ar_s40_0145`) | `const v: i64 = 0xFFFFFFFF + if c { 7 } else { 5 }` prints `6`, want `4294967302` | D16319 |
| radix-pattern arithmetic at a float destination wraps at 32 bits | 1 DISAGREE (`ar_s27_0068`) | `let x: f64 = 0xFFFFFFFF + 1000` prints `999`, want `4294968295` | D16380 |

Found while ablating, already filed by lane O: a parenthesised constant `if` at a wider destination
builds an invalid module (D16374). `const v: i64 = 4294967295 * (if c { 7 } else { 5 })` is
another face of it.

## Oracle bugs (to lane O)

| family | cells | witness | the compiler, and the rule |
| --- | --- | --- | --- |
| O1: an integer division by zero is a constant fault even where the tree is not a constant (a radix dividend, an `if`, a `let` read) | 12 UNSOUND | `print(0x7 / 0)`: oracle `fault: constant division by zero` | warns and traps at run time; radix arithmetic and `if` are not folded |
| O2: a float constant in an `if` join at an `f32` destination is kept at `f64` | 4 UNSOUND, 3 DISAGREE | `function f0(): f32 { (if (1 > 0) { 1.5 } else { (-1.5) }) }`: oracle `return of f0: 1.5 does not fit f32` | runs; a float constant adopts `f32` at its use |
| O3: a radix literal beside an `i64` peer (a call argument, an operator, a comparison) is read at `i32` | 12 DISAGREE | `print(min(3000000000, 0xFFFFFFFF))`: oracle `-1`, compiled `3000000000` | the pattern is read at its use's width |
| O4: `>>>` of a negative constant computes at `i32`, not at its destination | 6 DISAGREE | `const v: i64 = (~1) >>> 9`: oracle `8388607`, compiled `36028797018963967` | computes at the destination's width (D2709) |
| O5: an `if` with a constant condition is folded into an exact float tree | 6 DISAGREE | `print((if (1e-7 == (1e-7 - 2.5)) { 3.0 } else { 3.0 }) * 0.1)`: oracle `0.3` | `0.30000000000000004`; the fold covers literal trees only |
| O6: inside a float division by zero, the subtrees are folded exactly | 1 DISAGREE | `print((1.5 % 0.1) / (2.5 % 0.1))`: oracle `NaN`, compiled `1.0000000000000007` | the unfolded tree stays IEEE whole ("stay the IEEE computation"); a ruling may want this stated |
| O7: a constant arithmetic tree arm (`(-2147483648) - 2147483647`) in a join with an `i32` value is computed at `i32` when the other arm is taken | 1 DISAGREE | `let a: i32 = -2147483547` and `c = false`, then `a + (if c { ((-2147483648) - 2147483647) } else { a })`: oracle `202` | `-4294967094` (the join is `i64`; the literal `-4294967295` agrees) |
| O8: an `(x as? i32) ?? (-5)` operand stays `i32` beside an `i64` peer | 1 DISAGREE | `ar_s39_0189` | widens, as D16376 states the typed-arm rule |

Count: O1 12 + O2 4 = 16 of the 17 UNSOUND, D16318 the 17th; O2 3 + O3 12 + O4 6 + O5 6 + O6 1 +
O7 1 + O8 1 = 30 of the 34 DISAGREE, D16319 and D16380 the other 4.
