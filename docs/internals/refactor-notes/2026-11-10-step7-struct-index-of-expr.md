# Step 7: `structIndexOfExpr` reads a read's storage row, else its rep's struct row, 2026-11-10

Group 7 of `2026-11-09-step7-classifiers-remaining.md`, under the ruling in DECISIONS.md §"How step
7's classifier half finishes": a read's row is the emitter's own storage, and every other node's is
its rep's. Base is master `775f38bf` (#7064), fixpoint seed 6,602,130 bytes. Counts are post-mono
calls over the 23,836-program sweep population (`classifier-census.vl --keep`).

## Shadows

A scratch compiler ran the classifier beside a twin and tagged each call with the class, the node
kind and both answers.

**Twin 1, the rep alone:** `repStructRowOfTy(nonNullTy(ty))`, where `ty` is a read's `rrStoreTy`,
else the node's stamped rep type, else its own type, gated on the rep kind being `struct` or
`nulstruct` and declining where `exprVariantIndex >= 0`.

| class | calls |
| --- | --- |
| same | 1,168,526 |
| layout twin | 9,067 |
| declined, both -1 | 17,670 |
| declined, the classifier names a row | 7,517 |
| only the classifier names a row | 10,404 |
| different rows, not twins | 4,126 |
| only the twin names a row | 86 |

The classifier-only and different rows are the "built wider" family
(`nested-record-built-wider-beside-own-binding-runs.vl`, `d15221_nestb_dbl.vl`): a value stored at
a wider row than its type. The storage type the read rep carries is still the narrow type, so the
rep cannot name the row. The cell, field code, list row and return descriptor the value is
written with do.

**Twin 2, storage first:** each read asks its storage. A name asks its parameter, declared local,
global cell, capture slot, or its own frame binding's cell (`letCellSlot`). A field asks the
receiver's struct field or variant field. An element asks the list's element row or the map read's
mv slot. A call asks the callee's return descriptor or its signature's result slot. When the
storage names no row, the rep answers as in twin 1.

| class | calls |
| --- | --- |
| same | 1,197,397 |
| layout twin | 745 |
| only the classifier names a row | 6,178 (Index 5,188, Call 921) |
| only the twin names a row | 113 |
| different rows | 0 |

The 6,178 are union-arm records stored by a call or as a list element (`[variant Circle / Circle]
Index`). Their rep is the variant, while the call or element stores the arm at its own struct row
(D14655). `exprStruct` already says so for a call.

## Graded at the consumers

Each candidate's whole sweep population, against the base seed (`sweep.vl diff`):

| candidate | same | output movers | `runs → not-runs` | new traps |
| --- | --- | --- | --- | --- |
| twin 2 as the classifier | 23,795 | 41 | 39 | 17 |
| + `??` joins its operands' storage, `if` its join's row, a callee returning an arm with no row (D8341) | 23,815 | 21 | 19 | 1 |
| + a call or element of a record arm names the arm's row, a boxed read its own type's | 23,835 | 1 | 0 | 1 |
| + a receiver row that stores the field as no struct answers -1, not the rep (D14162) | **23,836** | 0 | 0 | 0 |

The shipped classifier is the last row. Every program compiles to the same module bytes.

## Switched

`structIndexOfExpr` is one exhaustive `match`. `ObjLit`, `Paren`, `IfStmt` and an assignment
cell keep their arms. `BinExpr`, `Ident`, `Member`, `OptMember`, `Index` and `Call` ask a storage
reader. A reader returns a row, -1 for no answer, or -2 for storage that holds no struct.
Every other node answers by its rep (`structIndexOfRep`). The probe is removed and the name goes
to `NOT_BLIND`.

`structIndexOfIdentStore` and `structIndexOfCallStore` join `STORAGE_READERS`. The first reads the
slot a name's cell is declared at, and the second reads the callee's return descriptor or
signature slot.

Deleted: the four `structIndexOf*Expr` arm functions, the name rungs (`structIndexByName` of an
element name, `structRowOfNameOrTy`, `structIndexOfLet` for a module-block binding, the call
fallbacks over `nodeTyCanonObjName`, `recRowOfTy` and `nodeNulStructInnerName`), `asNulStructRow`,
`asTrapStructRow`'s use here, and the dead `nodeTyCanonObjName`, `asNulStructRow`, `recRowOfTy`
and `sigDeclRecSlotOfTy`.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `775f38bf` | 19 | 5,161,421 (`structIndexOfExpr` 1,221,630) |
| this PR on `775f38bf` | 18 | 4,024,626 |
| master `797c12b5` (#7067) | 18 | 3,905,183 (`structIndexOfExpr` 1,188,071) |
| this PR merged with `797c12b5` | 17 | 2,801,945 |

On `775f38bf` the remaining classifiers rise by 84,835 calls between them. The storage readers
ask `refListSlotOfExpr` (+35,826), `refListKeptSlotOfExpr` (+9,884) and `mapReadMvSlot`
(+38,843) first. `refListElemNameOfExprRaw` falls from 7,281 to 3.

## Leads for the queue

* **`letCellSlot`**, shadowed per arm against `repSlotOfKind(k, letBindTy)`: the rep-claims arm
  answers 202,386 calls, 202,214 the same and 136 at a layout twin. The blind arms are the struct arm (`structIndexOfLet`, 18
  calls, 1 different) and the variant arm (1 call). The one difference is
  `fresh-literal-at-generic-delivered-wider-runs.vl` (group 9). The holder (149), map (132),
  reflist (53) and rep-claims (36) differences are rep records the emitter keeps.
* **`captureValStructIdx`** delegates to the captured binding's cell slot (`letCellSlot`), a loop
  variable's reader or a parameter's annotation slot. It is a storage reader like
  `capturedStructIndex`.

## Proof

| check | base | this branch |
| --- | --- | --- |
| fixpoint seed | 6,602,130 | 6,601,445 (−685) |
| sweep, 23,836 programs | | 23,836 same bytes |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `seed-size.vl --check` | | +0.2% of baseline |
| `late-demands.vl --check` | 6 | 6 |
| `check-filed-witnesses.vl --strict`, both inventories | | 4,686 graded, 4,686 as filed |
| `cases_wasm` shards 0–3 | | 7,402 passed, 0 failed |
| inventory refs/rows, `vl_cls_census`, `vl_scaling_shape` | | 99 passed |
| `lint-self.sh` | | clean |
| merged with master `797c12b5`: fixpoint seed | 6,601,425 | 6,600,742 (−683) |
| merged: sweep, 23,837 programs | | 23,837 same bytes |
