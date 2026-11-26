# START-2: `widen radix` (2026-11-26)

Regeneration 9's class: 8 units, all in `literals/hex-width-through-assignment-value.vl`. Graded on
master with a probe-patched compiler, every unit is claimed. `nullableTail` misses `box ladder`,
another class.

`widenPlanOf`'s `radix` arm (`asgRadixWidePrim`) is an assignment of a hex literal into a wide cell,
used at a wider width. Legacy's `emitAsgRadixAs` does one of three things:
- at the cell's width, it re-reads the cell without the narrowing;
- for `i64` to `f64`, it converts that re-read;
- otherwise, it narrows and then converts.

`widenTo` now does the same. `assignValueGo`'s `reRead` arm writes the narrowing last (`RAsgUnwiden`
over the cell's read), and `radixWideRead` takes it back off the build to reach the read. The plain
arm's widening is shared as `numWidenTemp`.

`ir-parity --run-all --behaviour-only`: byte-identical. The case's 27 expected lines print unchanged.
