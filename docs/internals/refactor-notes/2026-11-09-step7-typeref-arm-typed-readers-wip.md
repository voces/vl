# Step 7 (WIP): collectA's TypeRef arm off the walk, readers minting by type

Measured 2026-11-09 on a 4-core box. Base is master `50fe2c5c` built to a fixpoint (seed
6,584,107 bytes). Each candidate is a two-level build off that base. The population is the sweep's
23,780 programs. This branch is a handoff, not a PR: it still loses runs, and its seed is larger.

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

E5 is reverted. The broad mint did clear the `ref array literal but ref list type not collected`
and `ref valtype with no interned shape` classes. It also added 36 check-clean invalid-wasm losses
(D15164, `d15116_*`). That repeats the refused "`rlSlotOfTy` mints on a miss": a slot read that
asks a question cannot also mint.

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

What stands at E8:

* **13 invalid wasm** (`D2698`, `D956`, `D9716`, `D9764`, `d15207`/`d15293`/`d15294`, five
  `tests/cases/closures|maps|functions`). Most hold function values (lane w220's rows). Not ablated.
* **9 `ref valtype with no interned shape`** (`a040320`/`536`/`752` and six cases). Minimal witness:
  `type Circle = { r: string }`, `type Shape = Circle | Sq`, `function sink(_x: Circle[]) {}`
  (never called), `mkcall()` returning `[{ r: "seven" }]`, `for zz in mkcall() {}`. The refusal is a
  LOCAL's valtype (`fbLocalRun`), not the signature. The literal's row is fine (slot 0, shared by
  `{r: string}` and its twin `Circle`). The loop variable's struct row is what is missing.
* **4 `a late map list row has no value map struct`**: `const r: {[string]: T}[] = [Map()]` in a
  generic instance at `T = string`. At the refusal, slot 0 has been processed (`mvTwin[0] = 0`)
  and `mvMapTypeIdx[0]` is 0. The non-late pass takes `mvMapTypeIdx[mmv]` with no `> 0` test.
* 1 each: D3059's covariant delivery, an uninterned fn-value signature, a rec-group count.

## Not done

Step 2 (delete collectA#2), step 3 (`collectAFieldTables`, by-name sites onto `identDeclOf`),
the gates, rep-fuzz and RSS. A PR needs a seed at or below master's, so it can land only once the
arm is deleted with 0 losses. E8 is +605 bytes with the walk gone.
