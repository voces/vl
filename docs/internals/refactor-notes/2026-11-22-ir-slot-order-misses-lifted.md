# IR: the slot-order misses lifted (2026-11-22, lane IR-N2)

Follows #9599, where legacy now takes `sharedFieldRecvSlot` after writing the operand it stashes.
Two IR misses existed only because legacy declared that slot first:

- `print union of a fused map read` (#9581). A union `print` of a fused `??` map read, such as
  the chained `p.a[x] ?? p.a[y] ?? lit` corpus grid.
- `coalesce nulRef join past the optional chains` (#9517). A join reached past an optional chain
  whose result a shared field read stashes, as `d15241_param_J.vl` does.

Both refusals and their scan (`fusedBoxReadFrom`) are deleted, and each now builds as it stands.

Row file `tests/ir-shadow-rows/print-and-shared-read-of-an-in-place-coalesce.vl`; witness
`tests/cases/unions/print-and-shared-read-of-an-in-place-coalesce.vl`.
