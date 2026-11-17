# Rep ADT stage 3: the hole-row and function-field classes close, 2026-11-17 (lane REP)

The last two kept field-code classes of stage 3, after D16722
(`2026-11-17-rep-adt-stage3-hole-list-store.md`), close without lane SLOT's slot-store stage 3.

Slot-store stage 3 is parked, so the coordinator asked whether the same rule closes the other
two classes on its own. It does.

- **Hole rows (D16720).** Under the shadow, the kept rows stored code 0 at `_` (53 reads), code
  4 at `_` (5) and code 0 at a type variable `F` or `G` (6). A function value there is stored as
  its set id, an `i32`. A field whose code is `i32` or an `i32` list and whose storage type is a
  bare type variable or hole now records that `i32` or `i32[]` (`elabTyVarAtI32`).
- **Function fields (D16721).** The anon minter stores, and `fieldCodeIn` reads, the code a
  function-typed storage type derives, as for any other type.

`fieldCodeIn` keeps no class now: a storage type with no rep fails loudly under the shadow, and
returns the stored code unarmed. `fcKeptHoleRow`, `fcKeptFnRep`, `fcKeptNote` and `fcFuncTy` are
deleted. A scratch control with the hole-row close disabled trips the new failure on
`functions/set-in-record-literal-handed-to-hole-callee.vl`, and the candidate builds it clean.

| reading | value |
|---|---|
| `$VL_REP_SHADOW` over `tests/cases`, `std` and the distilled cells | 0 files with a read whose storage type has no rep, a moved code or a derived-code mismatch |
| corpus identity against the D16722 step | 8,477 modules, 1 DIFFER, 0 LOST |
| the DIFFER, `generics/generic-declared-record-result-function-field-row.vl` | same output; its unused `(struct (field (mut nullref)))`, which the stale `null` code (37) minted, drops (−4 bytes) |
| L2 fuel against the D16722 step, measured alike | 94,148,527,511 → 94,126,518,826 (−22M) |

The 2026-11-16 baseline in D16720 (209 LOST from not minting instance-less rows) measured a
different close and is not needed. With no kept class left, 3e's consumer collapse is unblocked.
