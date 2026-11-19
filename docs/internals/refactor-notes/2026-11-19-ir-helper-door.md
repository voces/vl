# Runtime helper bodies through the IR: the door, the raw layer, B + D + E (2026-11-19)

Stage §10.1(b) of `ir-design-2026-11.md`, "runtime helper bodies": the hand-written wasm byte
writers (`*FnCode`) become IR functions lowered through one door. This first step takes ten
helpers: `__f64_rem__` (family B), the six string helpers (D) and the three UTF-8 helpers (E).

## Shape
- **The door** (`irLowerHelper`, `ir_lower.vl`). It lowers an `IrFn` built with `irHelper` set
  into the helper's existing code-section slot and name. The signature stays `helpFuncType`'s,
  so the function, type and name sections do not change. The locals vector comes from the
  function's `local` variables in slot order; a slotless local is a valued block's out.
- **The builder** (`compiler/ir_helper.vl`). Operands are values; each operation appends its node
  to the open body (a stack of bodies, so no global is saved and rewritten).
- **The raw layer.** A helper holds wasm GC references no VL type names: a string's backing,
  later a map's row array. They are typed by one rep node, `RRaw { rwHeap, rwNull }`
  (`emit_rep.vl`), and moved by two IR kinds, `RRawOp` and `SRawOp`, whose ops each lower to one
  `fb*` writer: struct get/new/set, array get/set/new_default/len/copy/init_data, ref
  eq/cast/as_non_null/null/is_null, call by function index, `tee`, and `test` (an i32 read as the
  bool `if` takes).
  - A raw variable has no VL type (`vTy` -1), never `TY_NEVER`: `never` means dead to the emitter.
  - Verifier rule 10 confines raw reps and ops to a function with `irHelper` set, and checks every
    reference operand is raw at its op's heap type. The ops form the `raw` family, which
    `CLAIMED` never lists.
  - Not checked: a `struct.get`'s result rep and a `call`'s arguments. No table keeps a heap's
    layout or a helper's signature; wasm validation of every built module is the backstop.
- **Helper-only lowering forms**, so the bytes are the hand bodies' own: a valued block and
  valued branch, `if c { br L }` as `br_if`, and a final valued return as fall-through.
  Each is gated on `irHelper`, so no user function's lowering changes.

## Builder rules
1. **A loop exit is `if c { br L }`, never `if !c {} else { br L }`.** The second form lowers to
   `cmp; eqz; br_if`, and a float compare under `eqz` cannot be folded (NaN): it measured +3-4%
   CPU on `__f64_rem__`'s loops (median of 10, interleaved). `exitIf` is the only exit the builder
   offers.
2. **A temp is defined inside the arm that uses it.** Arguments evaluate before the call, so
   `when(test(..), close())` after `open()` defines the test inside the arm. The lowering refuses
   such a function loudly (`non-stack temp: out of order`, `reads temp before its definition`),
   never silently.

## Measured
- Byte identity: a string program (eq, hash, concat, bytes, from_bytes, fill), a UTF-8 program
  (for-cp, `cpAt`, `cpLen`, `fromCodePoint(s)` over surrogates and out-of-range code points) and
  an f64 `%` program build to identical wasm under the master seed and this one.
  `scripts/ir-identity.sh` over the distilled cells and the self-compile: see the PR body.
- The run-time cost is zero by construction: the helper bytes are identical.
- Lines, compiler only: +1129 / −1154.
  - door ~72, builder 184, raw layer ~227 (counted once, here);
  - bodies: f64 rem ~45 against 115 deleted; strings ~237 against 438; UTF-8 ~217 against 462.

## Not in this step
- C (fail/log), F (map + list), G (scalar and record list views): the same door; F and G reuse
  the raw layer; C adds a relocated constant and an i32 load.
- H (struct compare) waits on IR4's `emitExpr` re-entries.
- The exit-form mover (`block i32` + `br` into `return`) is a separate PR, with its own benches.
