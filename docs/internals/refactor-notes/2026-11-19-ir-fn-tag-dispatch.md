# IR: a call through a tagged function set, and its open locals and parameters, 2026-11-19

Steps 2 and 3 of the `pre-path` family's function-tag half, after the tag leaf
(`2026-11-19-ir-fn-tag-leaf.md`). They ship together: the dispatch alone moved its 88 functions to
`open temp type` and unblocked none, because the value a set's call passes around is typed at a
generic's still-open parameter.

## The change

- **Shared tails** (`wasmEmit.vl`), spent by `emitFnTagDispatch` and the IR lowering alike:
  `tagStashTail` (the set id into `fnTagIdSlot`), `tagIsTail` (`local.get`, `i32.const`,
  `i32.eq`), and the decisions `tagDispatchTy`, `tagDispatchArms`, `tagDispatchIds`,
  `tagArmStaged`.
- **IR rows:** `RTagStash` (an effect) and `RTagIs` (a `bool` temp). The builder (`tagDispatch`)
  stashes the callee, then builds a valued-`if` chain, innermost first, with each arm delivered at
  the call's rep. A lambda arm (legacy stages its instance) and a result outside
  `i32`/`i64`/`f32`/`f64`/`str` stay named misses.
- **Open types:** `irTyHeldOpen(ty, rep)` (`ir_verify.vl`) is the one rule-1 test the builder and
  the verifier read. A type that is still open is held only when it is a function type and its rep
  is `i32`, a set's id. Closure reps stay STORE's, as agreed (`fnTagSetIsTagged` decides).
  `heldTy` closes a type at the instance first (`instTyOrSelf`).
- **Two legacy decisions the shadow surfaced, each now one read on both sides:**
  - `dispatchDeclinesTail()`: legacy disarms its tail-call cursor after a dispatch when it is true,
    and the builder marks a one-arm dispatch's call temp `irNoTail` when it is true, so a return of
    it stays `call; return` on both.
  - `tagDispatchIfOf(ty)`: the arm `if`'s block type for a dispatch's result type. Legacy's writer
    opens each arm through it (`tagDispatchOpenIf`), and the IR's valued `if` opens a string out,
    which only a dispatch makes, through it.

Compiler lines on top of the tag leaf: +248 −34, 214 net (`ir_build.vl` +121, `wasmEmit.vl` +38,
`ir_lower.vl` +26, `ir_verify.vl` +18, `ir.vl` +10, `lint.vl` +1).

## Readings

| reading | tag leaf (#9148) | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 32,152 | 33,708 (+1,556) |
| corpus covered = verified = matched (shadow) | 32,152 | 33,708 (73.8%) |

Remaining in the family: `open local type` 56, `open temp type` 27, `open parameter type` 11,
`tag dispatch after an operand` 6, `tag dispatch lambda arm` 3, `tag dispatch result` 3, and pairs,
led by `assignment target + open local type` (112).
