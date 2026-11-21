# IR: a module global's storage rep and binding rep, design note (D14426 family 2), 2026-11-21

Lane IR-N4. The coordinator ruled that the `global initializer coercion` and `global read coercion`
census gets a design note for its binding-vs-storage family. The narrowed reads, family 1, shipped
as plain deliveries in #9402 and #9411. **It builds nothing.** The coordinator ruled option 1 on 2026-11-21 (§Ruling).

## Two types for one global

A module global has two types that can disagree:

- **Storage, `letBindTy(d, -1)` (emit_classify.vl).** The annotation, else the record, union arm
  or list the un-annotated binding is stored as (`letHeldTyOf`), else its scope type. Legacy's
  cell (`letCellSlot`) is laid out from this column: the binding storage column, D14434's
  `bcRep`/`bcSlot`. The initializer is built at it.
- **Binding, `scopeTyAt(d, -1)`.** The checker's type for the name, which every read node is
  typed at.

The IR takes one rep per global (`globalRep`), from the binding type. Where storage and binding
name the same kind at different rows, the initializer misses with `global initializer coercion`,
because the built value is the storage row. A read whose node the checker typed at the storage row
misses with `global read coercion`.

## The family, measured

The census used a scratch-only diagnostic seed, whose miss names carry the cell kind, the cell
rep, the built or read rep, and whether `letBindTy`'s rep equals the cell's. It ran over the 401
`tests/cases` files that hit either class. The worktree and seed were untouched. Family 2 is
the rows where the storage rep is the built or read rep and not the cell's:

| row | functions |
| --- | ---: |
| initializer, `reflist` cell: list built at the storage row | 40 |
| initializer, `struct` cell: record built at the storage row | 36 |
| initializer, `Map()`: the constructor's map is not the cell's map | 24 |
| read, `map` cell: read at the storage map | 13 |
| read, `reflist` cell: read at the storage list | 3 |
| **total** | **116** (57 files) |

## The single-source experiment

The experiment, not committed: `globalRep`, `mapGlobalOf`, `mapNewInit`, `cloInit`,
`globalInitValue`/`Variant` and the unbox read all took `letBindTy` in place of `scopeTyAt`. It
was built on #9411's head, with fixpoint seeds on both sides, and screened over the same 401
files:

| reading | binding rep (today) | storage rep |
| --- | ---: | ---: |
| covered = matched | 4,046 | 4,043 |
| start covered = matched | 193 | 200 |
| start `global initializer coercion` | 81 | 19 |
| start `global read coercion` | 19 | 53 |
| `global read coercion` (other functions) | 66 | 74 |
| mismatches | 0 | 0 |

The storage rep repairs the initializer and breaks the reads. A second diagnostic, on the
experiment, names what the reads then miss. The rows the storage rep introduces are the ones
whose read node the checker typed at the binding:

| read row under the storage rep | functions |
| --- | ---: |
| `reflist`: cell stored list ≠ the read's binding list | 43 |
| `struct`: cell stored record ≠ the read's binding record | 14 |

The other rows (`closure` 32, `i32` holding a function id read as a closure 36, `union` box →
record 12, …) are the same under either source. They are other families, not this one.

## So neither type alone is the rep

Legacy writes neither the initializer nor the read with a conversion: the start body's plain arm
is `emitExpr` then `global.set`, and the read is `emitUserGlobalGet`. The cell holds the storage
row and each read reads it as it is, so whatever consumes the read takes the storage row (that
consumers are written from the storage layout is implied by the module validating, not read
off each consumer here). The IR's one-rep-per-global therefore cannot match legacy from either
side:

- at the binding rep, the initializer's value is "the wrong rep";
- at the storage rep, every read whose node the checker typed at the binding is.

This is D14426's own diagnosis applied to globals: type and rep are separate facts within one
binding.

## Options for a ruling

1. **Storage rep for the cell, and the read's rep from legacy's rep carrier, not its type.** The
   global's IR rep is `letBindTy`'s, because the cell is that row. A read of it takes its rep from
   the carrier legacy reads at that node (`repOfNode` / the call-bind adopt rows c-2 records),
   which names the storage row where the checker's type names the binding. This is the shape
   D14426 closed with for parameters: "the parameter's pin is its rep; a `let` or `return`
   copying it takes that rep." It needs the read's consumers to accept the storage row, which they
   already do in legacy.

   **Cost:** a rep-carrier lookup at each global read, and the IR's node reps are no longer
   `repNodeOfTy(nodeTy)` for these reads.

   **Risk:** a carrier that is missing for some read spelling. Grade it with a position matrix
   over read sites.
2. **A rep pair on the global (`irGlobalNote` with storage and binding), with an explicit
   retag-free view at each read.** The verifier accepts a read at the binding rep of a
   storage-rep global only when the two reps are the same kind and legacy's row decision names
   the storage. This is closer to today's code, but it adds a second rep channel. The rubric
   would read that as a parallel predicate unless the "same row" test is legacy's own
   (`letCellSlot`).
3. **Leave the family to the elaboration**, so the checker types un-annotated globals' reads at
   their storage row. That is outside the IR lanes, and D14434's refutation pin (19 runs lost when
   a global takes the local's rung) says the producers do not agree today.

**IR-N4's recommendation is option 1.** It is the only option that adds no second rep channel,
and it is the shape D14426 already ruled for parameters. The first step would be the 40 + 36
initializer rows, the ones the storage rep repairs on its own, with reads of those globals kept
at a named miss (`global read at storage row`) until the carrier read lands. Fuel is not
measured: the experiment builds nothing new.

## Ruling (coordinator, 2026-11-21)

Option 1, recorded in `DECISIONS.md`. Options 2 and 3 are refused: 2 as a second rep channel, 3
because it parks 116 functions behind an elaboration that is not scheduled. Two conditions replace
the first step proposed above:

- **Monotone.** No function claimed today becomes unclaimed. A global whose initializer would be
  claimed but whose reads would newly miss stays wholly on its current path. The initializer and
  the carrier read land together, with no interim named miss that loses claims.
- **A stored carrier.** The read's rep is a fact legacy already computed and stored, not a
  re-derivation from the type. The PR names the exact table it reads.

## Not in scope

- The `Map()` initializer's 24 rows. They are the same split: the constructor's shape is
  `litRepTyAt`'s, the cell's is `letBindTy`'s. The constructor's bytes are legacy's either way
  (`emitMapNew`), but no matched start body witnesses a relaxed test today (#9391's note), so
  they follow option 1's first step.
- Other initializer coercions (32 functions over 19 files) and the `closure`/`i32` read rows
  above.
