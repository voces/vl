# IR: a call through a bundle parameter, 2026-11-21

Lane IR-N6, step 9. A lambda a hole parameter calls at two or more signatures is handed as a
record of closures, field `c<k>` the closure at the `k`th (D14841). A call through the parameter
reads that member and calls it. The builder sent the call to `closureCallRhs`, whose
`callRefPlainKey` declines a bundle, so it missed as `call of a non-declaration`. A scratch census
of that class's declining conditions over 481 `tests/cases` files put the bundle first, with 336
rows.

## Plan and change

- **One decision for the member.** `bundlePickOf(callIx, fnIx)` (`wasmEmit.vl`) returns the
  record's heap, field `c<k>` (`bundleFieldOfCall`), the closure's type and its `$fnsig` key
  (`BundlePick`). Legacy's `emitBundleCall` asks it in place of its inline computation, and its
  stash is `callRefStash`, the same bytes.
- **Legacy's agreement record.** `emitBundleCall` records its key in `callRefLegacyPlain` when
  `emitCallRefAt` wrote every argument plainly, as `emitCallRefUnder` does, so the IR's armed check
  covers a bundle call.
- **One tail.** `callRefPlainTail` splits into its closure-value head and
  `callRefPlainArgsTail`, the interned signature, split-set and argument checks `emitCallRefAt`
  makes, which `bundleCallRefPlainKey` shares at the member's key.
- **The IR.** A new right-hand side, `RBundlePick { bpV, bpAt }`, in the claimed `closure` family:
  the parameter's read, then `struct.get` at `bundlePickOf`'s pick, which the lowering asks again.
  It is the closure of an ordinary `RCallRef`; `closureCallRhs` splits into its head and
  `closureCallAt`, the arguments and call both share.
- **The parameter's rep is unchanged.** `RBundlePick` reads only its local, so the builder needs
  the bundle record as the parameter's rep only once a later step reads the bundle whole.

Compiler lines +136 / −24 (`wasmEmit.vl` +67 −15, `ir_build.vl` +41 −5, `ir_lower.vl` +12,
`ir_verify.vl` +9 −1, `ir.vl` +6 −2). The shadow row `tests/ir-shadow-rows/bundle-call.vl` calls
one lambda at an `i32` and an `f64` signature through two callees.

## Readings (base: #9364's fixpoint at master `04650021`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 58,753 | 58,769 (+16) |
| `tests/cases` `call of a non-declaration` (any) | 849 | 514 |
| corpus `call of a non-declaration` (any) | 75 | 64 |
| self-compile functions with no blocker | 19,288 | 19,295 |
| armed `tests/cases` covered = matched + 11 pre-existing | 58,753 | 58,769 |
| L2 self-compile fuel | 104,610,715,246 | 104,747,550,796 (+0.131%) |

Most of the 335 rows the class lost now stop at `open parameter type` (IR-D1's): a bundle
parameter is a hole parameter, so its function waits on the open-type rule change in flight.

The fuel is the self-compile compiling this step's 136 added lines. The compiler makes no call
through a bundle parameter, so no new arm runs there.

Armed `tests/cases`: the fail and mismatch rows are the same on both seeds, row for row.
