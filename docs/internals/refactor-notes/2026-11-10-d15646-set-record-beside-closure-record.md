# A set's record and a closure's record handed to one hole callee key two instances, 2026-11-10

D15646 closes.

**The gap.** `run(b) { const g = if b { id } else { dbl }; call0({ f: g }, 3) }` beside
`call0({ f: inc }, 3)`, with `inc(v: i32)` and `call0(r, x) { print(r.f(x)) }`, built invalid wasm.
The instance `call0({ f: inc }, 3)` reaches, `K2`, is also the set's closure-rep instance. It
never calls through the set, so the partial rule in `elabMintFactsPass` left `{id, dbl}` untagged,
and mono merged the set's instance into `K2`. None of the rule's exemptions read a field or an
element of the parameter, and each stops at the rep-row guard.

**The change.** emit_elab.vl: `elabKeyCallsHandRecClosure` exempts an instance every call of
which names the function and hands, at the parameter the field (`r.f`) or element (`l[0]`) call
reads, a record or list literal holding there only lambdas or named functions with every parameter
annotated, none of them in the set (`elabClosedFnOutside`). It has no rep-row guard: once the set
is tagged, the direct call keys the instance by the set (`elabSetRepRow`'s `direct` arm), so the
rep row no longer joins the closure record's instance.

**Graded** (master `2e71e5a1` → now): the repro, invalid wasm → runs `3` `4`; the lambda field
`{ f: (v: i32) => v + 1 }`, invalid wasm → runs; the set called at `f64`, invalid wasm → runs; the
list spelling `callL([g], 3)` beside `callL([inc], 3)`, trap → runs; both `3` and `2.5` through the
set beside `{ f: inc }` runs; the un-annotated `inc2(v)` runs as on master.

**Disassembly.** In the repro's `--names` build `call0` tests the id with `i32.eq` and calls `$id`
and `$dbl` directly; the one `call_indirect` left is `call0$1`'s, through `inc`'s closure.

**Proof run locally.** refresh ×2 (fixpoint), distilled regress (no class moved), cases_wasm,
inventory refs/rows, check-filed-witnesses `--strict` on both inventories (D15646 runs, as
filed), scaling shape, probe rollback, fn-ret shadow, pin-helper budget, rep-fuzz, lint-self, seed
size (+0.4%), late demands (6), dead-export and render-parse budgets.
