# START-2: push and the element store convert through `irConvertStored` (2026-11-26)

The split with COV-CALL: COV-CALL's slice 2 (#10315) added `irConvertStored`, the converter into a
cell, and moved the field store onto it. This PR moves push (`pushRhs`, `pushLateRhs`) and the
element store onto it. Each hands a value whose rep is not the element's to `irConvertStored`, in
place of push's holed-closure retag and the element store's `retagsAsStands`. `irConvertStored`
retags a value it takes as it stands where `convertRetag` admits it; that case was START-2's
finding, and COV-CALL added it in slice 2.

Graded on master 4cafb529 against this branch, both with probe-patched compilers:

| class | master | branch | where they went |
|---|---:|---:|---|
| push operand coercion | 5 | 0 | `hole-fn-map-value-join-pushed-inline`, D15942 fully claimed; 3 `convert closure -> closure` (COV-CALL's) |
| store operand coercion | 4 | 0 | `captured-cell-hole-lambda-seed-in-generic-body`, `hole-fn-generic-pushed-list-spread` fully claimed; 2 `parameter rep unsup` |

`ir-parity --run-all --behaviour-only`: byte-identical on all 16 programs of regeneration 9's three
store classes and on the sweep, which misses `store operand coercion` on master. The field store's
2 `field store receiver rep` rows (the receiver's row, not the value) are START-2's next.
