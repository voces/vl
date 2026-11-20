# IR coverage step: a field store of a short-circuit value, 2026-11-20

Lane F2, to IR-REV's design check (part A of the short-circuit operand family). Measured on fixpoint
seeds of this branch and of its merge base, master `544e059a0`, each building this branch's source.

## Why this class

`field store short-circuit operand` held 9 self-compile functions (6 alone with a local or
parameter receiver, 3 with a global or temp). Legacy writes `r.f = v` as the receiver, then the
value, then `struct.set`; when the value is a short-circuit, the IR writes its valued `if` as a
statement ahead of the store, so a receiver read at the store would sit above the value.

## What landed

The store routes its receiver through #9227's `stageLeadArgs`, as call arguments do: a receiver
variable becomes a staged `sgV` temp at its own start, so the lowering writes it below the `if`, in
legacy's order; a receiver already a temp (a global read, a call result) is built ahead and sits
below as it is. The miss is then `ifBelowLeadOf` over the staged receiver; a boxed `??` in the value
still misses, as `stageLeadArgs` declines it. No new node.

## Coverage

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions covered | 18,529 | 18,538 (+9) |

Witnesses (`vl_ir_shadow_test`): a local, a parameter, a global and a call-result receiver, each
storing `p && q` or `p || q`, covered and matched; prints `true true false false`.
