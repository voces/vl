## Codegen, memory & runtime (Track B)

- IR map get (lane COV-CLOS): a `get` on a union of scalar-valued maps, read inside each arm of its receiver's dispatch at the union's boxed nullable, is the probe's own box at the arm's value kind. That is the box plan's `mapScalar`, now derived from the arm's map in the IR (`mapGetAt`), with `boxOp` writing that box as its operand. The two `narrowed-map-union-through-a-call-*` programs' `g` claim; `map get rep` falls from 2 to 0 on the class's programs. D17015 is parked beside the adopted-storage-row family, with why an IR-only build moves its clash.
