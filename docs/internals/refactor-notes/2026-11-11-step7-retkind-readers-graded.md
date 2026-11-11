# Step 7: the return-kind readers and `buildFnMap`, graded; two ruling paragraphs, 2026-11-11

Closing census 3 (`2026-11-11-step7-closing-census-3.md`) left four items with no owner. This note
grades A3 (the return-kind family's 4 readers) and D3 (`buildFnMap`). It also writes the
paragraphs D7b and D7c ask a ruling on, and answers C3's request for a source for D12465's
"65 cells". Base is master `f63c5c6d`.

## A3: the four readers

| reader | what it reads | grade |
| --- | --- | --- |
| `retStructRowIndex` | an annotation's struct row: the declaration's name, then the recorded type's rows | two recomputations now read the stored column (below); the name rung is w324's floor |
| `retVoidAnnFlag` | whether the annotation's recorded type is `void` or `never` | done: a recorded-type read. Its 2026-11-10 shadow disagreed in 0 programs (`2026-11-10-step7-retkind-family.md`) |
| `retValueExitCount` | how many arms a returned if-expression has | not a rep reader: an arm count is syntax, and no type carries it |
| `retMapInFlight` | whether a map factory's shape is already being resolved up the stack | not a rep reader: a re-entry guard over `retMapFlight` |

**`retStructRowIndex`: what this PR changes.**

- **The change:** the annotated functype arm (`emit_sections.vl`) and `cloRetValSlot`'s declared
  record rung (`emit_classify.vl`) each called `retStructRowIndex(fnRet)` again. Both now read
  `fRetStructIdx`, the row `buildFnMap` stored for that annotation.
- **The probe:** each site compared the stored row with the recomputation. A control build fires
  at both sites on two hand programs, an annotated record result called directly and one taken as
  a value. The probe build disagrees in **0 programs** over the 23,923-program sweep population.
- **What stays:** the remaining callers are the writer itself (`buildFnMapRowOfRetAnn`), two
  parameter-annotation arms in `emit_sig_tokens.vl`, `annValtypeSlotOf`, and the functype arm
  for a non-record result. Its name rung is a floor that w324 named: in 109 programs the
  declaration's row is not the type's canonical row, mostly the newtype brands `I32View` and
  `F32View` (`2026-11-11-step7-famb-struct-name-producers-graded.md`). It goes when struct rows
  key by `(type, declaration)`.

## D3: `buildFnMap`

The pass does two things:

- **It builds the function table:** `fnIndexBySid` (12 live grep hits) and `nestedNameBySid`
  (16), a symbol → `fnStmts` position index. That is a table of functions, not a type fact.
- **It caches per-function rep columns.** `fRetKind`, `fRetStructIdx`, `fRetRListRow` and the
  others read the declared type's rep (`vtKindOfType`, `repSlotOfKind`), or the recorded result
  for an un-annotated function. The one rung that is not a type read is `retStructRowIndex`'s
  name rung, the floor above.

Deleting the pass would mean moving the function table into `collectFns` and computing the
columns on first read. That is a pass-structure change, not a type question. **Proposed: rule
the pass by design, as the function table and its per-function column cache.** Its last
non-type rung goes with the `(type, declaration)` row keys.

## D7b: `repOfNode`

`repOfNode(n, fn)` is `repOfNodeAt(n, nodeTyAt(n, fn))`, and none of its rungs reads syntax.
Each reads a checker fact recorded at the node:

- `nodeTyAt` is the node's type at the instance `fn`.
- `repOfTyAtNode` reads `nodeHoleElemOf(n)`, the element an empty-list hole closed to. The
  checker records that per node and deliberately keeps it out of the node's type, so hover and
  `--json` still show `_[]` (`check_side_rows.vl`).
- The union recovery asks whether the node's own closed type is a value union box
  (`nodeTyIsUnionAlias`, a read of `nodeTyIxOf`). A template's instance type cannot name the box.

**Proposed: by design.** The function is a typed read keyed by node, because two of the facts it
needs live only at the node: the hole's closed element, and the node's own type beside the
instance's. It is not a second producer beside `repOfTy`; it calls `repOfTy` once those two
facts are applied. It would become a twin only if the checker wrote the closed hole into the
type, and that is ruled against so hover keeps showing the hole.

## D7c: `njKindOfExpr`

`njKindOfExpr(ix)` is `njKindOfTy(nodeTyIxOf(ix))`, with an invariant `emitFail` when the operand
has no numeric recorded type. It has no rung of its own. It reads the operand's recorded type
once, and the checker types every scalar operand of a numeric-union operator as a number.
**Proposed: by design**, as a typed read named for its input, or inline its three callers.
Neither changes a byte.

## C3: D12465's "65 cells"

The figure has no source that can be checked.

- It first appears in architecture-target's step-7 Closes line, in #5030 (`ed020109`,
  2026-10-27). In this clone's history that commit imports the whole tree, so nothing earlier
  shows where the number came from.
- The D12465 row does not say it.
- No coordinate file under `scripts/silent-sweep/census/` names D12465.
- The one committed "65 cells" near the topic is D224's grid (`scripts/silent-sweep/d224/`): the
  cells the arm rung's lift moved on `474b6a1b`, an earlier family.

**Proposed: withdraw the number from the Closes line.** The same-shape rows' live measure is
Family B's own (w319, w324).

## Proof

Gates and the local sweep are in the PR.
