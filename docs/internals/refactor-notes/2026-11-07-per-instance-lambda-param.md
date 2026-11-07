# A lambda's parameter type at the instance it is nested in (2026-11-07)

`monoLamParamPinAnn` pins an un-annotated lambda parameter that rides a type parameter. The
residual of #6719 was 261 decisions in 98 programs where mono's pin is used because
`elabNodeTy(lambda, walkTop)` is open. This lane asked why D13660's `run` stays `(_) => _` at
`viaLambda<add>`.

**It does not stay open in the elaboration.** The lambda has its own instance keyed under the
enclosing one (`elabKidsAt(lambda, walkTop)`, `?#L25.0=f64`). The pin site read the lambda node's
type at the ENCLOSING key, which is the template's. `elabLamInstParamTy(lam, pi, n)` reads the
lambda's own instances under the walked instance, where they agree, else the calls inside that
instance (`elabLamParamTy`).

## Shadow

Probe at the pin, `$VL_ID_SHADOW=1`, every program of the sweep population (23,611, `vl build`
each), master `c631be4a`. The population matched #6719's: 261 open decisions, 98 programs.

| answered by | decisions | agree | differ |
|---|---|---|---|
| the lambda's instances under the walked instance | 206 | 206 | 0 |
| the calls inside it (`elabLamParamTy`) | 9 | 9 | 0 |
| nothing | 46 (19 programs) | — | — |

The 9 are 5 with no kid and 4 where the walked instance holds TWO kids of one lambda that
disagree: in `hole-lambda-calls-per-instance.vl`, `mk<i32>` holds `c` at `i32` and at `string`.
The string kid is a stray (`mk<i32>`'s body never calls `c` at string); it is not traced here.

The 46 all pin at `i32`. Each is a hole function in a tagged set (`a.map((f) => f(3))` over
`[inc0, dbl]`, D9230), where mono's pin is the set's index rep. That is a rep fact, not this one.

The 50 decisions where the elaboration's node type was already closed also agree (0 differ).

## The kid is a CALL key, not the parameter's type in the instance

Taking the fact wherever mono's substitution had no pin moved 4 sweep programs `runs →
compiler_trap` (`nested-capture-per-pin-clone.vl`, `nested-capture-argument-hop.vl`,
`nested-capture-sibling-frame-names.vl`, D1795). Witness:

    function h(n) {
      function k(x) { return x + n }
      return k(1)
    }
    print(h(2.5))

`h<f64>`'s kid of `k` holds `x = i32`, the call's argument type. Mono leaves `x` unpinned, and the
shared body types `x + n` at `f64`. Pinning `i32` gives `expected i32, found f64` inside `k`. So
the fact is read only where mono's binding pins the parameter. The two agree there, 215 of 215.

## Status

- The pin reads `elabLamInstParamTy` where the binding closes. The sweep is byte-identical
  (23,611 same) on fixpoint seeds of `c631be4a` and the candidate. Seed +1,032 bytes.
- `monoLamParamPinAnn` stays for the 46 set-index pins, plus the decisions where the binding
  leaves the parameter open. There the kid holds the call's argument type, and the parameter
  in the instance needs its join with the body.
