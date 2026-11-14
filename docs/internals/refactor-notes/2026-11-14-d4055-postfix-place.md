# D4055: postfix `++` on a place is the prefix form under the postfix wrapper

**Change.**
- `parser.vl`: a field or element operand of postfix `++`/`--` desugars to `mkPreIncr`'s compound
  write (one place node) inside the postfix `Unary`; any other operand keeps a parse error, which
  now names a name, a field or an element.
- `emit_rewrite.vl`: `spillCompoundPlace` sees through the postfix wrapper, so a statement
  `xs[k()]++` spills the effectful index once, as `++xs[k()]` does. A compound write used as a value
  whose place is not re-readable ran the effect twice on master for `++p` and `p op= v` (D16217);
  `drwCompoundValueSpill` spills it inside a value `if true { … } else { <zero> }`, so it runs
  once and in order. A write whose type has no literal for the dead arm keeps an emit refusal.
- `wasmEmit.vl`: the postfix value undoes its step at the place's width (D16216), not always `i32`.

**Measured.** `postfix-incr-place.matrix.vl` (new, 15 cells), master fixpoint against this
branch's: 0 runs → not-runs, 0 silent; 11 cells move from the parse refusal to runs, the two D16217 value cells from a silently wrong count to runs, and the two
`f64`/`i64` name cells from check-clean invalid wasm to runs, both faces.

**Tests.** Four parser-recovery fixtures and two TS recovery tests used `o.x++` as their stock
postfix error; they now use `(1)++`, which stays one.

**Size.** +53 net compiler lines (3 files); pin-helper delta 0.
