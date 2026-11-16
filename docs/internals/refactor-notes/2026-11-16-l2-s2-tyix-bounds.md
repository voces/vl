# L2 S2, first tables: `print`, `__array_new_default__` and nest rows become `Iface` bounds, 2026-11-16

S2 of `l2-inferred-interfaces-design.md` §8 says the scheme is the record: the table writers append
`Bound`s to the owning `Iface`, and the validators read them back in today's order. The step is
marked **identical**. This PR moves the three tables shaped `{ty, ix, fn}`: `printCstr`,
`arrDefCstr` and `nestCstr`. The other eight tables follow, one group per PR.

## Where S2 stood

Measured at master `26f7a8fb` with the design's §A.1 commands. No table appended to an `Iface`:
there was no `Iface`, `Bound` or bound kind in `compiler/*.vl`, and all 11 tables were replayed by
`validate*Cstrs` from `callFtyPinCstrs` (`check_calls.vl`) and `check_assignable.vl`. The
prerequisite judge groups 2 to 5 are closed (#8438/#8456, #8479, #8480, #8481), and group 1 is lane
G's.

## The change

- **`compiler/check_iface.vl`** (new, 116 lines, imports nothing):
  - `Bound = {on, site, fn}`, with one log per kind (`BND_PRINT`, `BND_ARRDEF`, `BND_NEST`).
  - `Iface = {fn, print, arrDef, nest}`: per owner, its rows' indices, ascending.
  - A row's index in its log is its identity, as the table row index was, so `cvMark`/`cvPick`
    delivery marks, `nestCstrSeen` and `checkMark`/`checkRollback` work unchanged.
- **Writers** (`notePrintCstr`, `noteArrDefCstr`, `noteNestCstr`) push through `bndPush`. Their
  duplicate scans read only the owner's rows, not every owner's. They answer the same, because a
  match had to have the same owner.
- **Validators** (`validatePrintCstrs`, `validateArrDefCstrs`, `validateNestCstrs`) walk
  `bndNextRow`:
  - for a declared callee, the callee's rows merged with module scope's (owner -1), ascending;
  - for an undeclared callee (`CSTR_NODECL`, `CSTR_ANYFN`), every row, as before.
  - Each candidate still passes `cstrOwnedBy`. That filter takes only owner = callee, or owner -1
    when not strict, so the visited rows and their order are exactly the old scan's.
- **Rollback.** `bndTruncate` pops the log and each popped row's owner list. Rows below a mark never
  move during a validator's walk, because a probe opened inside it marks at or above the walk's
  bound.
- **The probe-rollback assertion** names the three tables `printCstr`, `arrDefCstr` and `nestCstr`,
  one entry each, in place of three columns each.
- **`$VL_IFACES`** counts each owner's rows from its `Iface`.

## A cost the first version paid

The first version held the logs as `Bound[][]` and an owner's rows as `i32[][]`, indexed by kind.
Its seed behaved identically, but compiling the compiler cost more:

| L2 self-compile, guest fuel | master `c040079c` | `Bound[][]` | flat logs (this PR) |
|---|---:|---:|---:|
| master seed, same source path length | 89,831,371,098 | 90,544,880,532 (+0.79%) | 89,874,618,804 (+0.05%) |

Both seeds compiling the same candidate source differ by 0.006%, so the cost was in compiling the
nested-list types, not in running the new code. Flattening to one log per kind, with a three-arm
`if` per accessor, removes it. The allocation of a candidate list per call
(`bndCallRows`, replaced by `bndNextRow`) was measured separately and cost nothing.

## Gates

- **Identical.** Two `refresh-compiler.sh` runs from the master fixpoint seed are cmp-identical, so
  the master seed and this seed compile this source to the same bytes.
- **Fingerprint** (`probe-rollback-census.ts --fingerprint`, rc, diagnostics and emitted bytes):
  20,535 programs of `tests/fixtures`, `tests/cases`, `distilled/cells` and `distilled/named`,
  byte-identical to the master fixpoint seed.
- `regress.vl`: 0 runs → not-runs, no cell changed class.
- `decl-order-ab.vl`: 16 of 5,246 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 227 hole and inferred matrices (`ls matrix/ | grep -E "hole|infer"`; the design counted 224),
  `--before` master against `--after` this seed: 0 runs → not-runs, 0 of 15,410 rows changed. 9,803 of 13,003
  graded cells run on both.
- `lint-self.sh`: clean. Seed size: 6,350,170 bytes (+0.1% on baseline). Late demands: 2, the
  baseline.

## Lines

- +116 in `check_iface.vl`; in the seven touched files, +114 and −163.
- Net +67.
