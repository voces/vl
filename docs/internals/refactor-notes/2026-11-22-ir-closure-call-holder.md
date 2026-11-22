# IR: a call through a holder of a returned bundle's record, 2026-11-22

Lane IR-N6, the sixth slice of `call of a non-declaration` (holderRecord). A `const` holding a
returned bundle's record whole (D15144) is called through by name. Legacy's `emitHolderCall`
reads the member the elaboration noted for the call, from the record's field `c<m>`, and calls it
at that member's signature. `callRefPlainKey` refused every such call, so the IR did too.

## The change

- Legacy's decisions are split out of `emitHolderCall` (wasmEmit.vl), and `emitHolderCall` now
  calls them:
  - `holderCallSigs` is the route: the record a named `const` holds, or a field's place
    (`calleePlaceRecordSigs`).
  - `holderPickOf` is the pick: the record's heap, its field, and the member's type and key.
- `emitHolderCall` also records legacy's plain key, as `emitBundleCall` does.
- `bundlePickOf` falls back to `holderPickOf`, so the IR's `RBundlePick` lowers a holder's pick
  unchanged.
- `callRhs` (ir_build.vl) sends a call with any `holderCallSigs` to `holderCallRhs`. That reads the
  holder, takes its member into a temp at the member's closure rep, and calls it at the key
  `holderCallRefPlainKey` returns. `legacyPlainAgrees` checks that key against legacy's.

The new row `tests/ir-shadow-rows/closure-call-through-record-holder.vl` has covered and matched
floors of 4 (base: 2).

## Readings (base: master `f1b142006`, fixpoint; candidate `02e3deb9a`, fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 66,721 | 66,722 |
| armed `tests/cases` covered / matched | 66,721 / 66,720 | 66,722 / 66,721 |
| `tests/cases` `call of a non-declaration` (any / alone) | 367 / 306 | 322 / 304 |
| `tests/cases` `capture binding` (any / alone) | 204 / 200 | 205 / 201 |
| corpus functions with no blocker | 44,772 | 44,772 |
| corpus `call of a non-declaration` (any / alone) | 21 / 20 | 21 / 20 |
| self-compile functions with no blocker | 19,623 | 19,624 |
| armed self covered / verified / matched | 19,624 | 19,624 |
| L2 self-compile fuel | 108,603,729,218 | +0.10% |

Of the 45 calls the class lost, 43 were in functions another blocker also refuses, mostly IR-D1's
`open local type`. Of the 2 alone, one is now covered; the other moves to `capture binding`, in
`bundle-record-held-called-and-handed-on.vl`. On both seeds the armed fail and mismatch rows are
the same three.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,599 |
| `--claimless` | 14,017 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,319 |

Late demands stay at 9 and late tag rows at 307. `tests/vl_ir_shadow_test.ts` passes (216 passed).
The last commit moves `holderCallSigs`' field-place test into `calleePlaceRecordSigs`, for
`kind-ladder-incomplete`. It was re-read by `--names` against the earlier candidate, `--cases`,
`scripts/gate.sh --fast` and the shadow test.
