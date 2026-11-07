# Three blocked mono functions, re-graded against identity typing (2026-11-07)

After identity typing slice 2a (#6699; slice 2b, #6707, not on master), each function was
re-shadowed against what the elaboration answers now: `elabIdentityFnTy`, `elabValueInstSig`,
`elabInstNodeTy`, `elabNodeTyAt` and the callee instance's parameter type at the call
(`elabCallParamTyFrom`). Counter rows were printed through `$VL_ID_SHADOW=1` from a one-level
instrumented seed of master `30d4bfd2`, over the sweep population (23,610 programs, `vl build`
each). Columns: agree / differ / mono only (no fact) / elaboration only.

## `monoCoerceListCbArg`: callback half switched, function stays

The 88 callback signatures mono derives (elaboration made no instance, 34 programs):

| reader | agree | differ | mono only |
|---|---|---|---|
| `elabIdentityFnTy(cb, ctx)` | 67 | 1 | 20 |
| `elabValueInstSig`, `elabInstNodeTy`, `elabNodeTyAt` | ≤ 19 | 0 | ≥ 69 |

This PR reads the identity type first where it is a closed function type. The one differ is
`closures/hole-lambda-relaying-i32-at-f64-fn-type.vl`'s `[1, 2, 3].map(f)` with
`f: (a: i32) => f64`. The identity is the declaration, and mono derived `(i32) => i32` from the
body, but both lead to the same instance, so the module bytes are identical.

The 20 decisions in 8 programs that are still mono-derived are a TYPE fact:
- 10 are hole functions in a tagged set (`((_) => _) => i32`, D9761);
- 10 are generic `(T) => T` choices with no instance at the element
  (`closures/fn-choice-bound-in-generic-two-instances.vl`).

The receiver half has 1 mono fallback left (`arrays/list-join-widening-literal-arms-runs.vl`,
`i32[]`, no fact). It had 28 at the evening census.

## `monoArgClosedTyIn`: blocked, on a REP fact

There are 30,088 pin-closed decisions in 5,485 programs. Mono's pin is the argument's own type,
which `elabIdentityFnTy` matches in 29,656, except where the call delivers the argument
at the instance's parameter: D5930's `outerI` builds `[v]` at the callee's `f64[]`, and
`idn({r: 4})` into `J | string` passes at `T := J`. There the callee instance's parameter type
matches (292 of 326) and the identity cannot. No single reader reproduces the pin:

| rule | agree | differ | no fact |
|---|---|---|---|
| identity type | 29,656 | 326 | 106 |
| callee instance's parameter type | 26,865 | 804 | 2,419 |
| instance parameter where the callee parameter is a bare `T`/`T[]`, else identity | 29,765 | 219 | 104 |

The best rule's 219 differs are joins. Where `T` is bound over several arguments, `i32` with
`f64` (D2459) or `null` with `string` (D3991), the instance's parameter is the join while mono
pins each argument at its own type. Both readers give correct TYPES. What is missing is
whether the call converts the argument into the instance's parameter or hands it over at its
own rep: a per-argument delivered rep at the call key (rep layer). Witness: D5930's
`hole-leaf-literal-through-forwarder` (`f64[]` delivered) beside D2459 (`i32` handed over,
`f64` bound).

## `monoLamParamPinAnn`: blocked, on two TYPE facts

There are 261 decisions in 98 programs where mono's pin is used (elaboration open). Only 8 have
any fact (`elabValueInstSig`, which agrees). The rest:
- **158 in 65 (per-instance identity residual, 4b-i).** A hole lambda called in an instance
  body keeps parameter `_`. D13660 / `closures/captured-hole-fn-handed-on-by-nested-fn.vl`:
  `const run = (x) => { apply2(h, x) }` then `run(1.5)` in `viaLambda<add>`. Mono gives
  `f64`, `elabInstNodeTy(lam, k)` gives `(_) => _`, and no instance key is noted for `run`.
- **95 in 40 (holder fact, c2).** A lambda written into a `let` holding a generic function has
  no node type at the instance. D14501: `let k = other; k = (n) => …; [k][0](x)` in `g<T>`.
