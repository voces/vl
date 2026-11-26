# Layout family stage 2b: a row storing an open function field as a closure builds at its rep (2026-11-26, lane COV-START)

D17131, D17361 and D17362 were each scheduled as stage 2b's record → record read conversion
(irConvert case (e)). Measured, none of them is a conversion.

## What the witnesses are

D17131's `mk` copies `const v = { r: { f: inc0 }, s: { f: dbl } }` into `let m`, reassigns
`m = { r: { f: dbl }, s: { f: dbl } }` under an `if`, and returns `m`. Legacy lays the record out
at one struct (`$0`):
- `r` targets a row that stores `f` as the tagged set's i32 id (`i32.const 13`);
- `s` targets a row that stores `f` as a closure.

`m` and `v` are held at that row's rep (type 362). The reassigned literal's storage row records
the same type, but `rowTyBuildsAt` answered no for it. That test accepts a type open only in
function fields the row stores as a tagged id. `s.f` is open in its set too, yet the row stores it
as a closure, which is also what the type's rep says. So the literal stayed at its own rep (365),
and its field `r` met the row's `r` at another record: `object field coercion`.

## The mechanism

`openFieldStoredAsIds` now accepts both open function fields:
- a field whose rep is the set's i32 id, where the row stores the id (as before);
- a field whose rep is a closure, where the row stores a closure.

The second reads `structRowFnSlotLayout` (emit_shape_rows.vl), the field-code accessor stage 1
set aside for its first caller. It answers 1 for a closure slot, 0 for a tagged id and -1
otherwise. Its variant twin waits for a caller.

## Tried and dropped

- **The nested literal built at the outer field's rep.** It moved the miss inward to `f`: the
  outer kid holds a closure where the inner row holds the id.
- **A row type rebuilt from its target rows (`mkObjTy`).** Row 4's recorded type already names
  row 0's type for `r`. The rep was not the problem; the delivery was.
- **A `let` held at its slot's row.** The locals were already there (rep 5).

irConvert case (e), the field-wise copy only where legacy records `recCopy` (pinned with COV-CALL),
has no witness among these rows. `records/let-copy-of-fn-record-b4-closure.vl` now misses
`convert record -> record`, case (e)'s own miss, and goes with it.

## Measured

Master's seed (`origin/master` at this branch's base) against this tree's.
- **Per program:** only gains, nothing newly missed.
  - Each `object field coercion` row is gone (8 rows over 6 programs, D17131's let-copy family):
    - `records/let-copy-of-fn-record-a-minimal.vl`, `-b3-hop2.vl`, `-d-let-src.vl`;
    - `records/let-copy-of-fn-record-through-identity-call.vl` (2);
    - `records/let-copy-chain-past-sixteen-fn-field-write.vl` (2);
    - `records/let-copy-of-fn-record-b4-closure.vl`, which moves to `convert record -> record`.
  - `closures/heap-value-field-r.vl` and `-s.vl`: `convert record -> record` gone.
  - `closures/record-pushed-onto-literal-records-of-wider-set-beside-returned-list.vl`: start covered.

  Each newly built program is claimed (`$VL_IR_REQUIRE_CLAIM=1` exits 0) and prints what master
  prints.
- **D17131, D17361, D17362:** claimed on the head (exit 0, print `6`); master exits 1.
- **Sweep:** `tests/cases/records/fn-record-rows-tagged-and-closure-fields-positions.vl`. The
  witness read off the call, as another literal's field, and through a value `if`. Master exits 1
  (`blockers object field coercion`); the head exits 0, is clean under shadow-4, and prints the same.
- **Not covered:** the same maker's results in a list literal (`[mk(0), mk(1)]`) miss
  `array element coercion` in start on master, on stage 2a's branch and here. That is a follow-up.
