# L2: a built-in method on an un-annotated parameter answers its member demand, 2026-11-16

Closes [D16882](../inventory/D16882.md), filed while sizing the closure-receiver family
(`2026-11-16-l2-closure-receiver.md`). Stacked on that PR.

## What refused it

A member call on an un-annotated parameter with no candidate in scope records a row demand
(`{slice: _}`). `holeDemandOk` (check_demands) checks it at the pin as a field. `string` and a
list carry no field `slice`, so `take("hello")` was refused, though the built-in answers the call.
The demand filter already dropped a member the argument answers with a type-bound `self`-function.

## The change

`shapeLessTypeBound` becomes `shapeLessMethodAnswered`. It also drops a demanded member when
`memberRungOnTy(at, f)` is `MC_RUNG_BUILTIN` and the demand is a call or not yet typed
(`builtinAnswersCall`). A field demand (a value read) is still asked as a field. The instance's
re-check then asks the built-in's arity and argument types, as the direct spelling does.

## Measured

Against #8815's seed, then re-checked after merging #8815 and master:
- **`check-filed-witnesses --strict`:** 5,397 graded. Only D15155 and D15157 move, on both seeds
  alike (owned by lanes WIDTH and SOUND).
- **Fingerprint, one worktree:** 2 of 20,848 move: the two new cases.
- **Case suites:** 8,137 pass. `regress.vl`: 0 / 0, no movement.
- **Probes by hand:** mixed string/list instances in both orders print `2 2`. A record field of the
  same name still calls the field. A value read, wrong arity and wrong argument types are refused
  with the direct spelling's sentence. The `<T>` spelling still refuses through the type-parameter
  bound path; that is outside this row.
