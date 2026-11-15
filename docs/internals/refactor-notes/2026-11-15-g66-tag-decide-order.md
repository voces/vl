# D16381: a call through a set checks a later un-annotated member before asking its result, 2026-11-15

Lane G, from lane S's trace.

With its functions declared last, `let f = inc0; if c { f = half }; print(f(3))` traps. The
set `{inc0, half}` returns `i32` and `f64`, so it needs the tag (dispatch by member). That
tag is decided by `fnTagDecide` from the calls `holeSetCallRetOf` notes with their results'
split. With `inc0` declared after the call, its body is not checked when the call is, so
`setMemberRetAt` answers -1 and the call is not noted. The set stays untagged and the call
lowers at one signature.

## Ablation

- Only the slot's INITIAL member need be late: `half` last runs, `inc0` last traps.
- The write need not be conditional. The results must differ. A `const` value-`if` and the
  same code inside a function body run.
- A probe build showed the first member's result is -1 with the functions last, and `i32`
  and `f64` with them first.

## Change (`check_relate_core`, net compiler lines +14; pin-helper delta 0)

- `setMemberInfer`: when a member's result is -1 and the member is an un-annotated top-level
  function pass 2 has not reached (`nodeTyOf(d) < 0`), its body is checked now, as a forward
  direct call checks its callee (`checkerForceFn`), and the result is asked again.
- Scoped to un-annotated members (`directHoleDecl`) whose result is -1. Forcing a generic member
  (`id`, `id2`) out of order made `hole-fn-generic-map-stored-through-parameter.vl`,
  declarations last, an invalid module in the first version.
- Lane S's suggestion, recomputing the split at decide time, was tried first. It tags the set,
  but the call's node type is by then the hole's `i32` default, which other check-time
  consumers have already read, so retyping it there would be unsound.

## Grading

`--before` master `5683d3b2`.

- D16381 prints `1.5`. All 13 of lane S's cells run with their functions last.
- `scripts/decl-order-ab.vl`: 313 of 5133 cases moved, 39 to a clause-1 outcome, before. 168
  and 17 after, with no new clause-1 mover. The baseline is rewritten.
  - The 22 closed include D16301's first witness. D16301 takes a remaining mover as its witness.
  - The one case outside the baseline, on both seeds, is D16209's fixture, filed as D16369.
- 298 function-set templates, as written: 0 runs→not-runs, 0 new silent.
- `regress.vl`: 0 runs→not-runs. 12 `dord*` named cells move from a trap or an invalid module
  to runs, and their baseline lines are rewritten.
- `check-filed-witnesses --strict`: 5062 graded, all as filed.
- The D16360–D16369 reservation is released, since every id is filed.
