# IR: a valued `if` into an element store, and a narrowed nullable list local (2026-11-20)

Two self-compile storage rows, by origin.
- `if into an element store` (13 alone): `xs[i] = if c {a} else {b}`, and its `&&`/`||` spellings.
- `narrowed read`: 18 of its functions read a `T[] | null` local narrowed past its null, as the
  list. The rest read an atom local as its string, left for a design of their own.

## The change
- **Element store.** Legacy writes the receiver and index, the valued `if` in place, then
  `idxStoreTail`'s guard and store. The builder now stages the receiver and index below the `if`
  with `stageLeadArgs`, as calls already do. The store's tail is each staged temp's one consumer.
  `SBoundsCheck` lowers to nothing (`lowerBounds`), and the verifier's use of it is a scope read,
  not a consumption, so rule 8 still pairs the same operands. A valued `if` in the index stays a
  named miss (`ifBelowLeadIn` over the index's own nodes). A boxed `??` in the value stays one too,
  as for calls. A hoisted receiver over a staged lead falls back at the lowering as `staged operand
  skipped` (`irLSkip`), since `idxStoreHoistOf` reads live hoist state.
- **Narrowed nullable list local.** Legacy's list overrides run first and read body-lowering
  state: a union-of-lists arm's unboxed list, and an `is K[]` arm's empty-list shadow. The capture
  stand-in cannot take a `local` read. `identListOverrideOf(e, ix, fnIx)` (wasmEmit) answers
  `luOv`, `fitShadow` or `none`. Both its queries scan their tables and change nothing.
  `emitIdentNode` dispatches on it with `_`-less matches, at legacy's two points. The builder admits
  the read as `RRecover`, and the lowering re-asks the decision and misses as `list override`.

## Measured on fixpoint seeds: merge-base `b0da3ce35` (#9285) against this branch

| | merge-base | this branch |
|---|---|---|
| self-compile `blockers if into an element store` (alone) | 13 | 0 |
| self-compile `blockers narrowed read` (alone) | 30 | 12 |
| self-compile functions claimed | 18,730 | 18,762 |
| distilled functions claimed (`--claims`) | 41,591 | 41,591 |
| self-compile lowering misses `list override` / `staged operand skipped` | — | 0 / 0 |

- **What is left of `narrowed read`:** the atom locals read at a string, plain and `K | null`. A
  `list override` miss is defensive today. Every override witness the builder reaches stops first
  at an `is` rung (`is rung`, `is storage rung`), so the miss has no reachable witness yet.
- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,532 identical, 0 differ.
- **`tests/cases` A/B, master seed against this seed, no shadow:** 7,252 identical, 0 differ. This
  covers `emitIdentNode` dispatching on `identListOverrideOf`.
- **Mode 3:** 0 differ, and the self-compile identical.
- **L2 fuel**, same box: 104,106,214,956 → 104,103,103,234 (−0.003%).
- **Witnesses:** `tests/cases/arrays/element-store-of-a-valued-if.vl` covers `i32`, `f64`, `string`,
  `boolean`, a record and packed `u8`, each × `if`, `&&` and `||`. It gives the same output under
  the master seed, this seed and claim-all mode 3. `tests/cases/narrowing/nullable-list-local-narrowed-reads.vl`
  covers `!= null` and `is T[]`, read indexed, by `.length` and walked.
