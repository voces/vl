# IR step 0 for the list slice: hooks and exported helpers, 2026-11-15

Lane I, for lane Q's list half of I2 (agreed with the L1 design lane and lane Q). This PR adds no
construct. It adds the seams Q's own files fill, so that Q never edits lane I's.

## The surface

The compiler's import graph has no cycles, so each hook is a function-valued `let` with a
default. It is the pattern `fnRecordedRetTyFn` uses. Q installs the real functions from a module
above, with one line beside `irShadowBegin()` in `emit_sections.vl`.

- `ir_build.vl`:
  - `irVarRepOkHook(rep, ty)` widens the one rep gate (`valueRep`). That gate covers variables, parameters, callee signatures, globals, results and expressions.
  - `irIndexHook` is called for every `Index`, and `irMemberHook` for every `Member`. Q routes by the receiver's rep.
  - The helpers are exported as `irBExpr`, `irBLetTemp`, `irBNode`, `irBMiss`, `irBOpRep` and `irBDeclVar`, with the accessors `irBFn`, `irBFnIx` and `irBNoValue`.
- `ir_lower.vl`:
  - `irLowerListHook` is the `RListGet`/`RListLen` arm, and `irLowerBoundsHook` the `SBoundsCheck` arm.
  - `irRefValtypeHook(v, ty)` gives a reference local's run in the locals vector.
  - The helpers are exported as `irLOpnd`, `irLMiss` and `irLSettle`, with the accessor `irLFn`. Operands written through `irLOpnd` keep the stack-order precondition.
- `ir_verify.vl`: `irBoundsRuleHook(f)` is rule 8, asked once rules 1–7 hold.

Every default misses with the class the construct missed with before, so behaviour is unchanged.

## Measurements

| reading | value |
|---|---|
| master's tree, armed, compiled by master's seed and by this one | output byte-identical, and every `[ir]` row identical |
| shadow rows | 17,499 functions, 1,504 covered, 1,502 matched |
| this seed | a fixpoint (two refreshes, byte-identical) |

## A trap for a hook `let`

The first placement of `ir_lower.vl`'s three hook `let`s put them above the module's other
state. The refreshed compiler then imported the host's print family, and the seed could not
load. The emitter had given those globals init guards (`gInitAny`), and a guard's abort prints its
reason. Declared at the end of the module, after the functions that read them, they take no
guard, and the seed imports nothing. Any hook `let` Q adds should be declared the same way.
Check it with `wasm-dis build/vl-compiler.wasm | grep -c "(import"`, which must read 0.

## Net lines

- Compiler: +218 / −144.
- Pin helpers in `emit_mono.vl`: 908 → 908.
