# A generic instance's record copy reads its shared fields in its frame, and its slots at the template (2026-11-08)

Lane "D15549, D15548, and the built-at-different-rows gap". It follows
[2026-11-08-returned-record-held-type](2026-11-08-returned-record-held-type.md) (D15297, #6777),
whose commits this PR carries.

## D15549: the row's key was right, the layout was not

Each instance of `mk<T>` has its own copy of the record literal, its own closed type and its own
row. The copies share their `FieldInit` children: a generic instance's clone rebuilds only its
statement spine. Probes, one at a time:

| probe | reading |
| --- | --- |
| row each copy builds at (`structIndexOfObjCtx`) | row 0 for `mk<i32>`, row 1 for `mk<string>` |
| type recorded on each copy | `{fs: ((i32) => i32)[], x: i32}` and `{…, x: string}` |
| field codes of rows 0 and 1 | both `x = 3` (string) |
| who mints them | `anonMintRowFor(ox, -1)` from `mintGradualObjLitRows`, no frame |
| `fields[1]` of the two copies | the same node |

`monoRecordObjLitAt` wrote each instance's type for the shared read `x` into the node column
(`nodeTyRecord`), so the last instance won. The mint then read every copy's `x` at it. With
three instances (`f64`, `string`, `i32`) the `f64` copy also converted its `x` from `i32`.

- `monoRecordObjLitAt`: a field read the frame does not own is recorded in that frame only
  (`nodeTyRecordIn`).
- `monoGradualObjFrame` (`emit_state.vl`) holds each copy's frame; `mintGradualObjLitRows` mints the
  row of a literal holding a tagged set with that frame current (`nodeTyInstEnter`). Both halves
  are needed: either one alone leaves the witness invalid wasm.

## D15548: a copy keys no slot

`monoPinFieldContainer` instances a record's listed functions at the slot's pins
(`monoStoredSlotFnTy`). The slot is keyed by the template literal (node 14). The copy (node 38) had
0 pins, so `elabSlotUncalled` read it as uncalled, and `inc0` was never instanced at
`(i32) => i32`. A lone record's tagged id reached the call through the id table, so it ran. A list
of the records, or an annotated closure-list destination, built a closure at the uncalled stub.
`monoStoredSlotFnTy` now reads the template's slot when the copy has no pins of its own.

This also closes a check-clean trap that #6777 introduced: `const r: {fs: ((a: i32) => i32)[], x:
string} = mk("q")`. On master it is a loud reject (`ref valtype with no interned shape`). On
#6777's branch it was `indirect call type mismatch`, and it runs here (`d15548_annotated_*`).

## Measured

Base: master `c296e59f` + #6777, a fixpoint at 6,509,674 bytes. Candidate: a fixpoint at
6,510,225 bytes (+551, +0.008%). `scripts/sweep.vl -- diff`: 0 `runs → not-runs`, 0 new traps, 0
`invalid_wasm` on either side. 2 output movers, both `→ runs`: D15549 (`compiler_trap`) and D15548
(`emit_reject`). 1 bytes-only mover, `unions/deep-is-site-keeps-a-union-alias-arm.vl`: its
standalone `vl build` module is byte-identical on both seeds. The four new `closures` cases shift
the sweep's 100-program chunks. All 13 new programs run: 9 `named/` cells and 4 cases.

## Still refusing

- [D15550](../inventory/D15550.md): `[mk(1)]` with the set called at a literal, `ref valtype with
  no interned shape`. The non-generic twin runs. The family is grouped by message and not yet
  ablated.
- A third field `y: [x]` beside the set refuses (`object literal but no struct type declared`)
  even at one instance ([D15551](../inventory/D15551.md)). The non-generic twin runs.
- Built at different rows (D15226/D15510): `pick(b: boolean)` is not generic, so this PR's frame
  facts do not reach it. The missing fact is each set member's own instanced signature at the
  join: `elabFnJoinTy` builds the join from the checker's open `j` (its params and result), and
  the set union never consults the members. The elaboration's climb already types D15510's
  `[half]` slot at `(i32) => f64`, so it is the producer. The gate could lift where every
  member's climbed signature agrees with the join's.
