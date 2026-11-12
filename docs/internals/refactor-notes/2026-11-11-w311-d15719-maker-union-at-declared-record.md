# A maker's union of records delivered at a declared record is built there (D15719), 2026-11-11

Lane w311. The witness is invalid wasm on master `1d517770`:

    type J = { a: i32 }
    type K = { j: J | null }
    function mk(b: boolean) { if b { { j: { a: 1 } } } else { { j: null } } }
    const _k: K = mk(false)
    print(_k.j?.a ?? 5)

## Ablation

| spelling | master |
| --- | --- |
| the witness | invalid wasm: a union box `struct {i32, anyref}` stored where `K` is expected |
| the read removed (`print(1)`) | invalid wasm |
| `type J` inlined into `K` | invalid wasm |
| a value `if` of the two literals, no maker | invalid wasm |
| two calls, both at `K` | invalid wasm |
| `{ j: 1 }` / `{ j: null }` (a scalar field) | runs |
| both arms holding a record | runs |
| `function mk(b: boolean): K` | runs |

The checker joins the two literals to the union `{j: {a: i32}} | {j: null}`. A scalar-or-`null`
field joins to one record instead, which is why that face runs. The union fits `K` member by
member, but nothing built it there.

## Mechanism and fix

There were three gaps on the way from the union to `K`'s struct slot.

- **The maker** (`recFnBuiltAtDst`, check_fit_rules.vl): D3444's rule builds a maker's literals at
  the record its call is delivered to, but only for a one-record result. New `recUnionLandsAt`
  answers the declared record when every member of a union of records lands on it with its field
  names. The rule then runs with that record. The kept maker is recorded with its result typed as
  the union and built as the record (`recKeptFnPush`), which is the pair `recKeptFnDstOf` matches.
- **The maker's result** (`retFlagsSeedResult` in wasmEmit.vl): an un-annotated maker whose
  inferred result is a union was given the union-box return. A maker whose delivery builds it at
  one record (`recKeptFnDstOf`) now returns that record.
- **The value `if`** (`exprUnionIf`, emit_classify.vl): D15020 already stamps a value `if` whose
  arms go to a record, but `emitIfExpr` asked `exprUnion` first and boxed it from its union type.
  New `ifBuiltAtRecord` answers yes when the join is stamped as one record, or every value it
  yields is.

## Graded

`scripts/capability-probes/matrix/maker-union-of-records-at-declared-record.matrix.vl` covers the
let annotation, parameter, return (inferred and annotated), field (init and assign), element
(literal, assign and push), map value (literal and set), locals, globals, closures, blocks,
function bodies and two instances.

| face | master | this |
| --- | --- | --- |
| annotated (delivered at `K`) | 0 of 28 run, 28 SILENT (invalid wasm) | **28 of 28 run** |
| un-annotated | emit refuses (D15717's shared read) | the same: #7242 closes it |

`runs → not-runs` 0. Fixture: `tests/cases/objects/maker-union-of-records-at-declared-record-runs.vl`.

One delivery moves from an emit refusal to a check refusal: the maker called at `K` and also used at
its own union type (`const y = mk(true)` beside the witness). That is the record-covariance contract
the one-record D3444 rule already refuses: one maker returns one rep, and a record is shared, not
copied. It was not `runs` before. With #7242 alone it is still D15719's invalid wasm.

## Proof

- Refresh ×2 is a fixpoint at 6,622,658 bytes, and the base is master's fixpoint. Comment edits
  after the sweep gave a byte-identical seed.
- `sweep.vl diff` from base to head: **23,910 same**, 0 bytes-only movers, 0 output movers, 0
  `runs → not-runs`, 0 new compiler traps. No corpus program reaches the shape. The movers are the
  matrix and the fixture.
- These pass: lint-self (with the comment, ladder, sentinel and scan budgets), dead-export,
  render-parse, kind-ladder sets, seed-size, late-demands, plumb-shape, rep-fuzz (exact),
  `cases_wasm` (7,441), `vl_check_codegen`, `vl_scaling_shape`, `vl_probe_rollback`, the inventory
  rows and refs tests, and the capability probes (222 of 226, as on base).
- Claims this lane's id block, 15770–15779, in `RESERVED.md`.
