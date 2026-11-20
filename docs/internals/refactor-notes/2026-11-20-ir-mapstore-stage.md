# IR coverage step: a map store's receiver and key staged below a short-circuit value, 2026-11-20

Lane F2, to IR-REV's design check (part C of the short-circuit operand family). Measured on fixpoint
seeds of this branch and of its merge base, master `d37f9c1c2`, each building this branch's source.

## Why this class

`map store short-circuit operand` was the sole blocker of 15 self-compile functions and one of two
in 2 more. A labelled probe split the 17 by receiver: 12 global, 5 local or parameter; every map
non-nullable, every key a variable or a temp, every value a valued `if`. Legacy and the IR's
lowering both write, on the stack: the receiver read, `mapRecvRefTail`, the key, `mapRecvKeyTail`,
the value, then `mapSetTail`. There is no `recvRef` slot, so part B's stage node does not apply;
this is part A's shape (`stageLeadArgs`).

## What landed

- `mapSetStageLeads`: when the value holds a valued `if`, the receiver and key are staged as temps
  at their own starts. A variable becomes an `RStage` temp; a temp already sits below.
- A global receiver has no operand, so it is staged as the same `RGlobalGet` temp an identifier read
  builds, at the map store's own recovery (`globalReadRecovers`). The `RMapSet` keeps `msSym` and
  carries that temp in `msLoc`.
- Lowering: for `msSym >= 0` with a temp `msLoc`, the store checks the temp's definition is that
  global's read at the same recovery, else misses. This couples the store to its operand's
  producer, deliberately. A staged temp's definition is read directly, since `tempRhs` hides a
  value already on the stack. The plain-global class refusal is unchanged.
- Verifier: that staged temp is used, at the global's rep.
- `mapRecvKeyTail` now runs after the value's `if`. It writes no bytes and `mapSetTail` re-pins
  `cmSlot`; witnesses with an inner map op of the same and of another shape cover it.
- Named misses: a nullable map receiver (its `ref.as_non_null` would land above the `if`), a boxed
  `??`, a string-literal key (`stageLeadArgs` stages no `OStr`), and a reassigned receiver. The
  nullable guard asks the same `exprNullableMap` the receiver tail asks, so it passes exactly where
  the tail writes nothing; no matrix spelling reached it.

## Coverage and readings

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions covered | 18,890 | 18,905 (+15) |
| corpus functions matched | 41,774 | 41,774 |

Mode 3 byte-identical; identity 9,037 cells identical, 0 differ, self-compile identical; cases 7,533
identical, 0 differ; witnesses 59 same; cases A/B 7,247 same, 0 differ. Late demands 9 (baseline 9),
late tag rows 307 (baseline 307), seed +0.4% on baseline.

L2 fuel: this branch 104,502,957,141 against master's 104,470,857,133, +32M (+0.03%). This branch's
seed compiling master's source reads 104,461,767,755, 9M under master's own seed.

Matrix: global, local, parameter and field receivers × `&&`, `||`, `??`, an inner map op of the same
shape and one of another shape × a variable, a call-result and a literal key, plus a nullable field
(61 cells). All 61 print the same output under both seeds, and each builds byte-identical under
claim-all; 0 runs → not-runs, 0 silent, 0 fail rows. 32 cells are newly matched; the `??` cells miss
as a boxed coalesce and the literal-key cells as `map store short-circuit operand`.

Witness: `vl_ir_shadow_test` "a map store of a short-circuit value stages its receiver and key below
the if".
