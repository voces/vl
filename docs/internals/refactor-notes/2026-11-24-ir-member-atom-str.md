# IR coverage: `member record` families A and D, an atom field read where its literal's string is wanted (2026-11-24, lane IR-N8)

A field typed by one bare string literal (or a literal set) is stored as its atom. When its read
is delivered where the literal's string is wanted, legacy's field tail leaves the atom and the
consumer decodes it: a return or an argument through `emitAtomToStr`, `print` through its atom
arm. The IR declined these reads: the row's storage kind (`i32`) is not the kind the read records
(`str`), so neither plain predicate took it.

On master `156b4dd0c`, a throwaway probe seed (source restored, seed pristine by `cmp`) reported
the arm, storage kind, read kind, wanted rep and `exprIsLitAtom` at the final `member <rep>` miss,
over tests/cases plus the capability probes (9435 programs) and the distilled corpus (12700 cells):
18 `member record` functions, all in tests/cases.

| family | fns | arm | storage → read | wanted | ruling |
|---|---|---|---|---|---|
| A | 7 | shared | `i32` atom → `str`, literal atom | str | **this PR** |
| B | 6 | narrowed | `Index` receiver | i32 | closed by #9919 |
| D | 2 | variant | `i32` atom → `str`, literal atom | str | **this PR** |
| E | 1 | variant | `str` → `i32` atom | atom | N8, next measurement |
| F | 1 | shared | `nulstruct` read as a variant | record | named, left |
| H | 1 | shared | `nulbool` → `i32` | bool | N8, after E |

- **`fieldStoresReadAtom` (emit_plan_union.vl)**: `structFieldPlain` and `variantFieldPlain` also
  take a row stored as the `i32` atom when the read records `str` and is a literal atom. Their only
  callers are `ir_build_ref.vl` (`buildMember`) and `ir_lower.vl` (`fieldIdxAt`, `fieldTail`), so
  legacy's bytes don't change.
- **The builder** (`buildMember`) reads such a field at its atom rep, typed at that rep, like a raw
  read at a field's storage. The consumer decodes it where legacy's does: `deliver`'s `atomToStr`
  (the decode `deliverStr` itself takes) for a return, an argument or a concat, and `print`'s atom
  arm for `print`.

The pre-review proposed decoding inside the read through an exported `atomToStr`. That breaks
`print`, which takes legacy's atom arm and wants the atom (`print operand rep`: wanted atom, got
str), and the decode at a return or argument is already the consumer's. So no new export: the
consumer's own delivery decodes through the existing path.

A nullable literal field never takes the new arm: it is not stored as `i32`, and a non-null
string target is reached only past a narrowing or a `??`, which the existing arms read
(`tests/cases/literal-unions/nullable-atom-field-read-at-string-runs.vl`, matched on both seeds).

## Measured

Base master `e6fac9e78`, head this branch on it, both seeds fixpoints; re-checked after merging
master `490fadee7`.

- Class regrade over the 9 programs: base 5 `uncovered member record` and 4
  `start uncovered member record`; head 112/115 functions and 9/10 starts matched, the rest other
  classes. One start, `generics/one-literal-field-through-generic.vl`, moves to `member atom`
  (`id(a.kind).length`, a `.length` off an atom-typed call result).
- Census, each arm in a tree at its own commit (#26): `member record` rows 18 → 9 (5 functions and
  4 starts, one a distilled-corpus cell), `member atom` 5 → 6.
- Covered-fell: tests/cases fell 0, rose 9; corpus fell 0, rose 0.
- L2 self-compile fuel per PR +0.01% on `e6fac9e78`; the pair (the head seed compiling the base
  tree) is −0.0002%.

Disassembly: `functions/one-literal-result-widens-atom.vl`'s `fld` is, claimed and under legacy,
`local.set $4 (struct.get $0 0 (local.get $0))` then `return (global.get $global$0)`, the decode of
the one-member atom. That module and the position file are byte-identical with `--names` under the
base seed and under the head seed with every function claimed.

Position sweep (Q58):
- `tests/cases/literal-unions/atom-field-read-as-string-positions-runs.vl`: return, argument,
  generic argument, `print`, string hole, concat, map store, `push` and `==` operand, on the struct
  and the variant arm. Base 16 `member record` of 82; head 80/82 matched, the 2 map stores keeping
  the earlier `map store value atomStr` miss they have on base. Output the same under base, head
  and claim-all.
- `scripts/capability-probes/matrix/record-atom-field-read-as-string.matrix.vl` and
  `variant-atom-field-read-as-string.matrix.vl`, both faces: 44 of 48 graded cells run, 0 silent,
  0 `runs → not-runs`. The 4 others are the annotated capture cells, invalid on base and head
  alike: filed as D17281 (#9932).
- Row: `tests/ir-shadow-rows/atom-field-read-as-string.vl`.

## Legacy tails the IR calls

None new: `structFieldTail` and `variantFieldTail`, which the plain arms already call.
