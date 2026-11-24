# The record-parameter argument decline is lifted (2026-11-24, lane IR-N5)

`2026-11-24-ir-union-if-record-join.md` declined a union-typed value `if` joined at a record's row
when passed straight to a record parameter (`argument union if at a record (D17115)`): legacy wrote
it as the union box there and the module failed to validate. #9878 closed D17115 on legacy's side
(`emitDirectArgUnbox` skips the unbox for such an argument), so legacy now writes the record join,
the bytes the IR builds through `deliver`. The decline is removed; nothing replaces it.

New test coverage: `unions/record-join-unboxes-narrowed-arm-in-each-position.vl` regains the record
parameter (`pParam`) and nested call (`pNested`) positions; `unions/value-if-narrowed-arm-into-record-param.vl`
(#9878's witness) is fully claimed.
