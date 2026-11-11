# Step 7: the local VKind ladders graded, and `repOfNode`'s two adjustments graded by design, 2026-11-11

This is items 2 and 3 of the orchestrator's step-7 VKind scope, after the descriptor's kind came to
have one derivation (#7211). Base is master `ba8cb279`.

## 1. The local `VKind` declarations

`2026-11-10-step7-vkind-census.md` §1 counted the local `let k: VKind` ladders. `fiLk`, the one of
real size, was deleted in #7156. These are the ones left with a non-array `VKind` type:

| site | what it does | grade |
| --- | --- | --- |
| `emit_sections.vl`: `rrkCode`, `pkc`, `rkc`, `crkCode` | default a nullable `$fnsig`-token or column answer to `i32` before `fbValtype` | not a producer |
| `fn_ret_shadow.vl`: `frcKind` | the recorded-return column, written from a `repOf` read | not a producer |
| `wasmEmit.vl`: `njBlockKind` | a stored block kind, written from `njVKind` over the operands' value-atom codes | a codec; census item 5 owns it |
| `wasmEmit.vl`: `cArgParamKind`, `cRecoverKind`, `cParamSLKind`, `cpKind` | `vtKindOfParam`, a descriptor read | not a producer |
| `wasmEmit.vl`: `kind` in the function-set call | `repSigKindOfTy`, a descriptor read | not a producer |
| `wasmEmit.vl`: two `rk`s | `ifExprRefKindAt` (a memoised descriptor read), and `vtKindOfType` or the `fRetKind` column | not a producer |
| `wasmEmit.vl`: `dk` | decodes a list build code (`LBK_*`) | a codec; census item 5 owns it |
| **`wasmEmit.vl`: `nek`** | a 4-line ladder from a nullable scalar list kind to its element kind | **converted** |
| **`emit_collect.vl`: `rvk`** | a kind from `cloRetValKind` or the call's element primitive, feeding three empty arms | **deleted** |

The two that moved:

- **`nek`** (`emitIndexNulScalarList`) is now `scalarListElemOfListKind(nulListBase(nsk))`, and a
  null answer is an invariant `emitFail`. The old ladder answered `f64` by default. Its input is
  `exprNulScalarListKind`'s answer, which is one of the five distinct-backing nullable lists, and
  `nulstrlist` returns before `nek`. On the other four, the two maps agree by construction.
  - A reach control at the function's entry fires in 0 of the corpus and in 0 of a hand program
    that indexes a narrowed `f64[] | null`, `i64[] | null` and `u8[] | null`.
  - So the path is unreached today: a narrowed read is typed at the non-null list. The hand
    program prints `2.5 3 7` on base and candidate.
- **`rvk`**'s `else` branch in `collectA`'s map-callback arm is deleted. Each of its arms was
  empty, because the f64, i64 and f32 pairs mint on first read. Its readers were
  `cloRetValKind`, a column and descriptor read, and `tyArrayElemPrim`. The latter's import goes
  with it.

So no local ladder produces a kind any more. What is left either defaults a descriptor answer,
reads a column, or is a codec.

## 2. `repOfNode` and `repOfTy`: by design

`repOfNode(n, fn)` is `repOfNodeAt(n, nodeTyAt(n, fn))`. That is `repOfTy` of the node's recorded
type, with two adjustments. Each needs a fact the arena type is designed not to carry.

- **The hole element** (`repOfTyAtNode`). An empty list's recorded type stays `_[]`, on purpose:
  hover and `--json` show the hole. `recordClosedHoles` keeps the element it closed to in a side
  column, `nodeHoleElemOf`. Folding that column into the type would change the node's recorded
  type, which the checker ruled out. The read is the descriptor of the closed list. After #7211
  it is `repOfListOf(h, nul)` over the same tree projections `repOfTy` uses, so it is not a second
  derivation.
- **The union alias** (`repOfNodeAt`). A union whose members have the same shape interns as one
  `TyObj`, because arena identity is structural. The emitter still boxes a declared alias of that
  union, for tag discrimination. Only the node knows it was spelled as the alias
  (`nodeTyIsUnionAlias`). Folding it into the type would undo the arena's canonical collapse. The
  adjustment answers `union` only for a closed node type, since a template's node type is no
  instance's.

Both are node facts, and the classifier-half ruling puts node facts at the node (DECISIONS.md,
"How step 7's classifier half finishes"). `repOfNode` stays a typed read with two node rungs,
each naming the side column or spelling it reads.

## Proof

- **`nek`:** equivalent by construction over its input domain, as above. The reach controls
  fire 0 times. The hand program gives the same output.
- **`rvk`:** a deleted branch whose arms were all empty.
- **Gates:** lint-self + fmt are clean, and the dead-export budget is 0. The distilled
  `regress.vl` loses no runs.
- **The corpus identity** is the CI Sweep job's, in the PR.
