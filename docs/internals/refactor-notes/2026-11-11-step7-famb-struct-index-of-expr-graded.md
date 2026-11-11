# Step 7 slot layer, family B: `structIndexOfExpr`'s syntax side, graded per arm, 2026-11-11

`structIndexOfExpr` (`emit_classify`) answers the struct row a value is built or stored at. It
dispatches on the node's syntax: a literal reads its context, a read reads its storage. Every
other node answers by its rep (`structIndexOfRep`: the row of the value's type when its rep is
a struct). This note asks, per syntax arm, whether the type answers what the arm answers. One
arm, `OptMember`, never differs and becomes a rep read. Base is master `6c985ea7` (#7161).

## Method

The probe compiler was built from base and never refreshed into `build/`. On every call it
compared the dispatched answer with `structIndexOfRep`. On a difference it tagged the arm and
the class:

- **`repneg`**: the rep answers no row, and the arm does. Each such tag also carried the
  node's rep kind.
- **`rows`**: both answer a row, and the rows differ.
- **`fullneg`**: the arm answers none, and the rep answers a row.

Each program reported once, at the end of `emitProgram`, overriding any earlier emit error.
A forced tag at the function's entry fired on a control. The sweep covered 23,900 programs.
Counts are **programs**:

| arm | differs | rep is a variant (`variant`, `nulvariant`) | rep is a struct, other row or none | arm answers none |
| --- | --- | --- | --- | --- |
| `ObjLit` (context row) | 940 | 915 | 21 | 5 |
| `Ident` (storage) | 522 | 244 | 279 | 0 |
| `Call` | 234 | 116 | 118 | 0 |
| `Index` | 175 | 1 | 174 | 0 |
| `Member` | 157 | 91 | 64 | 4 |
| `Paren` | 42 | 32 | 10 | 0 |
| `BinExpr` | 13 | 3 | 10 | 0 |
| `IfStmt` | 4 | 0 | 4 | 0 |
| **`OptMember`** | **0** (17 programs reach it with a row) | 0 | 0 | 0 |

1,706 programs differ at some arm. A program can count under several arms.

## Grading

The two big classes were split further by later probes on master `658a3841` (#7174), over
23,902 programs. Counts are **programs**.

### Rep is a variant (1,192): a coercion fused at the delivery, or a storage fact

| part | programs | what it is |
| --- | --- | --- |
| the node is not an arm value, and it carries a box record (`boxDstTyAt`) | 909 (`ObjLit` 882) | a record built at its struct row, then boxed into the union position it is delivered to |
| the node is not an arm value, and it carries no box record | about 56 (`Ident` 31, `Member` 29, `ObjLit` 23, overlapping) | the type is an arm of some union, but this value sits in a struct position |
| the node is an arm value (`exprVariantIndex` ≥ 0) | about 227 (`Ident` 217, `Call` 116, `Member` 89, overlapping) | a record arm stored at its own struct row (D14655) |

- **909: a fused coercion.** The value is built at its struct row and boxed at its delivery.
  The record the typed read would use is the checker's union-box record for that delivery,
  `boxDstTyAt`, which is step 5's record (`2026-11-07-lowercoerce-scope.md`).
- **About 56: a step-5 gap, a storage fact with no record.** No coercion record exists at these
  nodes. The rep is per type, so a type that is an arm anywhere reps as `variant`, and nothing
  records that this position holds a plain struct. The record that would replace the storage
  reader is a per-position rep: the delivery's destination kind (struct, not box), written
  where the checker types the position.
- **About 227: a storage fact.** The arm's value was stored at its struct row (D14655), which is
  the storage reader's answer. The rep's arm answer is `exprVariantIndex`'s (D34). The record
  that would replace the storage reader is the type the value is stored at: the store column
  the checker writes at the binding, field or element, read as `repOf(storedTy)`.

### Rep is a struct, other row (490): open, converted under family B

| part | programs | what it is |
| --- | --- | --- |
| the row's type is not the value's type | 393 | a build widened by a delivery: D14512's `mk()` is built at `J` while the read is typed `{f: i32}` |
| two `#anon` rows of one type, or an `#anon` row against a spelling row | 90 | one canonical type with two rows |
| two declarations of one type | 27 (14 decl>decl, 13 decl>spell) | an element of `A[]` read at `A`'s row while the type's row is `B`'s; `Member` `R>S`; `Ident` `Pt>Vec` |

This class is open. It is the "one row per canonical type, same-shape rows" item, converted in
the family B series.

**A value's declaration is not its type index.** A declared record keeps its own type index, so
the candidate read the row of the record the index was declared as, before the shape's row
(`nominalStructNameOfTy`, then `structNameOfTy`). The candidate was byte-identical on all 23,902
programs, because the storage readers answer first. But the rep then disagreed with them in
1,786 programs instead of 1,707. Most of the rise is `Ident` reads of a same-type row (54 to 135).
A value of a declared type is often stored at the canonical row. So the declaration has to be
recorded on the value node where the checker resolves it.

- **The arm answers none (9 programs): by design.** An `ObjLit` or `Member` read whose storage
  holds no struct (`-2`) wins over a struct rep.
- **`OptMember`: a rep read.** Its storage reader (`recvFieldStructRow`) agreed with the rep
  in all 17 programs that reached it with a row. The arm joins the rep arms.
  `recvFieldStructRow` stays, because `Member`'s storage reader calls it.

## Proof

- `regress.vl`: no runs lost. `lint-self`: clean. `ladder-sets`: ok.
- The `sweep` label re-proves the population. Expected movers: none.
