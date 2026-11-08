# The state audit's `let` half reads every compiler module (2026-11-08)

Follows `2026-11-08-state-audit-const-containers.md`, whose "Open" was this: the `let` half of
`scripts/emitter-state-audit.vl` read only the emitter modules plus `check_if_value.vl`, so a
checker or front-end `let` written in one program and never reset (the shape of #6759's `lpExits`)
had no audit under `vl check --batch` or the LSP.

## What changed in the rule

The `let` half now reads every `compiler/*.vl`. Widening it naively gave **477 NEVER of 4,521**,
almost all of them textual misses, so the rule learned four things before it was triaged:

| change | why |
| --- | --- |
| keyed by module and name | 11 names (`seg`, `comp`, `writer`, `clLet` …) are declared in two modules and were one row |
| an unconditional top-level overwrite that does not read the old value is a clear | `lexReset`, `initChecker` set lets to the new program's values, not their inits |
| a one-line setter's calls are writes in the caller | `rcwCtxFnSet([])` in a pass resets a `check_rcw` let |
| a top-level overwrite after the function's first exit counts as `inner` (`~fn`) | it runs whenever the call gets that far |

A `let` no function clears is then graded by shape or by a reviewed list, and `--check` refuses
the rest:

| kind | how it is decided |
| --- | --- |
| init | every write is at module scope |
| rises | every write is `g = g + 1`: a generation, never equal to an earlier program's stamp |
| balanced | every write is `d = d ± 1`, each rise undone in its own function with no exit between |
| restored | every writing function saves the value to a local and writes it back |
| stamped | `LSTAMPED name:guard`, reviewed; the guard must appear in a function of the module naming the key |
| scoped | `LSCOPED`, reviewed: result registers, budgets and cursors set in the same call before every read |
| linstance | `LINSTANCE`, reviewed: `T` (fields reset by `initChecker`), CLI options, a set-only gate |

A list entry naming no `let`, or one a rule already covers, stops the audit. The emitter's
`INSTANCE` list is gone: its 14 entries are now covered by `inner` (the six `set*` host options,
`repShadowOn`), `prologue` (`fnRecordedRetTyFn`), `rises` (four generations), or the container half
(the atom intern, moved to `CINSTANCE`).

A `let` bound to a container and mutated in place (`xs.push`) was invisible to both halves: no
reassignment for the `let` half, not a `const` for the container half. The container half now
reads `let` containers too, with the `let` half's homes added, which found 13 more (the
`std_receivers` tables, the atom intern, three call-scoped lists); all are built once from
constants or call-scoped.

## Counts, on this tree (master `7963801c` plus this PR)

4,532 `let`s: 2,094 prologue, 324 pass, 57 frame, 1,939 inner, 12 init, 39 rises, 14 balanced,
2 restored, 12 stamped, 32 scoped, 7 linstance, **0 NEVER**. Containers: 3,506 (`const` and
`let`), **0 NEVER**. Before: 1,298 emitter `let`s, 0 NEVER.

**No leak found.** Every one of the 477 first-run rows resolved to a clear the old text match
missed, a shape, or a reviewed entry; none needed a compiler edit, so there is no two-program
witness and `tests/vl_instance_state_leak_test.ts` is unchanged. The reviewed rows that rest on a
calling protocol rather than on text are the ones to doubt first: `ftCheckLen` (read only inside
`fnTagRedecide`, after a `fnTagDecide` that set it) and `canonTwinText` (its `canonTwinTy` is reset
before the one call that reads both).

## Controls

* `--without-reset initChecker` turns 47 checker lets NEVER (`TY_I32` …), exit 1.
* `--dir <copy of compiler/>` with `crCapLossAny = false` dropped from `crReset` names
  `crCapLossAny check_capture_rows.vl:`, exit 1. Both are in `tests/vl_emitter_state_audit_test.ts`;
  the five earlier controls still pass unchanged.

## Gate

CI's `checks` job already runs `--check` ("Emitter state (invariant)"), so the widened rule gates
every PR from this one on.

## Open

The index-register rule (D11770, `GUARDED`) stays scoped to the emitter modules. Read over every
module it names **90** inner integer registers outside the emitter (driver 11, lint 6,
check_leaf_steps 6, …), most of them `~fn` result registers. Each needs the guard triage the
emitter's seven got; they are not gated yet.
