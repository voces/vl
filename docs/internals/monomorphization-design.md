# Monomorphization design note (native port)

The next major parity track after boxed value unions + literal unions: the
host's lazy per-callsite instantiation for functions with un-annotated /
generic params (~13 corpus files across `functions/`, `generics/`, `types/`,
`soundness/`). This note pins the host behavior so the port starts precise.

## Host model (the oracle)

- **Checker** (`typecheck.ts`): an un-annotated param types as an
  `Infer<Unknown>` hole. Holes are pinned per CALL SITE from argument types
  (the same pinning discipline `assignable` already applies to bare `Map()` /
  `[]` holes natively). `hasUnknownHole` (~1127) gates constructs whose holes
  never got pinned.
- **Emitter** (`toWasm.ts` `instantiate`, ~2413): one wasm function per
  distinct `(resolvedName, wasmParamTypes…)` key — cached in `instances`,
  named `name` for the first instance and `name$N` after. The instance is
  REGISTERED before its body compiles so recursive self-calls resolve to the
  in-flight instance. Function-local narrowing overlays are snapshotted and
  cleared around each body (a callee instantiated from inside a caller's
  narrowed branch must not inherit the caller's same-named narrowing).

## Native port shape

- **typecheck.vl**: add an Infer-hole type (mirror the existing aElem/mKey
  `-1` hole pattern); pin per call site; reject residual unpinned holes.
- **wasmEmit.vl**: the hard invariant is FUNCTION INDEX STABILITY — today
  `fnStmts` position == wasm function index, and goldens pin that. Instances
  must therefore APPEND after all declared functions (usage-gated: a program
  with no generic call emits zero instances → byte-identical). Needs:
  - an instance table `(declIx, paramKindsKey) → instanceFnIdx` mirroring the
    host's `instances` map, registered-before-compile for recursion;
  - per-instance param kinds threaded through `buildLocals`/`emitFuncCode`
    (today these read the declaration's annotations);
  - call sites resolving to the instance index instead of `fnIndices`;
  - the narrowing-overlay snapshot/clear around instance body emission
    (`narrowTop` discipline — see the host comment at toWasm.ts ~2452).
- **Type-section impact**: per-instance functypes intern at the END of the
  functype run (usage-gated, after the `typeOffset` block) — append a new
  offset term to the `mAssignTypeIndices` oracle chain, never reorder.

## Sequencing

Run SOLO (it spans typecheck.vl + wasmEmit.vl and touches the function-index
and functype-count invariants — the two chokepoints every other slice avoids).
Land AFTER boxed unions merges: several generic corpus cases also need union
boxing at boundaries, and rebasing monomorphization over boxing is the cheap
direction.
