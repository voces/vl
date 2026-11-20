# IR coverage: an atom cell read at a string (2026-11-20, lane IR4)

A `narrowed read` miss covers several shapes. One of them is a local whose cell holds a
literal-union atom's id while the checker types the read at a string rep. That happens in two
ways:

- **A D1752 binding:** `let k = lopK`, typed `string`, whose cell is the atom (`letBindIsAtom`).
- **A narrowing to one member:** after `if mode != "row" { return … }`, `mode` reads at the
  literal `"row"`, whose rep is `str`.

At #9285's head, the self-compile had 12 such rows among its 16 `narrowed read` rows: 10 atom and
2 `K | null`. STORE's census handed them to this lane.

**Root cause.** The checker types an atom cell's read at a string. The real fix is in D1752's
typing. This change makes the IR meet legacy where legacy stands.

## What changed

- **The read takes the cell's rep only when a delivery seats it.** `irBExpr` is now
  `exprAt(b, ix, false)`. `deliver` calls `exprAt(b, ix, true)`, and that flag reaches
  `narrowedLocalRead` through a `Paren`. There, an atom cell read at a string (`atomAtStr`) returns
  the variable at its own rep. The delivery's atom arm (`atomToStr`, factored out of `widenTo`)
  then either decodes it into a `str` or `string | null`, or the id passes as it is to an atom
  destination. That is the decision each legacy position makes: `emitAtomToStr` at a string
  position, the raw id at a `K` one.
- **A `let` legacy holds as the atom needs an atom rep (`atom cell local rep`).** `irBDeclVar`
  misses when `letBindIsAtom` holds but the binding's type gives a non-atom rep. An example is
  `const c = m`, where `m` is narrowed to one member. The new matrix's `fn_body_capture` cell
  found this: with the read decoded, the IR stored a string into a slot legacy keeps as an i32,
  which is invalid wasm. Before this change the read missed, so the gap was latent. The guard only
  adds misses, and no corpus file's covered count falls.

## The invariant, and why it is safe (IR-REV conditions)

**A read's operand rep is its cell's. For an atom cell the checker types at a string, that differs
from the node's `primRepOf`.** It is safe because the operand cannot leave a delivery at the
wrong rep:

- **The only consumer is `widenTo`.** The only caller passing `cell = true` is `deliver`, whose
  value goes to `widenTo`. That function either decodes (`RAtomStr`, whose verifier rule requires
  an atom `sxV`) or returns the operand unchanged.
- **Every `deliver` caller compares the result's rep with its destination** and misses on
  disagreement: object field, declaration and if arm, argument, push operand, array element,
  coalesce default, tag dispatch arm, assignment, global store, element store, declaration,
  return, tail and global initializer coercion. So does `buildStrBin`'s `deliverStr` part
  (`string operand coercion`).
- **The verifier reads `opRep(operand)` throughout and `primRepOf` nowhere.** Its only node-type
  read is `RGetField`'s destination.
- **Some rules check no operand rep:**
  - `RPrint`;
  - `RCallHost`;
  - the map keys and values of `RMapSet`, `RMapHas` and `RMapGetOr`;
  - `RCellNew`, `RToBox`, `RCast`, `RTest`;
  - `RAtomEq`, `RUnionEq`, `RListEq`;
  - `RMakeClo`'s environment;
  - `SDrop`.

  None of them can receive the cell operand, because none takes a delivery's result unchecked.
  Every other read path calls `exprAt(…, false)`, so it still misses `narrowed read`. The
  matrices' `print` cells show this.

**Tables keyed by the read node.** The cell read writes none of them:

- **`irReadVar`** is not noted, so a hoisted receiver read of the cell misses (`hoisted receiver
  read`) rather than reloading the id as a string.
- **`irReadAgain` and `irReadField`** are global and field reads only.
- **`irSpansAt`** is statement-level.
- **`ibDeclVar`** is keyed by declaration and now carries the guard above.
- **`irNodeAt`** maps an IR id to its AST node, the other direction.

The decode's `RAtomStr.sxAt` is the read node, so its plan is `atomStrPlanOf(ix, fnIx, false)`.
That is the call legacy's `emitAtomToStr(ix)` makes, and `ix == coerceHeld` cannot hold for a
local read under a delivery.

## Grading

Fixpoint seeds at merge-base b0da3ce35 (#9285 merged) against the head.

| | base | head |
|---|---|---|
| self covered = matched | 18,831 | 18,841 |
| self `narrowed read` | 31 | 21 |
| corpus covered / matched | 95,250 / 95,236 | 95,256 / 95,242 |
| corpus `narrowed read` | 361 | 354 |
| corpus `atom cell local rep` | — | 7 |

The verifier-fail and claimable-unmatched rows are the same 15 on both sides.

Matrices (runs both / covered base → head):

| template | runs | covered | note |
|---|---|---|---|
| `atom-cell-narrowed-to-one-literal-at-atom` | 62/62 | 65 → 71 | positions into `K` pass the id |
| `atom-cell-narrowed-to-one-literal-at-string` | 62/62 | 65 → 72 | positions into `string` decode |
| `atom-nullable-cell-narrowed-at-nullable-string` | 62/62 | 75 → 75 | a `K \| null` narrowed past one member reads at the nullable, not this shape |
| `atom-in-string-concat`, `atom-in-mixed-string-eq`, `atom-nullable-in-mixed-string-eq` | 64/64 | unchanged | #9285's |

- **No cell moves runs → not-runs, silent, trap or wrong value.**
- **The `fn_body_capture` un-annotated cell** is the guard's witness. It moves to `atom cell local
  rep`, which is 8 functions in each new template.
- **The `print` position** stays `narrowed read`, because `print` takes no delivery.
- **The `+` part with a one-member narrowing** misses `string atom part route`: the node type says
  `str` while `exprIsLitAtom` says atom.

| bar | result |
|---|---|
| `ir-identity --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity --cases` | identical 7,530, differ 0; witnesses 59/59 |
| master-vs-head tests/cases A/B | 7,598 programs, 7,530 built, differ 0 |
| mode 3 | identical; 18,825 claimed (master 18,812) |
| L2 fuel, candidate vs master fixpoint | +0.027% (104,109,417,040 → 104,126,203,715) |
| phase state | ok: the cell read is `exprAt`'s parameter, not a global |
| plumb-shape cost, `gate.sh --fast` | ok / passed |
