# A hole function handed on inside a nested list literal beside a direct call, 2026-11-10

D15637 closes; D15638 stays open with its blocker named. The pattern is #7055's (D15609). The
checker may leave a hand-on open only where the elaboration forwards it, or a check reject
becomes an emit reject.

**The elaboration first.** `elabLitFwdTargets` (emit_elab.vl) found the call a list literal is an
argument of, or the `const` it initialises. A literal nested in another found neither, so a
parameter read inside `[[g]]` forwarded nowhere. The nested literal now lands where the outer
one does, at any depth. The callee side needed nothing: `fss[0][0](x)` already reaches the
parameter through `elabSlotRoot`, and `elabHeldFnTyOf` peels every list level, so the call notes
the parameter's set.

**Then the checker.** `holeBindArgListsHole` (check_relate_core.vl) recurses into an element that
is itself a list literal. The hand-on counts as an open call, so `id` stays generic. Each call
takes its own instance, `$id` at `i32` and `$id$1` at `string`. The `--names` disassembly has no
`call_indirect` or `call_ref`: the join dispatches by tag.

**D15638, the record field.** Counting a record literal's field initialiser as an open hand-on
moves the repro to the emit reject `a generic function taken as a value reaches no call that
fixes its type`. The elaboration forwards a hand-on only through list literals, so that arm is
not shipped. The row records the attempt.

**Neighbours.** Each runs, where master refused it at the checker:
- `[[[g]]]` called as `fsss[0][0][0](x)`;
- a `const ws = [[g]]` handed on;
- `[[g], [g]]` read at index 1;
- the element bound to a `const` before the call;
- one nested literal handed to the same callee at two types.

`for fs in fss` over the parameter is refused on both sides by `for-in expects an array`, which
is unrelated.

**Population.** All 23,837 sweep programs were built with master's source and with this tree, each
by the same seed. 18,519 are byte-identical, and 5,304 fail alike. The 12 whose messages differed
print the output path or the seed size. Built to one path, 11 are identical in message and bytes.
The 12th is D12131's trap banner, which names the seed's size. The two that move are D15637's
witness and its new fixture, `functions/hole-param-called-and-handed-on-in-nested-list.vl`. Both
were refused and now run. D14041 and D14042 give the same refusals.

**Proof.** The fixpoint seed is byte-identical over two `refresh-compiler.sh` runs: 6,602,241
bytes. Seed size is +0.2%. Late demands are 6, the baseline. rep-fuzz is exact, and lint-self is
clean. The `cases_wasm` shards pass 7,403 with 0 failing. `check-filed-witnesses --strict` grades
all 4,686 rows as filed. `vl_scaling_shape_test.ts` passes.
