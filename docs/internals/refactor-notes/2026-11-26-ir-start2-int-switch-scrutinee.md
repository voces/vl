# START-2: `int switch scrutinee` (2026-11-26)

Graded on master with a probe-patched compiler, the class's one program
(`loops/jump-from-value-arm.vl`, `denseMatch`) is fully claimed.

In a fully unrolled range copy the loop variable reads as the copy's constant (an immediate). The
switch builders required a place's variable, since legacy reads the scrutinee twice when wide; the
`br_table` lowering emits its operand through `irLOpnd`, which writes an immediate just as well.
`intSwitchOn` admits the immediate beside a place's variable, at the valued and the statement
switch.

`ir-parity --run-all --behaviour-only`: byte-identical on the program and on the sweep, which
misses `int switch scrutinee` three times on the earlier probe.

Left open: a valued `match` as the right operand of a start-body `+` after a read (`t = t + match k
{…}`) falls back with `non-stack temp: out of order`; it missed on the scrutinee before.
