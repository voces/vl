# A generic function handed on to a callee calling it at two types, 2026-11-10

D15648 and D15650 close, both clause 1.

**The gap.** `both2(g) { return c2(g, 2.5) }` with `c2(r, x) { return r(x) + r(1) }` left
`both2(dbl)` open. `vl check` accepted `const b: string = both2(dbl)`, and an un-annotated
`const` of it built invalid wasm. `g` is called at two types, so `holeBindInstance` binds no
single instance. `holeDirectCallRetAt`, which reads a direct call of an un-annotated function in
a body at its bound arguments, refused the argument because its type, `dbl`'s open signature,
still holds holes. D15650 is the same through `c2([g], 2.5)` reading `r[0](x) + r[0](1)`.

**The change.** check_relate_core.vl only. `holeDirectCallRetAt` admits an argument whose type
is a generic function's open signature (`tyIsHoleGenericSig`), bare or as a list's element.
`holeGenArgRetAt` then binds the callee's parameters to the argument types as they stand and
reads its body (`holeRetTyOf`). There each hole call takes its own instance: `holeCallInstOf`
for `r(x)`, `holeOpenFnRetAt` for `r[0](x)`.

**Graded** (master `aa36acae` → now): D15648's repro, invalid → runs `7`; with `print(b + 1)`,
invalid → runs; `print(g(1))` beside `c1(g, 2.5)` in the caller, invalid → runs; `r(x) * r(2)`
at `1.5`, invalid → runs `12`; D15650's repro and its `const` list, invalid → runs; `[g, g]`
read at `r[1]` and `r[0]`, invalid → runs. `const b: string` over both is refused as `f64`.

**Not reached.** The record spelling (`c2({ f: g }, 2.5)` reading `r.f(x) + r.f(1)`) is a loud
emit reject before and after; it is D15649's family.

**Proof run locally.** refresh ×2 (fixpoint), distilled regress (no class moved), cases_wasm and
the whole `vl_*` shard, check-filed-witnesses `--strict` on both inventories (4698 as filed),
rep-fuzz, lint-self, seed size (+0.2%), late demands (6), the dead-export, render-parse and
pin-helper budgets.
