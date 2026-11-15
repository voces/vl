# Relate C2: `validateCompArgCstr` asks through `fitsExpr`; `Refused` is dropped, 2026-11-15

Review medium 3, after C1 (`2026-11-15-relate-c1-quiet-brackets-measured.md`). The bracket in
`validateCompArgCstr` wrapped `litPinAssignable`, which is `assignableExpr(ix, src, dst) ||
joinLitsFitAt(ix, dst)`. It now calls `litPinAssignable(…, ask = true)`. That asks the delivery
through `fitsExpr` and calls `joinLitsFitAt` with no bracket. The two loud callers pass `false`.

## Why the delivery half needs no `Refused`

The refusal arms (the covariant write-through floor, the two-unions floor, the object-shape floor,
the narrowed-list delivery and the undeclared literal field) report a diagnostic and answer true.
Each is guarded by its own `!inferQuiet`. So a quiet ask already answers "fits" and reports nothing,
and that is what `fitsExpr` gives. C1's one changed program was this arm firing on a loud ask.

## Why `joinLitsFitAt` needs no bracket: a path proof

`joinLitsFitAt(ix, dst)` returns early unless `dst` is closed (`!tyHasTyVar`, `!tyHasNullMember`) and
`ix` is an `if` or `match`. It walks the value tails (`tailPushIfArms`, `tailPushMatchArms`,
`tailPushBlockTail` and `stmtAlwaysExits`: reads, plus a push to its local `todo`). It calls
`assignable(litTyOfExpr(strLit), dst)` once per string-literal tail.

`litTyOfExpr` interns a literal type (`mkLitTy`: `T`, `litTyIntern`, `wideLitMinted`). Interning is
mode-independent. In `assignable`, a source that is a `TyLit` or a `TyPrim` never decomposes:

- `assignable` writes only its own guard and memo (`asgSrcStack`/`asgDstStack`, `asgGuardHits`,
  `asgNegHits`, and `asgMemo`, whose put needs a `TyObj` source, so here only the clear runs).
- In `assignableGo`, a `TyLit` source either compares `litRegularTy` (a `TyLit` destination, which may
  intern) or recurses on `litBaseTy(s)`, which is `TY_STR`. A `TyPrim` source reaches the destination
  arms only:
  - `TyErr`/`TyVar`: true.
  - `TyNullable`: `assignableOrOpen(src, inner)`.
  - `TyUnion`: `assignableToSomeMember`, each member with the same source.
  - `TyLit`: false.
  - `TyNeg`: `!assignable(src, neg)`.
  - The nominal test `nomNameOfTy`, which reads.
  - The `TyPrim` structural arm `numWidensName`, which reads.
  The source never becomes a `TyObj`, `TyArray`, `TyMap` or `TyFunc`, so `genericFnAssignable`,
  `substTyDeep`, the hole joins and the alias fill (the paths that kept C1's four brackets) are not on
  this path.
- None of these functions reads `inferQuiet`, `stampsStand()` or `tyMutEpoch`, and none writes
  `holeSol` or a row in place.

So `joinLitsFitAt` behaves the same in both modes, and the bracket around it was inert by
construction.

## `Refused` has no consumer, so it is dropped from the plan

- **The IR (L1):** the IR is only built for programs that check clean, so it never meets a refused
  delivery and needs no `Refused` conversion. A floor that refuses a program the design permits is a
  clause-2 gap, and it is closed in the checker.
- **L2 (lane G):** a scheme's bounds come from the deferred demand rows, and the solver pins the
  scheme's variables at the call, so L2 needs neither refusals nor pins as data.
- **Inside the checker:** the one place a refusal must be seen, `argCstrFitsAt`'s loud re-ask (D5840),
  records the diagnostic, so it stays loud.

The ask-mode hole log is also not built (C1 §3, and lane G confirms).

## Measurements

- `inferQuiet` hidden scopes: 14 → 13. `phase-state-census.vl -- --check` passes.
- Net compiler lines: +1 (12 added, 11 removed). `emit_mono.vl` functions: 908.
- Identity: fixpoint (two refreshes cmp-identical, 6,400,215 bytes).
  `probe-rollback-census.ts --fingerprint` over 20,410 programs (`tests/fixtures`, `tests/cases`, the
  distilled `cells/` and `named/`): the master fixpoint seed and this tree's are identical.
- `rep-fuzz-check.sh`: exact, 0 failures. `fuzz-vl.sh` at seeds 7, 1101 and 4242, 300 cases each: 0
  findings. `GATE_IN_WORKTREE=1 scripts/gate.sh` passes.
