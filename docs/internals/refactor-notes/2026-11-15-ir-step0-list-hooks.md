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

Each default either refuses or misses with a class naming the hook (`index hook not installed`,
`member hook not installed`, `list hook not installed`, `bounds hook not installed`), never a
silent no-op or a trap. Q installs the hooks on every program, armed or not. The hook signatures
carry plain data only: node ids, a body, a rep, and an `Opnd`, `Rhs` or bytes back.

The seven hook `let`s are module-level mutables chosen for cross-module dispatch without an
import cycle. They are deleted at I8, when the families fold into the builder. The phase-state
census flags none of them today: an uninstalled hook `let` is never written, so it is neither
`hidden` nor `cross` (the `--list` names no hook). Q's install writes are what the census may
count, and Q's PR records them in the baseline with that reason.

The rule-8 default is not silent: an uninstalled `irBoundsRuleHook` fails ("bounds rule not
installed") for any function holding an element read, an element write or a bounds check, so a
partial install cannot verify list access unchecked. `ir_selftest.vl`'s case 10 is its control.

## Measurements

| reading | value |
|---|---|
| master's tree, armed, compiled by master's seed and by this one | output byte-identical, and every `[ir]` row identical |
| shadow rows | 17,499 functions, 1,504 covered, 1,502 matched; the only change is the defaults' named classes (3,626 `expression` became 2,872 member-hook + 429 index-hook + 325 `expression`) |
| this seed | a fixpoint (two refreshes, byte-identical), and it imports nothing |
| L2 fuel with the shadow off, master's tree: master's seed vs this one | 89,549,422,001 vs 89,549,422,324 (+323) |
| `self-compile-time.sh`, shadow off | 89,590,252,550, +0.4% on the 89,252,590,514 baseline (the tree's own growth since it was written) |

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
