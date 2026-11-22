# IR: a variant record returned at its nominal struct twin (2026-11-22, lane IR-N2)

`return coercion`, record to record: the family #9460's note parked, which reproduced only with
`std:fs` beside `std:buffer`. It covers 14 functions over the census files: `i32view`/`f32view`
in std:buffer, the std fs cells, and `modules/overload-head-classes`.

The mechanism, without std. A record shape that is also a union arm (`Buf` in `writeFile`'s
`u8[] | Buf`) makes an object literal of that shape build at the arm's variant rep. The literal is
returned at a nominal twin (`I32View = new { base: i32, length: i32 }`), whose rep is the plain
struct's. Legacy writes `struct.new $0` and returns it: both rows are one heap, and
`emitReturnPlainValue` converts nothing.

## The change

- `recRetag` (`ir.vl`): a variant record rep and a plain struct rep with the same fields. The
  verifier's `RRetag` rule accepts such a pair, beside `listRetag` and `listRetagHole`.
- The return builder retags a built record into the result where `recRetag` holds and
  `exprPrePathWhy` records no coercion at the value. This is the gate #9472's list retags read.

Covered = matched over the census files: 1003 → 1017. Their legacy bytes are identical.

Row file `tests/ir-shadow-rows/record-returned-at-nominal-twin.vl`; witness
`tests/cases/records/literal-returned-at-nominal-twin-of-a-union-arm.vl`.
