# IR-C1: RNumUnionConvert and RNulNoneBox are claimed (2026-11-23)

**Change.** `irRhsFamily` (`compiler/ir.vl`) moves RNumUnionConvert (#9591) to `scalar`, beside
RNumUnionBin, and RNulNoneBox (#9654) to `box`, beside RNicheRead. Both moves are out of `other`,
which `CLAIMED` never admits.

**Why they were out.** Each was filed in `other` when its builder landed, and was proved only
under the shadow. No claim rule refused either one. The coordinator ruled on 2026-11-23 that a
built kind sitting in `other` is admitted on mode 6 plus claimless differ 0, and its lane is told.
The builder-less I0 kinds (RCellGet, RCellNew, RFnId, RTagOf, SCellSet, SSwitch) stay in `other`
until each has a builder.

**New admission predicates (R8).** None.

**Proof** (base 070bb30cb, both seeds fixpoints at step 2):

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7675, fail under both 68, differ 0; witnesses same 63, differ 0 |
| `ir-identity.sh --claimless` | identical 14030, differ 0 |
| `ir-identity.sh --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| ir-shadow corpus / `--claims` | 45357 covered = verified = matched; zero claim fell back |
| order check (`ir-shadow.vl --prepost`, corpus and `--cases`) | 0 order rows on head and base |
| R7, deep nesting, margin | 346 ok; 5 ok; fail 896 KB / pass 900 KB on both |
| `gate.sh --fast`, `lint-self.sh` | passed; clean |
| L2 self-compile fuel | +0.00% on 115,795,583,499 |
| legacy A/B (tests/cases + probes) | 0 moved programs |

**Claimed delta**, tests/cases (non-`@error`):

| measure | base | head | change |
| --- | --- | --- | --- |
| `[ir]` claimed rows, functions | 71,032 | 71,059 | +27 |
| `[ir]` claimed rows, start bodies | 6,421 | 6,429 | +8 |
| per-function `fnc` rows | 71,125 | 71,153 | +28, none lost |

The two function counts differ because they are separate instruments.
