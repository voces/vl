# IR: a `nullty` null test on a callback parameter or a closure `let`, at its held row, 2026-11-24

Lane IR-N6, the class `null test nullty operand` at parameters and closure lets (rowless records,
the queue's ack). #9760 refused a field whose receiver's row no decision named; every remaining
tests/cases function was a callback's parameter over a list built from a rowless literal.

## The mechanism

**The place half at a bound read.** In a baked callback the parameter is already held at its
declared row (`paramHeldTy` reads the clone's scope type, `J`), but its reads are typed at the
element's own `{f: null}`, and `declRowParamVarOf` only answers once a declared-row move raised
`ibDeclRowSeen`, which this route never does. `declRowReadTy` now ends in `boundRowlessReadTy(u)`:

1. `rowlessStoredTy(readTy, readRep, var.vTy)`, the rowless predicate as it stands, for a read typed
   at a record no struct row records (b000418's closure `let`, held at `Circle` with no slot row);
2. else the `let` rule `declRowParamVarOf` already applies: a read typed at a record whose struct
   row (`repRowOfTyStruct`) is not the variable's reads the variable's row. This is the case where
   `{f: null}` has a row of its own (an annotated `(y: { f: null })` or a `[{ f: null }]` list in the
   same program), so the rowless test alone does not reach it.

`rawFieldRepOf` then reads the field at the held row (`i32 | null`), and the receiver read of the
variable takes it as it is (`identRead`: a non-delivery read whose `boundRowlessReadTy` is the
variable's own type returns the variable). A delivery (`show(y)`, `return y`) is unchanged.

**The read-and-drop is a value.** #9760 wrote the dropped operand as a statement before the
expression. Legacy writes it in the test's place, so `{ n: 2, s: [y.f == null] }` is
`i32.const 2; struct.get; drop; i32.const 1`; the statement put the drop before the `2`
(`bytes: return at 0x41 vs 0x20` on `structs/map-callback-record-result-over-built-list.vl`). A
constant sibling is written at its use and never reaches the body, so no `endsInTemp` guard sees
it. The new Rhs `RDeadNullTest { dnV, dnBits }` is the operand, `drop`, then `i32.const dnBits`,
bound to a temp in the test's place; the verifier requires a `bool` destination and uses `dnV`.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master 992d11c7)

READINGS

Witness: `tests/cases/null/nullty-null-test-callback-param-at-stored-row.vl` (an annotated lambda,
a named function, a test after a constant field, a closure `let`); it prints `1 true true 2 0 5`
under both seeds, and the candidate covers all 6 of its functions (base 4). Shadow row
`tests/ir-shadow-rows/nullty-callback-param-row.vl` (base: 1 of 3 covered; candidate: 3 of 3).

Legacy lines deleted: 0. Moved to `@ir`: 0.
