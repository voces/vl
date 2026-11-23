# IR-C1: the atom-hook kinds are claimed (2026-11-23)

**Change.** `irRhsFamily` (`compiler/ir.vl`) moves RAtomSole, RAtomWide, RStrToAtom and
RStrToAtomStaged from `other`, which `CLAIMED` never admits, to `scalar`, which it does.

**Why they were out.** Each landed in `other` with its builder, while its plan was proved only under
the shadow. RStrToAtomStaged and RAtomWide came with #9620. No claim rule refused them, and none
needed to: each lowers along the plan legacy writes (`strToAtomArmOf`'s `sole`, `chain`, `staged`
and `wideLit` arms), and no plan reads a table legacy fills while emitting.

**New admission predicates (R8).** None. The four builders and their legacy decisions are as
#9620 and its predecessors shipped them; only the family changes.

**Proof** (base b12adccee, both seeds fixpoints at step 2):

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7668, fail under both 68, differ 0; witnesses same 63, differ 0 |
| `ir-identity.sh --claimless` | identical 14027, differ 0 |
| `ir-identity.sh --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| ir-shadow corpus / `--claims` | 45350 covered = verified = matched; zero claim fell back |
| ir-shadow `--cases` | the same counts on base and head (its falls are base drift, not this change) |
| `ir-prepost.vl` (mode 6) | 0 order rows over 21086 programs, base and head alike |
| R7, deep nesting, margin | 338 ok; 5 ok; fail 896 KB / pass 900 KB on both |
| `gate.sh --fast`, `lint-self.sh` | passed; clean |
| L2 self-compile fuel | +0.01% on 114,848,201,355 |
| legacy A/B (tests/cases + probes) | 0 moved programs |

**Claimed delta.** The four `tests/ir-shadow-rows/atom-hook-*.vl` rows: sole-member 2 → 5 functions,
staged 5 → 6, tower 1 → 5, wide-literal 1 → 4. Over tests/cases (non-`@error`), claimed functions go
from 70,651 to 70,713 (+62, none lost) and claimed start bodies from 6,347 to 6,355 (+8).
