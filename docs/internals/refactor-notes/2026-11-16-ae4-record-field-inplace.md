# 2026-11-16 — lane AE4: a record field replaced in place (AE-004, the record face)

Aeomach's AE-004 record face: `r.f = <fresh record>` should write the record already in `r.f`
instead of allocating. The witness (ROADMAP's backlog entry, now removed) made 2 `struct.new`
in `step` at -O3, one per assignment.

## Where it runs, and why no alias analysis

No new pass. The `-O` inline-record step (`opt_inline_scan.vl`, inline-records-design.md S1)
already stores a leaf record's fields in its parent when nothing can tell a copy from the
shared box. Its conditions on the record type `V` are: no `struct.set` on any type in `V`'s
subtyping component, no `ref.eq` or `extern.convert_any` that can see it, and nothing that
crosses the module boundary reaches it. Under those, the assignment `r.f = vadd(…)` becomes
three `struct.set`s on `r`, and binaryen's heap2local removes the fresh record once `vadd` is
inlined.

So the "is the old `r.f` unaliased?" question does not arise. Whoever holds the old `r.f`
holds an immutable value, and a re-boxed copy of it prints the same. A held binding, a list
element, a closure capture and another record's field all see the value from before the write
(`global-initializer-aliases.vl`). This is stronger than an escape analysis on the writes
themselves, and also coarser. It answers "can anything observe the difference", not "is this
reference unique". The IR's planned record-inlining layout pass (ir-design-2026-11.md §4.2)
inherits the same rule.

On the witness, the step's census marked `V3` a candidate and then refused both `Body` fields
for one reason: `const body: Body = { pos: { … }, vel: { … } }` is emitted as a global's
constant initializer. The step rewrote function bodies only, so it refused any parent a
constant expression makes (D3679, filed 2026-10-05). Built by a call instead, the same program
already reached 0 allocations in `step`.

## What changed

- `constScan` emulates a constant expression's operand stack. For a global's initializer it
  records each `struct.new` field operand: its field key, the type of the `struct.new` that
  produced it (-1 for anything else), and that op's bytes. A table or element initializer,
  or an op it does not model, makes every struct type in the expression opaque.
- The decision's constant-expression refusal (`constRefused`) fires only for an opaque type,
  or for a field whose operand is not a `struct.new` of exactly the inlined record (a
  `global.get`, `struct.new_default` or a subtype). The explain text is unchanged.
- `globalSection` re-encodes the global section with the operand's `struct.new` op deleted.
  Its fields are then the parent's next operands, which is the same deletion the step makes
  in a body. Only the field step's `assemble` does this; the list-flattening step reuses
  `assemble` with no field decisions.
- The refusal can only turn into an inline, never the reverse. So a module whose explain lines
  are unchanged is byte-identical: the global section is copied when nothing is dropped.

Compiler: `opt_inline_scan.vl` +122 net lines, 2 new functions (`constRefused`,
`globalSection`).

## Measured

At -O3 (`VL_WASM_OPT=node_modules/.bin/wasm-opt`), `struct.new` counted with `wasm-dis`:

| program | master | this change | output |
| --- | --- | --- | --- |
| AE-004 witness, in `step` | 2 | 0 | same |
| D3679 witness, in function bodies | 1 | 0 | `999000` |
| inner field written (`body.vel.x = 9.0`) | 1 | 1 | same |
| written through a binding (`v.x = 7.0`) | 1 | 1 | same |
| old value pushed to a list | 1 | 1 | same |
| old value held in a binding, read after | — | 0 | same |
| old value captured, or stored in another record | — | 1 | same |

Corpus, at -O3 against master `e1f7f37c`. The population is the 1,846 programs under
`tests/cases`, distilled `cells/` and `named/`, and `bench/` that initialise a top-level record
(of the 4,571 that match the shape, the 700 with a nested literal plus 1,430 scanned before the
filter was narrowed; the narrower filter caught 83 of the 84 refusals the wide scan had found):

- 125 programs met the constant-expression refusal on master. 71 now inline more fields and
  print the same output at -O3 as unoptimised (71 of 71). One is still refused: its operand is
  not a `struct.new`. The other 53 now refuse those fields for a different reason, such as a
  whole read, so their inline count is unchanged.
- A control sample of the programs the refusal did not touch held 246 distinct programs. All
  246 build on both seeds to byte-identical modules, with no exit-code change.

## Precision limits

- A record type with a `struct.set` anywhere in its subtyping component is never inlined, even
  where the old value is provably unique. `b_inner_write` and `c_alias_write` keep their
  allocation by design. Moving that line would take a real uniqueness analysis over def-use,
  which belongs to the IR (§4.2) and not to this byte-level step.
- A parent an export's signature reaches keeps its layout (inline-records-design.md §6 Q2).
- A whole read that is not field-only re-boxes, so by default such a field is refused
  (`$VL_INLINE_REBOX` lifts it).
- In a constant expression, the record operand must be a `struct.new`. The emitter writes only
  nested literal `struct.new`s there, so the `global.get` arm is reached only by a hand-written
  module (`tests/vl_opt_inline_const_test.ts`).

No language-visible change: nested records stay reference-typed, and the rule holds only where
reference and value semantics cannot be told apart.
