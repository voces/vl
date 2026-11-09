# Step 7: collectA's TypeRef arm off the walk, readers minting by type

Measured 2026-11-09 on a 4-core box, each session against a master fixpoint and over the sweep's
~23,780 programs. Sessions one to three were handoffs; the fourth closed the last losses.

## The experiment

E1 is pure mint-on-read. `collectA`'s arena loop keeps only the held-rep arm. A `TypeRef` mints
once through `nodeMintOnRead` (`collectATypeRef`), and `annRefArrSlot` mints its node before it
reads. Each later step keeps the one before it.

| step | runs lost | new traps | seed |
| --- | --- | --- | --- |
| E1 pure mint-on-read | 231 | 103 | 6,584,097 |
| E2 + a late map value slot mints its map struct (`mvMapsLate`) | 96 | 31 | 6,584,335 |
| E3 + `listBuildOfTy` mints its element's row; a shape-spelled record literal mints its declared twin's row first | 68 | 41 | 6,584,684 |
| E4 + a type that may hold a function is not minted (lane w220's rows) | 77 | 32 | 6,584,697 |
| E5 + `repSlotOfKind`'s ref-list arm mints on a miss | 83 | 64 | 6,584,876 |
| **E6** = E4, with the guard narrowed to records and lists holding a function | **59** | **32** | 6,584,709 |

E5 is reverted: it cleared two refusal classes and added 36 invalid-wasm losses (D15164,
`d15116_*`). A slot read that asks a question cannot also mint.

## What each mechanism bought

* **`mvMapsLate`** (−135 runs). `mAssignMapValueStructs` now does its work through
  `mvMapsLate(n)`. A map value slot minted after the type indices gets its map struct at mint
  time. The trigger is the `mvLateSlots` hook, fired from `mvShapeOf…` and from the end of
  `rlInternNameTy` at depth 0. `rlPairsLate` asks for the struct before it refuses. This fixed both
  `a late map list row has no value map struct` (67 → 4) and the 71 top-level invalid-wasm
  programs (D1009 is one: `const m: {[string]: J} = Map()`). It is the mechanism the map rungs
  need, and it stands on its own.
* **`rlRowMint`** (hook, `rlRowOfTyMinted`): the row of a closed element type, minted on a miss.
  It is used only where a row is *demanded*: by `listBuildOfTy` and by the literal's twin.
  * A shape-spelled record mints its declared twin's row (`rlDeclTwinTy`), which it shares.
  * A record or list that holds a function is skipped, because its function-value sets decide
    its row (lane w220's). Without that skip, 10 fn-value record lists failed (D15555, D15558,
    D15561, D15562). Skipping a bare function element too re-broke `(() => void)[]` globals
    (D1044: `std:test`'s `vltBodies`).

## Second session (same day): 59 → 29

Base: master merged at `b861eb49`, fixpoint 6,584,352 bytes. Fixpoint candidates, 23,782 programs.

| step | runs lost | new traps | seed |
| --- | --- | --- | --- |
| E6 rebuilt on the merge | 59 | 32 | 6,584,954 |
| E7 + an un-annotated `Map()` mints its value slot at its value type (`armTy`), not `-1` | 40 | 25 | 6,584,981 |
| E8 + `mvMapsLate` waits for a slot whose columns are still being pushed | 29 | 13 | 6,584,957 (+605) |

* **E7 closed all 12 `d223e*`.** The note's ablation was wrong: annotation-first fails too
  (`const c: {[string]: Circle[]} = Map()` before the literal). The `Map()` node's mint
  (`mvShapeOfMapNodeTy`) passed `armTy = -1`, so its slot disagreed with the one the annotation
  would mint. A literal-side twin mint (`arrLitDeclRecTy`) was tried, bought nothing, and is not kept.
* **E8:** `rlInternNameTy` fires `mvLateSlots` at depth 0 while `mvShapeOfValNameArmTyGo` has
  pushed `mvValName` but not `mvMapTypeIdx`. E7's seed trapped there compiling `scripts/sweep.vl`.
  The loop is now bounded by `mvMapTypeIdx.length`, the last column pushed.

## Third session: 29 → 9
Base: master `de73ab0c` at fixpoint (6,584,405 bytes); candidate +879; 23,783 programs.

* For-in var over a list at an arm's shape: the kind is `variant`, the slot names none, so the
  row is asked by type (`repSlotOfKind`) on a name miss (9 cells).
* `rlPairsLate` refused map struct type 0, which is a real index (4 cells).
* A binding's annotation mints on its slot read (`letAnnMint`); a signature's in
  `preIndexMintTrees`; a `nulmap` recorded result, like `map`, needs no token. That fixed D3059,
  D2698, D956 and the rec-group count.

## Fourth session: 9 → 0
Base: master `6d4b3006` at fixpoint (6,584,516 bytes); candidate fixpoint 6,585,858 (+1,342);
23,787 programs: 0 runs lost, 0 new traps, D13940/D2273/D4712 gain `runs`, 1,002 bytes-only.

* **The 8 function-value cells were ordering; the E4 skip is not on their path and stands.**
  Mono pins a hole function's local (`let u: ((i32)=>i32)[]`), and the return-column reader
  (`recordedVoidFns#2`) read the recorded `((_)=>_)[]` before anything minted that annotation, so
  the result lowered as `i32`. `criRetBindAnnMint` mints each returned binding's annotation first.
* **An empty literal mints no row** (`listBuildOfTyHeld`). `[]` delivered to a binding whose
  rows are a wider record's (D15236) read `{f: i32}[]` from its type and its destination, and
  minted a second list of `J` beside the binding's. Reading without minting falls to the cell's row.
* **Bytes-only:** a seeded sample of 30 of the 1,002 is a pure type-index permutation.
