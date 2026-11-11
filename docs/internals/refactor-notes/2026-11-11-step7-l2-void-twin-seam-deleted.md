# Step 7 L2 §7: the void-twin seam is deleted; only a placeholder spelling reached it, 2026-11-11

`monoNoteVoidTwin` noted a generic instance for a void twin when the slot it was delivered to
returned nothing. `synthVoidTwins` then minted the twin, with parameters parsed back out of the
slot's spelling (`voidTwinSeamTy`, through `annFnDecompose`). Outside a call
(`monoSigCallRet == -2`), the "returns nothing" test also read the spelling `tname`. Every
caller hands it the slot's function type `ft` as well.

The #7132 handoff found that the spelling and "`monoFnTyRet(ft)` is void" disagree in 7 programs.
It asked whether the type or the spelling is wrong there. The spelling is. Once the test reads
the type, nothing in the population reaches the seam, so this PR deletes it.

The base is master `98b73ba7`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,877 programs.

## Probed

The probe ran in a scratch compiler that was never refreshed into a seed, using #7119's
accumulator. A program that otherwise fails hides its probes.

| question | programs |
| --- | --- |
| reach `monoNoteVoidTwin` | 73 |
| `ft` is missing | 0 |
| the spelling says void and `ft`'s result is not void | 7 |
| `ft`'s result is void and the spelling says not | 0 |
| a seam is noted | 1, one of the 7 |

In all 7, `monoSigCallRet` is -2 and `tname` is a pin-built spelling whose result is a
placeholder. `monoSigFnTyName` spells "`void` where no return is known", as
`monoSlotPinAnn(..., "void")` does. It does not mean the slot returns nothing. In 4 of the 7,
including the one that notes a seam, `tname` is the list-element or record-field pin
(`monoPinListElems`, `monoPinNestedListElems`, `monoPinRecordField`). `ft` is the type the
elaboration delivers the slot at: `(i32) => i32`, `(string) => i32` or `(string) => string`
here.

In 6 of the 7, a later guard declines anyway: the value names no generic instance that returns a
value. In `closures/written-let-of-generic-pinned-write-beside-other-type.vl` a seam was
noted. It minted `$k$1$voidtw` and a table trampoline for it. No slot in that program returns
nothing, so neither was ever called.

So the seam is reached once in the population, and that once is the placeholder misread. The
witnesses the code cites (D3969, D14785 and their cases under `generics/`) run without it. So did
a hand probe of D14785's three deliveries: a record field, a list element, and a slot annotated
`(n: i32) => void` at `i32` and at `f64`. On master those modules hold no `$voidtw` at all. They
are built as tagged sets and adapter lambdas, and the mono seam is never noted for them.

## Changed

Deleted:

- in `emit_mono.vl`: `monoNoteVoidTwin` and its 3 calls; the `holes` test that fed it; and
  `monoSigRetVoid` with `monoSigCallRet` and its 3 save/restore sites;
- in `emit_rewrite.vl`: `voidTwinSeamNote`, `voidTwinSeamHas`, the 4 `voidTwinSeam*` columns,
  `synthVoidTwins`' seam loop and its `annFnDecompose` parse, and `voidTwinArgTy`.

`voidTwinMint` keeps its checker-seam caller. It loses its `ptys` and `ft` parameters, since that
caller always passed none. `voidTwinForNode` asks only `voidCoerceValAt`.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: 23,876 of 23,877 are the
  same, with 1 bytes-only mover, 0 output movers and 0 runs → not-runs. The mover is
  `closures/written-let-of-generic-pinned-write-beside-other-type.vl`, 1,632 → 1,573 bytes. Its
  disassembly loses `$k$1$voidtw`, its table trampoline, one function type, one global and one
  table slot. Nothing else changes except renumbering.
- **The type-only fix records the same.** A candidate that kept the seam and only made the test
  read `monoFnTyRet(ft)` recorded every one of the 23,877 programs exactly as this one does.
- render-parse and the pin-helper budget do not move, or fall.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
