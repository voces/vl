# D15747: a returned `const` copy of a bundle holder is kept whole, 2026-11-11

Clause-2 close, split from D15744 (w315's emit-reject group A). Base is #7277's head.

`function g() { const v = c; return v }`, with `c` a module-scope holder of a bundle record,
refused like D15740 before it. Two gates, both in emit_elab.vl:

- `elabRetHolderCall` names a returned `const` copy's holder's initialising call, one copy deep.
- `elabHolderCopiesHold` counts a copy's returns among its reads, so the holder and its returned
  copy are recorded together.

D15744 keeps the cell's other ingredient, a returning lambda: its result is not followed as a
named function's is (`elabRetRecordShape`), and the call through it now reads `a function-value
call has no interned signature`.

**Sweep** (`scripts/sweep.vl`, #7277's seed against the fixpoint candidate): 0 runs → not-runs,
0 new traps; 2 output movers, D15744's witness and its distilled cell
`bundle_copy_closure_returned`, whose message changes and which still refuse (the lambda).
