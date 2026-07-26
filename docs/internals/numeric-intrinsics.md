# Numeric-opcode intrinsics

The operations that **are** a single wasm instruction. There is no runtime behind them, only an
opcode, so they live in the compiler rather than in `std/`: the checker types the call and the
emitter writes the byte.

Motivated by `docs/webcraft-requirements.md` §P0.3/§P0.4, whose author calls these "the *entire*
math library webcraft needs from the language".

## The surface

| VL | wasm | VL | wasm |
| --- | --- | --- | --- |
| `f32bits(x: f32): i32` | `i32.reinterpret_f32` | `f64bits(x: f64): i64` | `i64.reinterpret_f64` |
| `f32fromBits(b: i32): f32` | `f32.reinterpret_i32` | `f64fromBits(b: i64): f64` | `f64.reinterpret_i64` |

Float, one name per operation with the width taken from the operands — `sqrt`, `abs`, `floor`,
`ceil`, `trunc`, `nearest` (1 argument); `min`, `max`, `copysign` (2). Integer, likewise —
`clz`, `ctz`, `popcnt` (1); `rotl`, `rotr`, `divU`, `remU` (2, yielding the operand width);
`ltU`, `leU`, `gtU`, `geU` (2, yielding a `boolean`).

`clz`/`ctz`/`popcnt` at i64 yield an **i64**, because `i64.clz` does. The rule throughout is that
the VL signature is the instruction's signature; nothing is adjusted for taste.

## The four decisions

**Spelling: free functions.** Every numeric-adjacent builtin VL already has is a free function —
`toString(x)`, `fromCodePoint(cp)`, `fromCodePoints(xs)`, `print(x)`, and the raw-floor
`__load_i32__(a)` / `__store_f64__(a, v)` / `__array_new__(n, f)` / `__trap__(msg)`. **There is not
one builtin method on a numeric receiver anywhere in the compiler**; the builtin methods that exist
are on `string` (`.length`, `.slice`, `.indexOf`, `.includes`, `.charCodeAt`) and on arrays — that
is, on containers. A method spelling would have been the first of its kind, and the consumer spec'd
free functions besides. UFCS (`x.sqrt()`) is a separate question: it resolves only to a real
`self`-function declaration, so it does not reach these, and nothing here forecloses adding it.

**Home: the compiler, not `std/`.** A std function needs a body; these have no body, only an
instruction. The rule the code actually follows — read off the builtin surface, not off a comment —
is *raw-floor machinery is dunder-spelled, ergonomic total functions are bare*: `__trap__`,
`__store_i32__`, `__array_copy__` are unsafe or address-level; `print`, `toString`, `fromCodePoint`
are safe, total and user-facing. `sqrt` and `f32bits` are safe and total, so they are bare.
(`docs/error-handling-design.md` states VL "deliberately has no intrinsic functions outside the
`__dunder__` convention". Six shipped bare-name builtins say otherwise; the ruling it was recording
is narrower — *don't mint a new bare name for an abort primitive* — and that reading is preserved
here.)

**Overloading: by operand width, not by a second declaration.** VL has no overload resolution and
none is added. There is one precedent for argument-type-directed behaviour — `toString(x)` accepts
an i32 or a boolean and picks its lowering at emit — and this follows it: one name, one checker arm,
and the width chosen from the arguments. The rule is the **binary operators' own**: f32 when an
operand is genuinely f32 and neither side is a genuine (non-literal) f64; a bare float literal
adapts down, so `min(x, 0.5)` over an f32 `x` computes in f32 exactly as `x * 0.5` does. Integer
ops take i64 when an operand is i64. All-integer operands land on f64 for a float op, where they
widen losslessly — `sqrt(2)` is the f64 square root, as `2 / 1.0` is f64 division. The checker and
the emitter derive the width from the same facts (the checker from the argument types, the emitter
from `exprIsF32`/`exprIsI64` + `binMixHardF64`, whose typed-IR fast path reads the very types the
checker recorded), so they cannot disagree where the checker recorded a type.

**Unsigned integer ops: operations, not a type.** An `i32` **is** signed in VL — `/` is `div_s`,
`<` is `lt_s`, `>>` is `shr_s` — and the unsigned instructions read the identical bit pattern under
a different interpretation. VL already settled this shape when it spelled the unsigned shift as the
operator `>>>` rather than introducing a `u32`. `divU`/`ltU` are that decision continued, and they
cost no new type, no new widening edge, no second integer rep, and no change to any existing
program. A `u32` would touch the type arena, every rep table, every widening rule and every emitter
kind code, to express something the operand does not need to carry.

## Shadowing

An intrinsic is a **fallback for a name the program did not define**. The checker skips its arm when
the name is a declared function or any in-scope binding (`numIntrShadowed`); the emitter reaches its
arm only where the direct-call lookup and the closure-value lookup both failed. So a program with
its own `function min(a, b)` keeps calling its own — which matters, because `min`/`max`/`abs` are
among the most common user helper names, and `tests/cases/functions/inferred-compare.vl` already
defines two of them.

This is the opposite of the behaviour the *existing* intrinsic family has: a program that defines
`function __load_i32__(a: i32) { 7 }` and calls it gets `0` — the emitter's arm wins and the
function is silently dead. The dunder spelling makes that unlikely rather than impossible.

## What is deliberately absent

`sin`, `cos`, `atan2`, `pow`, `exp` and every other transcendental. **No wasm opcode computes one**,
so any implementation is a library whose last bit is a policy choice — and a program that must match
another implementation exactly has to own that choice itself. Providing one would not save such a
program work; it would give it a trap to avoid. A future `std:math` for other users is a separate
question and nothing here forecloses it.

## Where the code is

- `compiler/typecheck.vl` — `numIntrShadowed`, `bitcastArgTy`/`bitcastRetTy`/`bitcastCallTy`,
  `floatIntrArity`/`intIntrArity`/`intIntrIsCompare`, `argForcesF64`, `floatIntrWidth`/`intIntrWidth`,
  `numIntrCallTy`, and the arm in `checkCallNode`; `isNumIntrinsicName` is the exported predicate.
- `compiler/wasmEmit.vl` — the opcode tables (`floatIntrOpF32`/`floatIntrOpF64`/`intIntrOpI32`/
  `intIntrOpI64`), `emitBitcastIntr`/`emitFloatIntr`/`emitIntIntr`, and the arm in `emitCall`.
- `compiler/emit_sections.vl` — `scanPrintUse` reads an intrinsic call's own recorded type, because
  an intrinsic RESULT scalar appears nowhere as an annotation.
- `tests/cases/numerics/bitcast-*.vl`, `float-opcodes-*.vl`, `int-*.vl`.

## Known limitation — capture analysis mistakes the name for a variable

The emitter's capture analysis (`capScan`/`capRecord`, `compiler/emit_classify.vl`) records every
free identifier that is not bound locally, not a module global, and not a collected function. An
intrinsic is none of those, so its **name** rides the capture list and the env build has nothing to
read it from. Two shapes hit it, both **loud rejects, never miscompiles**:

1. a lambda body that calls one — `xs.map((v: f64) => sqrt(v))`;
2. an **ordinary named function** that calls one, in a module that also uses a function value
   anywhere — because such a module routes every "capturing" function through its closure env
   (`emitCall`: `fnValUsed && captureCountOf(target) > 0`). Remove the lambda and the same file
   compiles.

A generic function whose body calls one, instantiated at **two** types, is rejected by a third path
(`emit_mono`'s single-type capturing-lambda guard) with a message about lambdas.

This is the whole declared-intrinsic family's pre-existing shape — `__load_i32__` fails identically
on master in all three — but it is a real limit and worth fixing.

> **Census (webcraft P0.2 slice).** The memory half of that family has since been measured
> exhaustively: all **ten** lowered memory intrinsics (`__store_i32__`, `__load_i32__`, the seven
> load widths, `__memory_size__`/`__memory_grow__`) in **four** call positions. The result is
> uniform — 10/10 work at top level and in a plain named function, 10/10 fail in the two positions
> above — and `__log__` passes all four as the control, because it is on `isBuiltinFnName`'s list
> and these are not. So "the whole declared-intrinsic family's shape" is exact, not approximate,
> and the one variable really is that list. What changed is the STAKES: every `Buffer` method would
> be a named function wrapping one of these, so `buffer-design.md` O7 is now on the critical path
> for `std:buffer` rather than being a curiosity. See `buffer-design.md` §H5.

**The naive fix is wrong.** `capRecord` has a builtin-name exemption (`isBuiltinFnName`,
`compiler/emit_base.vl`) and adding these names to it would work for calls — but that list is
consulted *by name*, after only `capIsBound` (names bound inside the lambda), `globalIndexOf` and
`fnIndexOf`, none of which cover an **enclosing frame's local**. So it already breaks a genuine
capture of a same-named local:

```vl
function go(): i32 {
  const toString = 5
  const f = () => toString + 1
  return f()
}
```
is rejected on master (`identifier is not a parameter, local, or global`) because `isBuiltinFnName`
swallowed a real capture. Extending that list to `min`/`max`/`abs`/`sqrt` — names far likelier to be
locals than `toString` — would widen a live bug.

The correct fix is positional, in `capScan`'s `Call` arm: a builtin or intrinsic in **callee
position** is a lowering target, not a value, so skip that callee `Ident` rather than filtering the
name everywhere. (A callee that is a captured closure *variable* of the same name still needs the
enclosing-frame check, so the arm should skip only where no binding could resolve it.) That also
fixes the `toString` case above.
