# Step 7: the VKind producers outside the descriptor, each a descriptor read, kind algebra or a ruled rung, 2026-11-11

This covers the nine producers `2026-11-11-step7-closing-census-2.md` ("VKind derived from the rep
descriptor") lists outside the descriptor with no lane:

- the six "descriptor read + own rungs";
- three of the "own ladders".

It stacks on #7211, for `repOfListOf`. Base is master `6138cd39`.

## What changed

| producer | was | now |
| --- | --- | --- |
| `mvValRepKindOfTy` | a 7-arm ladder from `repOfTy`'s kind to its non-null twin | `vkNonNullTwin(repOfTy(ty).rdKind)` |
| `ifExprRefKindOf` | a `nulstr` → `str` rung, then `vkNonNullRefTwin` | `vkNonNullTwin` of the join's rep, then its storage rung (below) |
| `fnSigKindOfTy` | a tagged set answered the literal `"i32"` | the descriptor of the declared type `t` when `t` is tagged, else of the type it closes to |
| `nulNoneReadCellKind` | a read naming no cell answered the literal `"nulnone"` | that read's own `repOfNode` kind, with an invariant `emitFail` if uncovered |
| `forInWalkKind` | a map walk mapped the key code to a list kind inline | `mapKeyListKind(tyMapKeyKind(t))`, a named codec |

- **`vkNonNullTwin`** is new kind algebra: the non-null twin of a nullable ref or string niche,
  else the kind itself. It moves to `emit_list_rep.vl` with `vkNonNullRefTwin`, so both
  `emit_classify.vl` and `emit_shape_rows.vl` can read it without an import cycle.
- **`mapKeyListKind`** is a codec over the `MAP_KEY_*` key code, not kind algebra. A map's key
  storage is decided by its key code, and a string-literal key is stored as a string, while that
  key type's own rep is the atom list. So a descriptor read of the key type would answer wrongly.

## Why each is equivalent

- **`mvValRepKindOfTy`, `ifExprRefKindOf`, `forInWalkKind`:** by construction. `vkNonNullTwin`
  is the old ladders' mapping on every input kind. `mapKeyListKind` is the old inline mapping.
- **`fnSigKindOfTy`:** a probe at the tagged rung found the instance's closed type reps as
  `closure` in 140 cells. So the rung was load-bearing: the tag decision lives on the declared
  type, and its closed instance does not carry it. A second probe found `repOfTy(t)` is `i32` for
  every tagged `t`: 0 cells differ.
- **`nulNoneReadCellKind`:** the default is reached in 64 cells, which is the reach control. In
  every one the read's own rep is covered and `nulnone`; the probe finds 0 that differ.

## The rungs that stand, and the instrument

`vkind-census.vl` now takes a `RULED` table. A producer whose kind literal is a node or storage
rung, or an uncovered default, that a ruling keeps is filed as "ruled rung or default". The
table names the reason:

| producer | rung | reason |
| --- | --- | --- |
| `letCellKindGo` | `holderRecordSigs` → `struct` | the bundle layout (DECISIONS.md, step 7 VKind by design) |
| `ifExprRefKindAt` | an `ObjLit` arm → `struct` | builds at its context's row (same ruling) |
| `ifExprRefKindOf` | a variant with no row → `struct` | a storage fact (D4644): no variant row, so the arm builds a record |
| `tyListRepKind` | the caller's row → `reflist` | a storage fact |
| `vtKindOfType`, `vtKindOfParam` | `?? "i32"` | the uncovered annotation's default (closing census 2) |
| `captureValKind` | `"i32"` | a capture with no `Param` or `let` binding has no kind. Its no-binding default is reached in 13 cells; its loop-variable and pair defaults are never reached. |

The orchestrator ruled `ifExprRefKindOf`'s and `tyListRepKind`'s rows BY DESIGN under
DECISIONS.md's classifier-half ruling: a reader of the emitter's own storage is not step-7 debt.

`vl run scripts/vkind-census.vl` after this change reads 76 functions:

| family | n |
| --- | --- |
| descriptor read | 11 |
| descriptor build | 8 |
| kind algebra | 10 |
| stored column | 9 |
| forward | 23 |
| ruled rung or default | 7 |
| codec | 5 |
| rendered name | 2 |
| own ladder | 1 |

Outside the descriptor that leaves only codecs and w314's rendered names:

- the codecs: `listRepOfFieldCode` and `fieldCodeVKind` (w314), `pushDestVKind` (w309),
  `listKindElemKind`, and the new `mapKeyListKind`;
- the rendered-name pair `scalarListRepOfName` and `nulScalarListKind`, whose only callers are
  codecs;
- `fieldCodeCellKind`, the one own ladder, a field-code reader that w314 owns.

## Proof

- **The two probes:** as above, each validated by a control that fires. They are built by the
  candidate seed into scratch and swept over all 23,909 programs.
- **Gates:** each exits 0.
  - refresh, lint-self + fmt (including the kind-ladder budget) and `ladder-sets`;
  - rep-fuzz: exact;
  - the dead-export and render-parse budgets; seed-size is +0.4%;
  - probe-rollback, and `cases_wasm`: 7,440 passed, 0 failed;
  - distilled `regress.vl`: no runs lost.
- **The corpus identity** is the CI Sweep job's, in the PR.
