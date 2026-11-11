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

- **Rep is a variant: by design, a position fact.** A record type's rep is `variant` wherever
  the type is an arm of some union. Inventory row D1071 is the shape: `A` is an arm of
  `A | i32` and is also bound as a plain `A`. A literal or read in a struct-typed position is
  stored at the struct row. The same type in a union position is boxed as the arm. The type
  is one, and the positions are two. The syntax side reads the position: the literal's
  context, the read's storage. A typed read needs the rep recorded per position, not per
  type.
- **Rep is a struct, other row: by design until struct rows key by canonical type.** The
  storage was built at a row minted under a declaration's name, or at a literal's `#anon`
  row. The canonical row of its type is a same-shape twin's. This is the class of
  `retStructRowIndex` (`2026-11-10-step7-retkind-family.md`) and `rlElemLitStructRow`
  (`2026-11-11-step7-famb-banked-spellings.md`).
- **The arm answers none (9 programs): by design.** An `ObjLit` or `Member` read whose storage
  holds no struct (`-2`) wins over a struct rep.
- **`OptMember`: a rep read.** Its storage reader (`recvFieldStructRow`) agreed with the rep
  in all 17 programs that reached it with a row. The arm joins the rep arms.
  `recvFieldStructRow` stays, because `Member`'s storage reader calls it.

## Proof

- `regress.vl`: no runs lost. `lint-self`: clean. `ladder-sets`: ok.
- The `sweep` label re-proves the population. Expected movers: none.
