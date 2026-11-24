# `arm site operand`, part 1: a narrowed receiver is its name (IR-C1)

`arm site operand` was 2 functions on master 0319020c, both exposed by #9782. A probe compiler,
never committed, named each one's half.

- `list-union-length-through-hole` `__lambda_0`, `(a) => if a is string { 0 } else { a.length }`:
  the receiver is `stage v0`, the narrowed read of the parameter, built as an `RStage` over the
  plain parameter variable. `RStage` lowers as its operand alone ("the same box"), and legacy's chain
  re-reads the name in each arm (`armRecvPush`, `emitExpr(recv)`).
- `list-union-element-through-hole` `last` (`a[a.length - 1]`): a non-atom index. Its fix is the
  queue-acked Q57 exception (built once ahead of the chain). It is held as a second PR, stacked on
  IR-P1's shadow subtraction of `ir-divergence-baseline.txt` (queue ruling (a)).

This PR is the first only: `armSiteRead` takes a named receiver built as an `RStage` over a
re-readable variable as that variable (`stagedVar`), and drops the stage's `SLet`, the last node
built. It is byte-identical. The lambda is dead in the final module (dead-function elimination
stubs it), so the identity readings, which compare before that pass, are its proof.

## Legacy tails the IR calls

None.
