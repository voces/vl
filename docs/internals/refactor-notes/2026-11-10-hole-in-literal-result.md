# The result of a call handing a generic on inside a literal, 2026-11-10

D15645 closes. D15648 (clause 1) and D15649 (clause 2) are filed for neighbours this does not reach.

**The gap.** `function both1(g) { return c1([g], 2.5) }` with `c1(r, x) { return r[0](x) }`
left `both1(dbl)` open, so `vl check` accepted `const b: string = both1(dbl)` and `b + 1`
built invalid wasm. `holeBindForward` counts a hand-on inside a list literal as an open call
(D15609), so `holeBindInstance` found no instance of `g`, and the call's `HD_RET` result
substituted to `dbl`'s own open return.

**The change.** check_relate_core.vl and check_calls.vl, the checker only:

- `holeLitFwdRet`, read where a call's result stays open after `holeRetTyOf`: each generic
  argument is re-bound to the one instance the calls through it take, with `holeBindForward`
  following a literal hand-on (`holeBindLitForward`): a direct list element or record field,
  or a `const` list, handed to an un-annotated parameter whose every read in the callee is a
  call of an element or of a field holding the hole (else it stays open). A result read off one
  hole call (`HD_RET`) takes that call's instance alone (`holeBindOnlyCall`), so a call at
  another type beside it does not open it.
- The read is pin-quiet (`holePinHeld`). Following the hand-on in the binding itself, or banking
  its pins, changed what the elaboration bound: the first left the tag decision unsettled (an
  internal emit failure) and the second turned `print(both1(dbl))` beside `print(g(1))` from
  runs into an emit reject. As shipped the argument stays generic and the dispatch is master's.

**Graded** (master `ee66b4ec` → now): the repro, invalid → runs `6`; the record spelling, a
`const` list, both a list and a record holding the hole, `[dbl, g]` read at `r[1]`, each
invalid → runs; the hole also called at another type in the caller, in the callee, or through
the `const`, invalid → runs; `const b: string = both1(dbl)` and the record twin, accepted →
refused as `f64`, as `c1([dbl], 2.5)` is. `print(both1(dbl))` runs as on master.

**Not reached.** D15648: a result joining two hole calls at different types (`r(x) + r(1)`)
stays open, with or without a literal. D15649: a record hand-on to one callee beside a list
hand-on called at two types to another is an emit reject on master and still is.

**Disassembly.** In the repro's `--names` build `c1` reads the set id and calls `$dbl`
directly; `b + 1` is an `f64.add`.

**Proof run locally.** refresh ×2 (fixpoint), distilled regress (no class moved), cases_wasm,
inventory refs/rows, check-filed-witnesses `--strict` on both inventories (4697 as filed),
scaling shape, probe rollback, rep-fuzz, lint-self, seed size (+0.2%), late demands (6), the
dead-export, render-parse and pin-helper budgets.
