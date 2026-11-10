# A record field's set of hole functions takes each member's instance at the call, 2026-11-10

D15644 (clause 2) and D15647 (clause 1) close.

**The gap.** `const g = if b { pos } else { big }; callP({ f: g }, 3); callP({ f: g }, 2.5)`
with `pos(v) { return v > 0 }` refused at emit ("no function value of type `(f64)=>boolean`").
Where `keep(f: (i32) => i32)` was also written, it built invalid wasm. `elabMintParamRowFactAt`
notes the fact that lets the late decision tag a set read through a record field. It found no
instance of `pos` at `(f64)`, since no direct call reaches that type, so it noted nothing and the
set stayed a closure. `callP$1` then had no closure of its signature, or, with `keep`, called a
closure of another one.

**The change.** emit_elab.vl: where a member has no instance at the call's argument types and is
a named function whose every parameter is un-annotated (`elabHoleFnDecl`), the fact mints one
there (`elabEnqueueAtParams` + `elabSettle`), as the sibling fact already does for a lambda.

**Graded** (master `0898379e` → now): D15644's repro, emit reject → runs; D15647's repro and its
`odd` spelling, invalid wasm → runs; one call at `f64` alone, three members, a second field
beside the set, and the result returned and printed by the caller, emit reject → runs; a
module-scope choice called at `3.0`, invalid wasm inside `pos` → runs.

**Not reached.** D15646 (a closure record and a set record to one hole callee) still builds
invalid wasm; it is D15640's family.

**Disassembly.** In the repros' `--names` builds `callP` and `callP$1` test the id with `i32.eq`
and call `$pos`/`$big` (`$pos$1`/`$big$1` at `f64`) directly; no `call_indirect`.

**Proof run locally.** refresh ×2 (fixpoint), distilled regress (no class moved), cases_wasm,
inventory refs/rows, check-filed-witnesses `--strict` on both inventories (4695 as filed),
scaling shape, probe rollback, pin-helper budget, rep-fuzz, lint-self, seed size (+0.2%), late
demands (6), dead-export and render-parse budgets.
