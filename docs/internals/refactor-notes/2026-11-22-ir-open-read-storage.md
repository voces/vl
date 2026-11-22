# IR: an open-typed read of a binding held closed reads its storage, 2026-11-22

The continuation of #9458's rule (IR-D1), as the coordinator ruled. `cellTakesClosure` holds an
open hole-lambda `let` in legacy's closed closure cell, but reads and destinations stayed keyed at
the open type, so the `narrowed read` row, plus the return, object field, index element and local
slot coercions behind it, refused the program. Reads and destinations now agree in one place.

## The change

* `exprTyOf` types an open-typed read of such a binding at the variable's type (`storedVarOf`). A
  closure binding qualifies only when legacy's `letBindRep` says `closure`. A list binding
  qualifies only when legacy says `reflist`, or, with no claim, when the local slot's declared
  valtype (`irSlotValtype`, from `fbLocalRun`) is the list's.
* `repStoresAs(dst, src)` (ir_verify, shared by builder and verifier) is a valtype identity: both
  reps write the same `fbValtype` bytes, with a closure only while `closureHeld` and a list only
  with a wrapper slot (`rlSlotOfTyOrTwin`, `rlWrapIdx`). `openRepTakes` admits it only at an open
  destination type: return, object field, index element and a shared local slot.
* A list of hole functions gets no wrapper slot from its open element type, so those reads stay
  named misses rather than a shape rule.

## Readings (fixpoint seeds on both sides)

Against master 102aa9a17, after merging it:

| reading | base | this change |
| --- | ---: | ---: |
| the 47 tests/cases files carrying the rows, covered (= matched, no fail) | 406 | 434 |
| tests/cases armed shadow covered / matched | 67,830 / 67,829 | 67,874 / 67,873 (same single fail row) |

Against the branch point a00578d1f, before the merge:

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 44,857 | 44,884 |
| corpus `return coercion` | 38 | 12 |
| corpus `object field coercion` | 3 | 2 |
| self-compile functions with no blocker | 19,716 | 19,716 |

The return admission composes with #9472's list retag: the retag temp is built first, and a value
still at another rep is taken only where `openRepTakes` holds. Identity (`--names`, mode 3,
`--cases`, claimless): 0 differ. Late demands 9 = baseline, late tag rows 307 = baseline. L2 fuel
+0.09% on the base. Legacy lines deleted: 0. Moved to `@ir`: 0.
