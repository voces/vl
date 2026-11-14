# The sweep accepts an owed refusal (2026-11-14)

`scripts/sweep.vl diff` exits 1 on any `runs → not-runs`. A clause-1 fix that refuses a witness
which ran wrong is the one move the veto allows (D16044, #7907: an `i8` field took the literal
`200` and printed it unnarrowed). The diff had no way to say so, so the only routes to green were
an admin merge or dropping the `sweep` label. Both bypass the gate for everything else in the PR too.

## The mechanism

`scripts/sweep-owed.txt` holds `<cell key> <D-id>` lines. `diff` accepts a listed cell's `runs →
not-runs` only into `check_reject`, only when the row's status line says `clause 1`, and fails an
entry that did not move. An entry lives only in the PR that earns it, and the orchestrator clears
the file at each fold. `--owed <file>` reads another list. The documentation is
`scripts/sweep.md`, "Owed refusals".

## Tested

`tests/vl_sweep_test.ts`, "an owed refusal passes only for a listed clause-1 row's witness refused
at check": the accepted case, and four negated controls that must still block:
- the same move unlisted;
- a listed key whose row is clause 2 (D10010);
- a listed key that traps instead;
- a stale entry.
