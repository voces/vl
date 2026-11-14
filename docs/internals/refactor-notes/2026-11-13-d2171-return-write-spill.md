# D2171: a `return` or `let` that yields a field or element write, 2026-11-13

An assignment yields its right-hand side. The emitter delivers that value by re-reading the
target, which it refuses for an element with a non-literal index or a right side typed
differently from the target. D2170 spilled such a write at a block's tail. A `return` argument
and a `let` initializer are the other two positions where nothing else is evaluated, so
`spillValueWrites` (emit_rewrite) spills a write found there with the same `spillWrite`. The
receiver, index and value become `const`s in source order, the write follows, and the statement
yields the spilled value.

The walk runs on every function body, through `if` arms and loop bodies, and only on a `return`
in a function that yields.

## Graded

Each position is a program, run on base master and on this change:

| position | base | candidate |
| --- | --- | --- |
| D2171's witness, `return n.left = { v: v, left: null }` inside an `if` | loud emit reject | runs `3` |
| the same as the last statement | loud emit reject | runs `3` `3` |
| `return xs[i + 1] = 5`, `return xs[i] = 5` | loud emit reject | runs `5` `5` |
| a `return` of an element write in a `while` loop | loud emit reject | runs `9` `9` |
| `return mk().x = 5`, `mk` counting its calls | loud emit reject | runs `5` `5`, called once |
| `return xs[next()] = 50 + k` | loud emit reject | runs `51`; the index is evaluated first |
| a lambda's `return xs[i] = i * 10`, and its record write | loud emit reject | runs |
| a function-level `const y = xs[i] = 5`, `let y = xs[i] = 4` | loud emit reject | runs |
| an `f64` field, a literal index, `+=`, a `null` right side, a declared record, a nested block, a lambda field write, a bare tail | runs | runs, same output |
| an operand, a call argument, a module-level initializer | loud emit reject | loud emit reject (D16015) |

## Measured

`capability-matrix.vl` over `scripts/capability-probes/matrix/element-write-value.matrix.vl`, base
against candidate: 12 of 50 graded cells run (from 0), 0 silent, 0 runs → not-runs, 0 program
traps. The other 38 are module-scope and operand positions, D16015.


| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | 2 output movers, both `emit_reject` → `runs` (D2171's witness and the new test); 1 bytes-only mover (`field-element-assignment-value.vl`, a `let` of a write now spilled, same output); 0 runs → not-runs; 0 new traps |
| fast set | all green (fixpoint, lint-self clean, regress no runs lost, filed witnesses, late demands, seed size, comment, ladder, sentinel, scan, render-parse and export ratchets) |
