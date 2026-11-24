# IR coverage: `memory address fold`, legacy's declaration-time address fold ported byte-identically (2026-11-24, lane IR-N8)

`memory address fold` on master f963da37: 15 functions over the 15
`tests/cases/intrinsics/memarg-const-fold-*` programs, none in the distilled corpus. The IR declined
every function whose frame reserves fold scratch (`fnMemAddrFoldCount > 0`) before building it.
The queue ruled the port byte-identical (Q57 not granted): the fold is a deliberate codegen
optimisation, the address in a register and its constant an immediate offset, which no instrument
would see the IR drop.

Legacy's fold: a local `const p = K + bounded` (`memConstFoldShapeK`, an i32 slot) takes one scratch
local, reserved last of the eager frames (`maFoldScratchBase`). Its initializer is `bounded;
local.tee scratch; i32.const K; i32.add`, and each memory intrinsic whose address is `p`
(`memAddrPlanOf`'s `fold` arm) reads `local.get scratch` at `offset=K`. A row belongs to the
declaration: a re-emitted copy (full unroll, the 4x partial unroll, the list walk) reuses it.

- **`memAddrPlanWith` (wasmEmit.vl)** is `memAddrPlanOf` over fold rows passed as data
  (`MaFoldRows`); `memAddrPlanOf` passes legacy's own table. Legacy fills that table as it writes
  the function, so under a shipped claim, which builds the IR first, it is empty.
- **The IR derives its rows** (`foldLetK`, `foldLetAt`, ir_build.vl): legacy's own checks in
  `emitLetPlainInit`'s order; a declaration's first build takes slot `maFoldScratchBase + row` in
  build order, which is legacy's emission order, and a rebuilt copy finds its row. Rows live on the
  function (`irMaDecl`, `irMaSlot`, `irMaK`), read by the builder and the lowering alike.
- **`RMaFoldInit`** (ir.vl, verifier, lowering): the bounded part, teed into the slot, plus K.
- **The `fold` arm** in scalar (`memAccessRhs`), atomic and SIMD access: the access names the
  binding's own read as its address (a plain local read, else a named miss); the lowering, asking
  the same plan, writes the slot at offset K in its place. The verifier's address check holds as
  written, since the binding is that slot plus K.

## Measured

Base master f963da37, head its merge with this branch, both seeds fixpoints; re-checked after merging master 13602fbf.

- The class: all 15 functions covered, verified and matched under `VL_IR_SHADOW=1` and `=6`, with
  no order row, `memarg-const-fold-unread`'s locals prefix included.
- L2 self-compile fuel per PR +0.23% on 13602fbf; the head seed compiling the base tree is +0.009%
  over the base seed's own, so the rise is the added source, not the compiler's running cost.
- Disassembly, `memarg-const-fold-single-use`'s `f`: `(local.set $1 (i32.add (local.tee $2 …)
  (i32.const 1024)))`, then `i64.store offset=1024 (local.get $2)` and `i64.load offset=1024
  (local.get $2)`. The module is byte-identical built by the base seed, by the head seed, and by
  the head seed with every function claimed (`VL_IR_SHADOW=3`).

Witnesses: `memarg-const-fold-unroll-cross-read-runs.vl` writes memory through an inline address
and reads it through a folded `const`, and the reverse, in a fully unrolled range, a partially
unrolled range and a list walk, so a wrong slot or offset reads another cell (prints `12340
76543210 3141592 4321` under every seed). Position sweep (Q58),
`memarg-const-fold-positions-runs.vl`: a folded load delivered to 10 positions; base 10 `memory
address fold`, head 77/77 functions matched under `VL_IR_SHADOW=6`. `ir-identity --claimless` over
the class, both witnesses and the row: identical 18, differ 0. Row:
`tests/ir-shadow-rows/memory-address-fold.vl`.

## Legacy tails the IR calls

`memConstFoldShapeK`, `memConstFoldShapeRest`, `mfShapeIsSum` and `memAddrPlanWith` (wasmEmit.vl),
newly exported; `maFoldScratchBase` and `localIsRef` (emit_state.vl).
