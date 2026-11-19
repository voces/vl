# IR: one builder guard for a valued `if` below a node's lead (2026-11-19)

A valued `if` (`a && b`, `a || b`, `if c { x } else { y }` in value position) is a statement-level
node whose value waits on the stack. Any consuming node that writes a receiver or an earlier
operand at its use before reaching that value puts it above, out of order, and the lowering
misses. Three builders guarded that position by hand (a call's later argument, a map store,
`push`). Six more had the hazard live on master: an element store's index and value, a binary
op's right side, list and union `==` right sides, a string method's arguments, and a numeric
intrinsic's later arguments. Each built, then failed to lower, an armed `fail` on a claimable
function. None was in the corpus or the self-build, so the sweeps read 0.

`ifBelowLead(b, at, why)` is now the one check: a builder records `at` after the parts its node
writes first and asks it after building the rest. A valued `if` as the first operand written
stays covered. Witness: `tests/vl_ir_shadow_test.ts`, "a short-circuit operand below a node's
lead", one function per position. It fails (claimable fail) on the #9090 seed and passes here.
