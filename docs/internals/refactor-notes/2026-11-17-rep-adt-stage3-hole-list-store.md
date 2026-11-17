# Rep ADT stage 3: every kept field-code class closes, and three measured declines, 2026-11-17 (lane REP)

## D16722 closes

Stage 3e's consumers wait on three kept classes whose stored field code their rep does not give
([3e's note](2026-11-16-rep-adt-stage3e-sweep.md)). This closes the one this lane owns.

A record field `{ f: if c { [] } else { null } }` stored code 18 (`FC_NUL_I32_LIST`) at storage
type `_[] | null`, a list whose element is absent. `repOfTy` has no rep for that, so `fieldCodeIn`
kept the stored code (`fcKeptHoleList`). Both row writers (the anonymous-literal minter and
`pushFieldRow`, struct and arm columns) now record, for a field whose code is an `i32` list
(`FC_I32_LIST`, `FC_NUL_I32_LIST`), the `i32[]` its code stores, nullable as the checked type is
(`elabHoleListAtI32`, emit_elab.vl, beside #8811's `elabHoleContainerClosed`). The rep derives
code 18 from it. `fcKeptHoleList` and `fcListTy` are deleted, so a hole list the close misses now
fails loudly under the shadow.

| reading | value |
|---|---|
| `$VL_REP_SHADOW` over every `tests/cases` and `std` module | 0 files with a kept-holeList, unnamed-kept or moved read (was 2 files, 346 reads) |
| corpus identity against master's compiler | 8,477 modules, 1 DIFFER, 0 LOST |
| the one DIFFER, `objects/empty-list-join-null-declared-twin.vl` | same output; the type section's two one-field/two-field `i32` struct pairs now share one supertype (+1 byte) |
| L2 fuel, master against this change, measured alike | 94,146,023,759 → 94,148,527,511 (+2.5M) |

## D16720 and D16721 close too, without slot-store stage 3

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

## Declined: a closedness memo for `tyHasInferHole`

From an instrumented L1, counting master's L2 self-compile: 361,446 calls over 14,921 types (24
per type), but over 224,469 distinct (type, `tyMutEpoch`) pairs (1.6 per pair). The epoch moves
on every in-place type write during check, so an epoch-stamped memo hits about 38% of calls,
worth about 0.2%. A looser stamp is unsound: the return-inference fixpoint reset writes a type
back to holes in place, so a "no hole" answer does not survive it. `tyHasTyVar` already keeps its
free answers per `tyMutEpoch` (`tyHasTyVarFreeEpoch`).

## Declined: a memo for `readRepOf`

`readRepOf` (2.39% of L2 inclusive) is memoised already, per read and asking function within a
generation, and the memo works. Its 1.14M calls, by branch:

| branch | calls | distinct (read, fn) |
|---|---:|---:|
| memo hit | 941,799 | 109,661 |
| memo miss | 161,164 | 157,253 |
| call result (bypasses the memo) | 33,915 | 17,880 |
| storage read (bypasses the memo) | 2,631 | 2,631 |

The misses are first asks, so the cost is `readRepGo`'s work, not repetition. The "6x" quoted in
round 1 (`2026-11-16-same-variant-and-rep-of-ty-memos.md`) was calls over distinct keys, not a
missed memo.

## Measured: the IR stack's self-compile creep is source growth

`ir-m1-coalesce-plan` read +0.22% L2 fuel against its merge-base (`854e949d9`, one fixed seed).
Cross-building each L1 compiler on each source splits it:

| L1 compiler × source compiled | L2 fuel | against base × base |
|---|---:|---:|
| base × base | 95,184,302,617 | |
| base × branch | 95,392,732,386 | +208.4M (compiling the added source) |
| branch × base | 95,189,333,140 | +5.0M (the compiler's own behaviour) |
| branch × branch | 95,397,762,359 | +213.5M |

No IR build or verify shows on an unarmed compile, and `coalArmOf`'s `exprIsNulNone` is the same
question legacy asked (its total is 0.43% → 0.45%). The creep is about 0.34M fuel per net added
line while legacy and IR code coexist, and falls as legacy arms are deleted.
