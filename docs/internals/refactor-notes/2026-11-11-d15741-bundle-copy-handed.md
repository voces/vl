# D15741: a `const` copy of a bundle holder is handed on as the holder is, 2026-11-11

Clause-2 close, from w315's emit-reject group A. Base is #7263's head. No emit_mono.vl change:
the orchestrator cleared a minimal `monoBundlePin` change, and none was needed.

`const c = lap((a) => a + 1)` is a bundle record (lap calls its parameter at two signatures and
returns it). `take(c)` runs because the elaboration notes the record `c`'s hand delivers, which
`monoBundlePin` reads. A `const v = c` copy was admitted only when every read of it was a call
through it, so `take(v)` reached mono's unsupported-argument floor.

- `elabHolderCopiesHold` (emit_elab.vl) admits a copy's hands by the rule the holder's own take
  (the whole record, or its member), and a module-scope `const` holder's copy in any function
  (the rule D15740 gave the holder's returns).
- `elabHolderRecordWith` records each copy's hands as the holder's: the record (`elabArgRecs`) or
  the member (`elabHandMembers`).
- A linked group's copies keep the old rule (no hands), since that path records no hand.

Not reached: a copy of a copy (D15746).

**Sweep** (`scripts/sweep.vl`, #7263's seed against the fixpoint candidate, 23,917 programs):
23,915 same, 0 bytes-only, 2 output movers (D15741's witness and the distilled cell
`bundle_copy_closure_handed`, emit reject → runs), 0 runs → not-runs, 0 new traps.
