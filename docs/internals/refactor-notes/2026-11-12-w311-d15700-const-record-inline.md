# D15700: a `const` record of a hole handed on whole is written into its one argument, 2026-11-12

`inlineConstRecArgs` (`emit_rewrite.vl`) runs before the elaboration, from `elabPrepare` and from
emit's unprepared path. It takes a `const` record literal that meets three conditions:
- every field reads an un-annotated parameter nothing writes;
- its one read is a positional argument of a named call;
- the binding is a statement of the function's body.

The pass writes the literal into that argument and drops the binding. The literal is then
delivered where it is built, as the literal written in place is (D15649). It is built per
instance at the callee's parameter, which the late tag decision makes a set record.

## Why not the elaboration route

w318's WIP (`fb743a98`) retypes the `const` record per instance, and on its own leaves D15700,
D15639's guard and its one-instance spelling as invalid modules: two rows, `{f: i32}` and
`#anon1`. The `const`'s literal is minted at collect from the hole type, before the decision.
Neither of these changes moved that: registering the literal as an argument literal, nor
retyping the binding at its hand-on's parameter.

## Measurement

The position matrix on D15700's row, master against this change:

| cell | master | this |
| --- | --- | --- |
| D15700 | loud emit reject | runs, `2` `5` |
| k3 (two instances) | loud emit reject | runs, `2` `5` `-1` `-2.5` |
| keep (D15639's guard) | runs | runs, `10` `8` `-5` `-4` |
| k1, k2, k4, k5 | run | run, the same output |

Fixpoint seeds on both sides, over the whole sweep population: same 23,983, bytes-only 0,
output movers 1 (D15700: emit reject → runs), runs → not-runs 0, new compiler traps 0.
Capability probes: 227 of 227 run. D15639's own witness, the same `const` with a direct call of
`g`, is still its check reject.
