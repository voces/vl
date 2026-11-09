# Step 7: a held node's rows mint at its first read (2026-11-09)

Base: master `ce2bd63b` (#7019). Both seeds are fixpoints (two self-compiles, byte-identical).

## What changed

* **`collectUnionAndHeldRows` no longer walks the held nodes.** It used to call `collectAHeldRep`
  on every node the checker stamped with a held rep (`fnTagHeldNodes`, in ascending node order),
  right after arming the mint hooks. Now `collectAHeldRep` is a hook (`heldRepMintOn`), memoised
  per node, and runs on the node's first read. `fnTagHeldNodes` has no caller and is deleted.
* **The read is `heldRepOf`** (`emit_state.vl`). Every emitter reader of the stamp goes through
  it: `arrLitRowTyIn`, `exprStoredRepTy`, the `let` list-row read, `heldListElemTy`,
  `arrLitListBuild`, `elabArgHeldRep`, and mono's held-map pin. A node with no stamp mints
  nothing. The question readers (`rlSlotOfTy`, `repSlotOfKind`) are unchanged.
* **The first readers that reach a held node before any of those:**
  * the trees an emission mints first (`arrLitMintTrees`: function entry, module start);
  * the pre-index walk (`preIndexMintAt`), ahead of a call's or a test's mint;
  * a returned binding read by name (`frsMintRetLits` asks the declaration of a returned `Ident`),
    before `frsRecordedRetCore` reads the result's token.
* **A held node mints the held nodes under it first** (`heldRepMintUnder`), then the literals it
  is built from. This is the order the eager walk had, because an inner node has the lower index.

## Why each reader was needed

The bare deletion lost 7 oracle cases. The wider readers were found one at a time:

| step | oracle cases lost |
| --- | --- |
| loop deleted, nothing else | 7 |
| + `heldRepOf` at the stamp's emitter readers | 7 |
| + `arrLitMintTrees` asks each node it walks | 4 |
| + a returned binding read by name | 1 |
| + the pre-index walk asks each node it walks | 1 |
| + nested held nodes mint inner first | **0** |

* **The global section's cell slot.** In `map-of-records-beside-list-of-same-record.vl`,
  `letCellSlot` for `const mv = m["k"]` asks for the record row of `m`'s held map value. The
  global section reads it, and no stamp reader comes before. A probe seed that trapped at the
  floor named `fbValtypeNullable ← emitGlobalSection`. Module-start minting covers it.
* **The return column.** `deliver0() { const u = [[inc0]]; return u }` read its result's row in
  `buildFnMap#2`, before any body. The returned value is the identifier, not the literal.
* **Twin order.** `const rss = [[{ fs: [inc0] }]]` before `const lists = [[{ fs: [[inc0]] }]]`
  built two ref-lists of `{fs: i32[]}` and none of `{fs: i32[][]}`. With `lists` first, it ran.
  A probe seed showed the outer held node minting its literals, then reaching an inner held node
  through that walk. The inner node's rows came second and keyed to the wrong record. Minting
  the nodes under it first restores the eager walk's order.

## Measured

Seed: master `ce2bd63b` 6,596,079 → 6,596,189 (+110).

* Oracle (`cases_wasm_*`): 7,387 passed, 0 failed.
* Distilled corpus: 0 classes moved, no runs lost.
* Filed witnesses (`--strict`, both inventories): 4,679 as filed, 0 moved.
* rep-fuzz exact. Late demands 6 (baseline 6). Render-parse 42 / 82 (baseline or below).
* plumb-shape cost ok (fuel and the binaryen facts; CPU and RSS not graded on this box).
