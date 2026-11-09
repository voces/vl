# Step 7: a ref-list row minted after the type indices takes its pair at mint time

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints (two builds byte-identical). The
population is the sweep's 23,756 programs. The probes were built one level off the candidate.

## What moved

`mAssignRefListTwins` and `mAssignRefListPairs` loop over per-row functions now:

* `rlTwinRepOf` finds the twin by signature. It records the signature in `rlTwinSig`.
* `rlPairMint` mints the pair, or reuses the twin's pair.
* `rlInnerListHeap` fills a nested scalar list's element heap.

At its end, `mAssignTypeIndices` installs `rlPairsLate` behind the `rlLateRows` hook in
`emit_state.vl`. The hook reuses the `(i32) => i32` function-value signature, so the
self-compile gets no new signature. `rlMvTablesReset` removes the hook.

`rlInternNameTy` calls the hook once its outermost mint returns, so nested rows resolve in row
order. A late row takes its twin, its pair and its element heap at once. A closure element
reads `cloStructIdx`, and a typed-map element reads `mvMapTypeIdx`. Either one fails loudly when
that struct was not minted with the pairs. Before this change, a late row kept heap 0.

## Probes

* **A: late rows today.** `emitFail("PROBE …")` fired on each row the hook resolved. It fired
  0 times over the population, so the path is dormant on today's tree. That is why the sweep is
  identical.
* **B: collectA#2's walk skipped.** This is A's control and the map for the next step. The
  union re-mark and the field tables were kept. 18,670 programs are unchanged and 190 are
  bytes-only. 4,858 lose `runs`: 4,736 to an emit reject and 122 to a compiler trap. By message:

| programs | reader floor |
| ---: | --- |
| 1,668 | `ref array literal but ref list type not collected` (`emitArrRef`) |
| 1,620 | `ref valtype with no interned shape` |
| 894 | `unsupported map value type (no rep for a union-member struct, …)` |
| 341 | `a ref list's element row does not resolve` |
| 101 | the emitted module fails validation (93 in top-level code, 8 in a function) |
| 50 / 44 | `ref index access …` / `` `.length` receiver's ref-list element … `` |
| 140 | other messages |

The walk is still the only minter for those rows, and their readers refuse rather than mint.
The 101 validation failures and the 122 traps come from readers that do not floor. They build
the module anyway and are caught downstream. Those readers have to mint first, before any of
the walk's arms can go.

## What stands

* No row moved to its reader in this PR. With the pairs late-mintable, a row can mint at its
  first reader. `emitArrRef` is the largest floor, and it could mint the literal's rows itself
  by calling the walk's arm (`collectAArrayLit`). The frame layout pass reads those rows before
  the bodies do (D1786), so the move has to mint at whichever pass reads first.
* A late typed-map element needs its mv slot's map struct minted late too. The map-value
  slots still mint only before `mAssignMapValueStructs`.
* `collectAUnionRows` stays, for #6950's reason: it mints 52 batch rows the registration-time
  call keys differently.
