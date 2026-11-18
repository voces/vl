# Per-instance containers in hole templates: the implicit-hole design (D16976, parked)

Lane F2, 2026-11-18. Parked by the coordinator behind open clause-1 rows; the prototype is on
`f2/d16976` (WIP commits, measurement only).

## The problem

#9029 (D16603) re-asks a hole function's demands, at its second and later calls, with each open
empty list it allocates replaced by a fresh open copy. It works only where the delivery itself
closes the binding: an empty `[]` (or an un-annotated binding of one, read nowhere else) handed
straight to a call through the template's own parameter. `Map()`, a list nested in a record, a list
relayed to another hole, and a list the template also reads (`h(a); a.length`) are excluded,
because the emitter types them from the template.

## What the prototype measured

1. **Freshening the first call too** (so the template is never pinned in place) leaves the
   template's container open; the checker then defaults its hole to `i32` in place after the check,
   so the template node reads `i32[]` and looks closed.
2. **Carrying each call's copy to the elaboration** (`callBindAdd(ix, "$open<type>", copy)`, kept by
   `elabCanon`, substituted in `elabSubstOpen`/`elabNodeTy`, and asked by `scopeTyAt` in such a
   frame) makes the instance's *local* the right list (`struct.new` of the instance's row).
3. **It is not enough.** `a.length` still reads the receiver at the template's (defaulted) row: the
   member-read lowering takes the template node's type directly. The emitter has many such direct
   readers (receiver kinds, field rows, constructor shapes). `Map()` still fails emit (`no $fnsig`);
   record-nested and relayed lists still build invalid modules.

## The design (not built)

An empty container allocated in a hole template is an **implicit hole of that template**, bound
per call like a hole parameter:

- After the template body check, an allocation whose element (or key, value) is still open is typed
  with a fresh type variable — an implicit hole name keyed by the allocation node — instead of
  being defaulted.
- Each call's solve binds that name (from what the call's demands pin it to) in the call's bindings.
- Mono keys instances by it and re-records instance node types where it is substituted
  (`monoSubstLetType`, `monoCopyOf` + `nodeTyRecord`), as for any hole parameter; the elaboration
  closes every read through `elabSubstOpen`. Every emitter reader of a template node type is then
  served by the existing per-instance machinery, not a side table.
- It deletes #9029's freshening (`instFreshTy`, `instAllocs`, `instFreshByCall`, the `substTyDeep`
  hook) and its scope conditions; a module-level allocation is no template's hole and stays shared.

Cost: hole typing after the template check and per-call binding from demands (not arguments) in
the checker; mono keying. Multi-PR. Measure instance-count and fuel growth on the self-compile and
corpus before building out. D16986 (`Map()` handed to a generic) and F1's census bucket (iii) sit
on the same "hole typing per call" ground and should use this mechanism rather than a second one.
