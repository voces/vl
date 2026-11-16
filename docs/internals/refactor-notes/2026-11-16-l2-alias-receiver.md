# L2: a local alias of a parameter is dispatched per instance, 2026-11-16

The alias half of the alias-of-a-hole-parameter receiver family. The coordinator approved it
2026-11-16: (i) aliases first, then (ii) closures.

## Sizing

The rows are D2520, D3818 and D16807; D16213/D16214 match the words, not the mechanism. A
5 × 4 grid was built and run on master:
- **receivers:** the parameter, a `const` alias, a `let` alias, an alias chain, a closure capture;
- **members:** a built-in a same-named function shadows, a field call, an overloaded UFCS
  function, a map read of a function value.

The 4 parameter controls run, and field calls run in every form. 12 of the 16 alias and closure
cells were refused: built-in and overload at check, the map function at emit.

## Mechanism and change

Per-instance dispatch was keyed on the generic's own parameter name at three sites:
- `ufcsSitePinnable` (checker);
- `drwRecvIsTyParam` (rewrite);
- `monoPinnedOperandTy` (mono).

`aliasRootParam`/`aliasedParamName` (`check_call_resolve.vl`) follow a name read through a
`const`, a `let` no `=` writes (`cwDeclAssigned`, which sees writes in closures and loops) or a
chain of them, by a visited set, to the `Param` it holds. All three sites now take such a local as
that parameter.

## Measured

Against master's fixpoint seed:
- **Grid:** the 9 alias cells run. The 3 closure cells keep today's refusals; that half is
  [D16877](../inventory/D16877.md).
- **Reassigned `let`s:** written in a closure or a loop, they keep today's refusal
  (`error-member-call-through-reassigned-alias.vl`).
- **`check-filed-witnesses --strict`:** 3 rows move, D2520, D3818 and D16807, each check or emit
  reject → runs. No other row moves.
- **Fingerprint, both seeds from one worktree:** 6 of 20,756 move.
  - The 3 new cases.
  - `error-member-call-not-per-instance.vl`: `viaLocal` now runs.
  - `d16121_argument_unann`: emit reject → runs.
  - `generic-in-record-optional-call-through-hole-param-runs.vl`: same output; `take2`'s
    `const v = a` call now instances per pin.
- **Other gates:**
  - `regress.vl`: 0 runs → not-runs, 0 → silent; d16121 → runs, written to the baseline.
  - `decl-order-ab`: 16 of 5,380, 0 clause-1.
  - The 228 matrices: 0 runs → not-runs, 0 traps, 0 silent.
- **Self-compile fuel:** about +0.006% against master.
