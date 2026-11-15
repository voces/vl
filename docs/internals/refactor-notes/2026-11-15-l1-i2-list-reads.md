# L1 I2, list half: reference values and plain list reads in the IR shadow (2026-11-15)

Lane Q's parallel L1 slice (`ir-design-2026-11.md` §5.3, I2), behind lane I's step-0 hooks (#8406).
The IR lane reviews it. It is a phase-A shadow only: nothing is claimed, and no byte of the output
moves.

## What it covers

- **Reference values (`ir_build_ref.vl`, `irVarRepOkHook`).** A `str` or a list of unpacked
  primitives (`i32`, `i64`, `f64`, `f32`, `bool`) may be a variable, parameter, callee signature,
  result or expression. Packed `u8` lists, records, maps, boxes, nullables and closures stay out.
- **The valtype (`ir_lower_ref.vl`, `irRefValtypeHook`).** For a reference local it is the run
  legacy's locals vector writes for that slot, read off legacy's own writers (`fbLocalRun`,
  `fbValtypeNullable`, `fbLazyListSlotRun`), never minted.
- **Element reads (`irIndexHook`).** A read on legacy's plain guarded path builds
  `SBoundsCheck{v, i}` then `RListGet{v, i}`.
  - The check is fused: it lowers as nothing, and its operand reads consume nothing.
  - The read writes the receiver and index (through `irLOpnd`), then calls legacy's own
    `emitListIdxGuard`, then `array.get` of the backing.
  - The guard's scratch, the lazy list frame (`listIdxScratchBase` and one row per `liKinds`
    entry), is bound as `"local"` variables on legacy's slots, so `localsVec` covers it. Its
    wrapper slot is found without being handed out.
- **Member reads (`irMemberHook`)** are routed by the receiver's rep. Every one is a named miss
  in this slice: `list length`, `list member`, `string member`, `member <rep>`. A record's
  `length` field never reaches a list arm.
- **Rule 8 (`ir_verify_bounds.vl`).** An `RListGet` must directly follow an `SBoundsCheck` over the
  same list and index in its body, and every check must be followed by its read.
  - The failing control is `irRefCorrupt(5)`, which drops every check, and the verifier must then
    name rule 8 and nothing else (`tests/vl_ir_list_test.ts`).

## The decision copy, and why it is conservative

`listIdxPlainWhy` copies `emitIndex`'s decision in order, up to `emitIndexScalarList`'s unhoisted,
unviewed arm. Every other arm is a named miss:
- `index cell null`, `index two lists`, `index nullable list`;
- `index ref list`, `index str list`, `index string`;
- `index uncollected list`, `index maybe hoisted`, `index view`.

Legacy decides hoisting with `liveHoistRow`, which reads `lhLive` and is true only while legacy is
inside the loop. Once the function is lowered no row is live, so the decision cannot be asked
again. The copy therefore refuses a read when any hoist row matches the binding, live or not. That
can lose coverage, but it never admits a read legacy hoisted.

The shared form lands later. Legacy will bank the arm it took per `Index` node (`idxPlainAt`),
`emitIndexScalarList` will call it, the copy will delete, and the armed build will be quoted as
byte-identical. Lane I's I1b uses the same bank-per-decision shape for the tail call. Until then no
function holding an `RListGet` may be claimed (the IR lane's condition).

## Gate

- **Seeds:** A is a fixpoint built from lane I's step 0 (#8406, `3934d8f45`). D is a fixpoint built
  from this branch. Each took three rungs. The host was built from source in an isolated target
  dir, because the shared binary predates the shadow.
- **Shadow off, nothing moves.** `probe-rollback-census.ts --fingerprint` over `tests/cases`,
  `distilled/cells` and `distilled/named` gives **20,333 programs, 0 different**. L2 is
  byte-identical, with guest fuel 89,588,083,137 for A and 89,588,084,349 for D (+0.000001%).
- **Shadow armed, self-compile.** The armed self-build is byte-identical to the unarmed one.

  | 17,544 functions | A (#8406) | D (this) |
  |---|---:|---:|
  | covered | 1,508 | **2,123** |
  | verified | 1,508 | 2,123 |
  | matched | 1,506 | **2,116** |
  | mismatches | 2 (I1 global guard or fold) | 7: the same 2, and 5 `ref.as_non_null` global reads (I1b) |

- **Shadow armed, every fifth distilled cell (2,429 files).**

  | 8,851 functions | A | D |
  |---|---:|---:|
  | covered and verified | 1,868 | **2,417** |
  | matched | 1,421 | **1,829** |
  | `unmapped slot` (I1: an instance's parameter read) | 444 | 584 |
  | `locals layout` | 3 | 3 |
  | bytes (I1: a never-returning callee) | 0 | 1 |

- **Every new mismatch is one of the three I1 decisions below.** None is a list read or a
  reference local's valtype.
- **Tests:** `tests/vl_ir_list_test.ts`, `vl_ir_shadow_test.ts` (with lane I's fixture change)
  and `vl_compile_cache_test.ts` pass. Rule 8's control trips. `lint-self.sh` is clean, the
  armed seed has 0 imports, and nothing is claimed.

## Known mismatches, owned by lane I's I1b

Each is an I1 decision that this slice only makes reachable from more functions:

1. **An instance's parameter read.** `identDeclOf` gives the template's `Param`, so the read
   becomes an unslotted local (`unmapped slot`).
2. **A never-returning callee.** Legacy writes `call; unreachable` (`callIsNever`), where the IR
   writes `return_call`.
3. **A reference global's `ref.as_non_null`** (`emitGlobalReadRecover`). This becomes
   `userGlobalRead`'s `plainNonNull`.

## Files

- **New files:** `ir_build_ref.vl`, `ir_lower_ref.vl` and `ir_verify_bounds.vl`, plus
  `tests/vl_ir_list_test.ts`.
- **One-line edits:**
  - `irRefInstall()` in `runEmitPasses`;
  - the `irRefCorrupt` export in `entry.vl`;
  - keyword exports in `emit_bytes.vl` (`fbLazyListSlotRun`, `fbLocalIsUnsetRef`, `fbRun`) and in
    `wasmEmit.vl` (`hoistPathDecl`, `hoistPathProp`).
- **Lane I's fixture** in `tests/vl_ir_shadow_test.ts` changes from a list read to a record read,
  at lane I's request.
