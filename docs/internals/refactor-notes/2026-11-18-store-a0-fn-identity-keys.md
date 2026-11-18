# A0 keys a hole handed a function value by that value's identity, 2026-11-18 (lane STORE)

Before B3 resumed, the A0 shadow (`$VL_INST_KEYS`) was crossed with the late rows: 329 of the 373
sat in programs with `open.outer-hole` keys, 220 in programs with no other open class. The class
was mostly not nested instances. A top-level `lap((a) => a + 1)` binds `lap`'s hole, in the check's
row, to the lambda's open arrow type `(_) => _`; the row counted as relative, had no enclosing
instance, and was never keyed. The elaboration binds the same hole to that open type carrying the
lambda's identity set, which `elabKeyStrFor` spells `Fn#d`.

The check's decision does not read these keys: it reads per-(source call, function set) arrow facts,
where a function value is already its set (`fnTagSetOfTy`). So the gap was the shadow's naming,
and closing it is a measurement fix, the precondition every B3 stage is graded on.

## Change

`check_inst_keys.vl` binds each hole its call hands a function value at that value's identity set,
through `elab_fn_id.idSetOf` and `elabFnSetTyMint` (the elaboration's own constructor), and counts a
function type carrying its set as closed, as `elabKeyStrFor` keys it.

## Measured (the 211 programs holding the 373 late rows, master `53ff806b`)

| | before | after |
|---|---:|---:|
| equal | 843 | 1,311 |
| elab-only | 1,392 | 924 |
| open.outer-hole | 803 | 246 |
| open.arrow-args | 311 | 245 |
| open.arrow-shape | 19 | 32 |
| check-only | 8 | 32 |

The new check-only keys are real disagreements the old naming hid: in the slot-written programs
(`closures/list-of-hole-param-slot-written-*`) the elaboration binds a hole to the join of the sets
written into one slot (`?take.0=Fn#6#13#20`), the check to each call's own argument (`Fn#6`). That
is B3.4's written-join family. Codegen does not change: the shadow runs only under `$VL_INST_KEYS`.
