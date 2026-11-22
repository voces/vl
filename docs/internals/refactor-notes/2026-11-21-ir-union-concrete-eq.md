# IR: a union box compared with a concrete operand (2026-11-21, lane IR-N2)

`string operand coercion` (66 sole-blocker functions over the corpus files at 568e22a3) is mostly
a routing gap. `k == "a"` with `k` a `"a" | i32 | null` box is, by legacy's `eqRouteOf`,
`unionLeft`. That route is `emitUnionConcreteEq`: an `if (result i32)` on the box's tag against
the literal's arm, whose then-arm string-compares the cast payload, else 0. The IR checked its
string operand first and sent the compare to `irStrBinHook`, which missed on the box.

## The change

- `emitUnionConcreteEq`'s plain arm is now `unionConcreteEqPlanOf` (`wasmEmit.vl`). The arm needs
  a re-readable box whose union carries the operand's arm, and no null leg on the operand.
- Three tails do the writing: `unionEqTagTail`, `unionEqPayloadTail` and `unionEqCmpTail`, after
  `unionEqHead`'s stash slot. Legacy writes that arm through them, with its own two box reads and
  `emitUnionEqOther`. Every other shape (the stash, the null legs, the number cross, the static
  fold, the variant compare) keeps its own code.
- `exprAt` (`ir_build.vl`) asks `eqRouteOf` once for a compare with a union operand. On
  `unionLeft`/`unionRight` it builds `RUnionConcreteEq`. The box must be a parameter or local
  read twice, the operand an in-place read at the arm's rep (string, `i32` or `boolean`).
- The lowering writes the head, the box, the tag tail, the box, the payload tail, the operand and
  the compare tail. The verifier holds the box to a non-temp variable.

tests/cases matched 66694 → 66739 (+45) on one A/B over seeds of the merge-base, no new fail
rows. The corpus is unchanged.

## A parked witness

`return coercion record to record` at std:buffer's `i32view`/`f32view` reproduces only with
`std:fs` imported beside `std:buffer`, on 568e22a3, `VL_IR_SHADOW=4`:

    import { readFile } from "std:fs"
    import { Buffer, loadU8 } from "std:buffer"
    const b = Buffer(8)
    print(loadU8(b, 0))

The in-wasm shadow harness rejects the `std:fs` import, so no row file can pin it.

Row file `tests/ir-shadow-rows/union-box-concrete-eq.vl`; witness
`tests/cases/unions/union-box-against-concrete-literal-eq.vl`.
