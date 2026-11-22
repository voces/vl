# IR: a list read at an open type legacy declares no valtype for reads its declared storage, 2026-11-22

Stacked on #9495 (IR-N5). #9495 reads a `let` list the IR holds closed at its storage only where
legacy writes the open read type's valtype alike (`repStoresAs`). A list of un-annotated functions,
or of lists of them, read in an instance body at the open type its holes leave has no wrapper slot
at that type (`rlSlotOfTyOrTwin` finds none), so legacy declares nothing there: its one storage fact
is the local's declaration, `(local $1 (ref $4))`, read by `local.get`. IR-D1 ruled the design.

## The change

* `undeclaredRepTakes(ty, rep, v)` (ir_verify): an open type whose rep legacy writes no valtype for,
  against a rep it does. Permissive alone; every caller ties it to a declaration.
* `slotDeclStores(ty, rep, vr, slot)` (ir_build) is that tie, the one helper: `undeclaredRepTakes`
  and the slot's declared bytes (`irSlotValtype`) equal the variable's. `storedVarOf`'s no-claim
  list arm and `declVarAt`'s shared slot both call it; the claims arm stays `reflist` and
  `repStoresAs`.
* `buildIndex` takes the stored element where the receiver is the variable `storedReadOf` returns,
  the declared wrapper's array, never by the element type's shape. A nested `w[0][0]` stays a miss.
* No verifier change; return and field admissions are not widened (legacy declares a result there).

## Readings (base #9495's head 9d0a3a27, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| the 47 narrowed-read tests/cases files, covered (= matched, no fail) | 434 | 451 |
| tests/cases armed shadow covered / matched | 68,111 / 68,110 | 68,138 / 68,137 (same single fail row) |
| corpus functions with no blocker | 45,029 | 45,030 |
| self-compile functions with no blocker | 19,761 | 19,761 |

On the 47 files, `narrowed read` 61 → 38, `local slot shared across reps` 5 → 0, `index element
coercion` 1 → 0. Control: no tests/cases program reaches a slot declared at another row; a scratch
seed comparing against the variable's bytes with one byte flipped gives exactly the base's 434 /
61 / 5, so each admission rests on the comparison. Identity (`--names`, mode 3, `--cases`,
claimless, tests/cases A/B): 0 differ. Legacy lines deleted: 0. Moved to `@ir`: 0.
