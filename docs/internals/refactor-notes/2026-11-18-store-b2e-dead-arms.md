# B2e: the late arms dead on the corpus, deleted; the live ones named, 2026-11-18

Lane STORE, after B2d (#8981), under which the check's decision is final. The coordinator ruled on
2026-11-17:
- ablate each late arm, the six candidates first;
- delete each one that proves dead;
- for each live arm, name the late fact it reads that the check lacks, as B3's work list.

## Method

There were 27 `ftLate` sites in `check_fn_tag.vl` after the decision's setup. Each was ablated alone:
- that one occurrence forced to the check's behaviour (`ftLate` → `false`);
- the compiler refreshed;
- `$VL_LATE_DEMANDS=1 vl check --codegen tests` compared with the unforced build's output.

Two measures: programs whose check output (diagnostics) changes, and late tag rows new or gone. A site
at 0 / 0 / 0 is dead on the corpus.

Site numbers are each run's own: run 1 took the six candidates (11, 13, 14, 18, 21, 22) numbered at
B2d's head; run 2 took the other 21, numbered after run 1's two deletions. Each row names its code.

## Dead: deleted

| site | code | what goes |
|---|---|---|
| 11 (run 1) | `ftReadInNestedFn`: a nested declaration built per encloser instance (`mintNestedPerEnclOf`) | the skip, 4 lines (`mintNestedPerEnclOf` stays: `emit_mono.vl` reads it) |
| 21 (run 1) | `ftNamedFieldHolds`: `if !ftLate … return false` | the function, always false at check, and its caller's term, 17 lines |
| 19 (run 2) | `ftScan`'s escape test: `!(ftLate && ftCoercedEscape(v, s))` | `ftCoercedEscape` (16 lines) and the term |
| 21 (run 2) | B2d's narrower-seed refusal: `!ftLate &&` | the guard; the refusal applies at both |
| 22 (run 2) | the hole-argument arm: `(ftLate \|\| !ftArgHandedBack(pn, x))` | the guard; the hand-back test applies at both |

With all of them deleted, check output and late rows are byte-identical to master's (cmp of the full
`vl check --codegen tests` output, late rows included).

Kept, though at 0 / 0 / 0: site 1 (run 2), the `!ftLate` on `ftTry`'s fact retry. Removing it would run the
check's retry again after the elaboration, on an empty fact table: the same outcomes, for more work.

## Live: the late fact each reads that the check lacks

These are B3's work list (and the slot-join step's). A live arm is a missing check producer.

| site (run 2 unless marked) | changed / new / gone | the late fact | the check producer it wants |
|---|---|---|---|
| 0 | 1 / 0 / 3 | `mintStoreNote`: a record literal written into a binding an instance holds set `s` in | the store's holder set per key (B2e slot and field joins) |
| 2 | 1 / 3 / 0 | `mintLamClosed`: a lambda member closed at its delivery | a lambda's delivery per key (B3, lambda members) |
| 3 | 8 / 0 / 15 | `mintSeedBindsOf`: a written binding's join per instance | B2b's join for generic members (B3) |
| 4 | 0 / 2 / 1 | `mintSeedHeldOf`: the seeding parameter's set per instance | as site 3 |
| 5 | 2 / 0 / 9 | the forwarded subsets at each instance's calls (`ftFwdInSubsets` over the mint facts) | row facts for forwarded hands (B2a's rows, extended) |
| 6 | 2 / 0 / 5 | a one-member call evaluates its arguments once in an instance | per-instance argument evaluation (B3) |
| 7 | 12 / 29 / 0 | `mintSetPartial`: an instance binds a parameter to part of the set | partial sets per key (B3) |
| 8 | 24 / 0 / 29 | `mintRetParamsOf`: the parameters an instance hands back | `check_hand_back` per key, beyond one hole parameter |
| 9 | 13 / 0 / 88 | a member call's arm per instance (`FuncDecl` read as a declared member) | the arms at instance calls (B3) |
| 10 | 1 / 0 / 0 | scans bounded by the check's arena length | none: structural, it keeps the elaboration's nodes out |
| 11 | 0 / 1 / 0 | `ftLateParamTakes`: what an instance's parameter takes | parameter takes per key (B2a's rows) |
| 13 (run 1) | 0 / 0 / 2 | `ftCloDelivered`: a push the elaboration records as a closure delivery | closure deliveries per key (`sbCloDelivered` keyed) |
| 14 (run 1) | 1 / 0 / 1 | `ftReachHandsOne`: every instance hands one set | per-key reach (B3) |
| 14 | 12 / 6 / 11 | `ftLateParamOk`: a parameter handed on, typed where it lands | parameter takes per key |
| 15 | 64 / 0 / 44 | `ftLateArgOfSet`: an argument of a call through a set, per instance | B2c's set-call rows, read by the decision |
| 16 | 0 / 1 / 0 | `mintSetPartial` in `ftLateArgOfSet` | as site 7 |
| 18 (run 1) | 2 / 0 / 0 | `ftEscBuilt`: an escape the elaboration built as a closure | escapes per key |
| 18 | 1 / 0 / 0 | a record literal built at the record of the set's ids | the literal's rep per key |
| 22 (run 1) | 4 / 0 / 9 | `ftOpenFieldHolds`: a literal built at the instance's record for an open field | open fields per key |
| 23 | 8 / 0 / 6 | `ftHandedHolder`: a literal handed to a hole parameter | literal holders per key (A1.3 covers the arrow-fact case) |
| 24 | 4 / 0 / 0 | a literal argument bound at the instance's parameter type | delivery per key (L2's `instVecDeliveryClose`) |

## Grading (fixpoint seeds both sides, master `8168bc374`)

- `vl check --codegen tests`, late rows included: byte-identical to master's.
- `check-filed-witnesses.vl --strict` over both inventories: 5,466 graded, all as filed, 0 moved,
  3,430 checked against their Want output, 0 mismatched.
- Late tag rows 394 = baseline, none new; late demands 10.
- `@run` A/B (6,723 programs): 0 wasm movers, 0 output movers.
- L2 self-compile fuel: 96.946G against master's 96.949G measured alike (−0.003%).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908). Net compiler lines +8 / −48.
