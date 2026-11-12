# Step 7 L2 §7: return-join and recorded-union rows are named by the naming rule, 2026-11-12

Lane w310 took three registry-name floors off lane w316's queue. Each registered or seeded a
union row under a name rendered from the type:

- `registerRetJoinUnions` (`emit_rewrite.vl`): a list union by `listUnionEmitName`, and a
  function-arm union by `tyToEmitName`;
- `retFlagsSeedResult` (`wasmEmit.vl`): `rf.retUNm` for a recorded union return, by
  `tyToEmitName`.

All three now spell the name by the naming rule, `monoPinSpellShaped`, as w317's moves and #7357
did. The registry keys the row by the type it is handed (`registerInlineUnionOfTy(…, sty)`). A
row the type already keys adopts the name, so the name decides only what a new row is shown by.
`listUnionEmitName` and `declNominalOfTy` lose their last callers and are deleted.

The base is master `572dd517`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,965 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. At each site it compared the rendered name with the rule's.

| site | reach | the names differ |
| --- | --- | --- |
| list union | 22 | 11 |
| function-arm union | 21 | 1 |
| recorded union return | 24 | 12 |

The rule sorts members (`string[]|i32[]` against `i32[]|string[]`), and it spells a record by its
row (`{x:i32}[]` against `P[]` or `#anon0[]`). No name difference moved a byte: the 33 test cells
among the 55 programs reached build identically, and so does the rest of the sweep.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,965 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** With `--findings`, renders fall 19 → 16, all three named by `--budget-why`.
  Parses stay at 55. The baseline is rewritten in this PR.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,462 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
