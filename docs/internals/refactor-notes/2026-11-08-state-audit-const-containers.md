# The state audit reads written `const` containers (2026-11-08)

Follows `2026-11-08-unionbox-record-leak-arguments.md` (#6759), whose `lpExits` leak the audit
could not see: `scripts/emitter-state-audit.vl` read only `let`s, and a module `const` bound to a
list or map that gets written is state with a lifetime too.

## The rule

The audit now reads every `^(export )?const NAME = [..] | Map(..) | Set(..)` in every
`compiler/*.vl` (the `let` half stays scoped to the emitter modules). A write is a `push`, `pop`,
`set`, `delete`, `unshift`, `clear`, an index store, or a bare argument at a parameter position the
callee mutates in place (derived from every function's own body, one level). A written container
is safe when one of these holds, and `--check` refuses the rest:

| kind | how it is decided |
| --- | --- |
| prologue / pass / frame / inner | a function empties it (`.clear()`, `while C.length > 0` popping); kind of that function, as for a `let` |
| init | every write is at module scope |
| balanced | every write is a push or pop, and each push is followed in its own function by a pop with no `return`, `break` or `continue` between |
| stamped | `STAMPED`: guard is a `memoGenNew` generation, a `let` only ever written `g = g + 1`, or a stamped companion; checked |
| scoped | `SCOPED`, reviewed: enter/leave pairs, mark-relative trails, frame marks, scratch below a height, logs undone where written |
| instance | `CINSTANCE`, reviewed: tables built once from constants, text interns, source-keyed caches, the memo registries |

A list entry naming no written container, or one a rule already covers, stops the audit, so the
reviewed lists cannot go stale silently.

## Counts, on this tree (master `4d0f7cf4` plus this PR)

256 container `const`s, 157 written: 3 prologue, 2 inner, 31 balanced, 44 stamped, 37 scoped,
40 instance, **0 NEVER**. Before the fixes, 5 were NEVER:

| container | module | verdict | fix |
| --- | --- | --- | --- |
| `lpExits` | check_if_value | leak, witnessed by #6759 | #6759's own fix, carried identically |
| `scWrPlaces`, `scWrTys` | check_narrow_flow | node-keyed, nothing resets | `let`, `scWrReset()` in `checkProgramPass` |
| `idShadowReads`, `idShadowRows` | id_shadow_state | node-keyed / report rows accumulate | `let`, emptied in `setIdShadow` |

No two-program witness for the last two. `scWrFacts` reads `scWrPlaces[cond]` for a `&&`/`||`
cond, and `checkLogicalBinNode` re-keys every one it checks, so a stale row needs a short circuit
narrowed in a program that never checked it; I found no such program. The shadow's notes are
read only by the emitter with `$VL_ID_SHADOW` set, and `vl check --batch` never emits. Both are
leaks by the rule and cheap to close.

## Controls

* `--without-reset dgLosslessReset` turns ast.vl's three brace tables NEVER (exit 1).
* `--dir <copy of compiler/>` with `lpExits` reverted to #6759's parent (`const`, no reset) names
  `lpExits check_if_value.vl:` and exits 1. Both are in `tests/vl_emitter_state_audit_test.ts`.

## Gate

`--check` already runs in CI's `checks` job (`ci.yml`, "Emitter state (invariant)"), so the
container rule gates every PR. `gate.sh` has no row by design: the test above holds it in `ci-native`.

## Open

The `let` half still reads only the emitter modules (plus `check_if_value.vl` once #6759 lands). The checker
and front-end `let`s are the same hazard and have no audit.
