# A maker's lambda as a bundle record — design, 2026-11

Family C: D16845, D17045, D16819, D16079, with D17129, D17174 and D17175 folded in. A maker
returns a hole lambda it creates, directly or through a local `const`. One call's value is held,
and the holder is called at two signatures. The design owes a closure per signature, with the
captures taken once (D16845's contract). Widening the lambda's parameter to the join would break
the directly bound lambda's contract, `const f = (a) => a / 2; f(3); f(3.0)` printing `1` then
`1.5`.

Status: draft. The template is committed; nothing else is built.

## The family is three shapes, not one

Each row's witness was re-run on master, then its neighbours:

* **One held value at two signatures:** D16845 and D17045. This note is about them.
* **D16819 is a different defect.** Each holder is called at one signature, but there are two
  maker instances (`adder(2)`, `adder(1.5)`), and the lambda is returned through a local `const`.
  * The same program returning the lambda directly runs (`5`, `3.5`).
  * One instance through the `const` runs.
  * Only the per-instance `const` delivery fails. No record is needed.
* **D16079 is the record on the parameter side.** `run(f)` calls `f()(1.5)` and `f()(41)`, and
  `f` is `() => inc`. Each call of `f` returns the one value `inc`, used at two signatures, so
  `f`'s result must be a record. With `f` bound to a module `const`, it runs (`2.5`, `42`); with
  one call, it runs (`43`).

## The template, and what it grades today

`scripts/capability-probes/matrix/maker-fresh-lambda-held-at-two-signatures.matrix.vl`: `__mk`
returns `(a) => a + 1`, and the proof calls one held value at `4` and `1.5`.

* **Base:** 37 cells run; 29 un-annotated cells refuse. The annotated face spells one signature,
  so it runs.
* **The refusals, by position:**
  * `function-value call has no interned signature`: the holder rows (`binding`,
    `closure_capture`, `local_assign`, the `block_*`, `fn_body*`, `is_in_*`, `else_if`,
    `two_instances`), plus `return_inferred`, `struct_field_*`, `global_*`.
  * The container rows refuse with their own sentences: `array_element*`, `map_*`.
  * `argument` and `early_return_guard` stop in `monomorphize`.

The neighbouring templates, where each signature gets its own maker call, run in every cell:
`plain-maker-hole-lambda-at-two-signatures` 48 of 48, `capturing-maker-…` 48 of 48. So the gap
is one value at two signatures, not the maker. `returned-bundle-record.matrix.vl` (D15144's
record) runs in all 66 cells.

## The shape

Make the maker's call a producer of D15144's record. After that, every consumer that record
already reaches (holder, capture, hand, return, container) is reused unchanged.

* **elab, the fact.** Today `elabReturnedBundleSigs(k)` gives the record an instance returns, but
  only from a returned bundle *parameter*, whose signatures come from the callee's own calls. A
  maker's signatures come from the other side: the calls through the holder of each call of the
  instance. The new fact: for an instance whose return leaves are a hole lambda literal, the
  signatures every holder of its calls is called at, each closed under its caller's instance.
* **mono.** The instance's result is pinned at the record's row, and the returned lambda is built
  at each signature (`monoBundleFe`, keyed by the instance).
* **emit.** The maker's return of the literal writes the record, as `emitBundleArg` does for a
  bundle argument. The captures are read once, into each closure.

## Questions for the coordinator

1. **Signature source, per instance or per call site.** One maker instance serves every caller.
   Either the instance's record is the union of its holders' signatures, each holder picking its
   members (`elabCallSigMember` works on a superset), or the instance splits per signature set.
   Proposal: the union. A split makes mono key instances by a demand.
2. **All or nothing per instance.** Once the instance returns a record, a caller that used its
   value as one closure must pick a member, and some positions refuse that today (slice A's "not
   used at one of them"). Proposal: convert an instance only when every call of it is accepted,
   so no cell goes from runs to not-runs.
3. **Slices.**
   * C0 is D16819 alone, the per-instance `const` delivery, with no record.
   * C1 is the holder rows above plus `return_inferred`.
   * C2 is containers, globals and `argument`.
   * D16079 follows C1, on the parameter side.
   * D17129, D17174 and D17175 sit on the field-read path, so they land in C2 unless C1's fact
     reaches them for free.
