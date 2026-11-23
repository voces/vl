# `rep unsup`, batch 3: open capture reads and nullable-box hole receivers (IR-C1)

These are the coordinator's batch-3 pieces (B, then the nullable-box shared read), built on batch 2
(#9736) in `exprAtPre` and `buildMember` where a node's own type has no rep. A re-census on master
after #9725 put the class at 18 functions in tests/cases.

- **B** (`irBOpenLocalReadRep`): a capture read whose own type is open takes the kind legacy stores
  the capture at, `captureValKind` and `captureValStructIdx` translated through `repDescTy`. The
  capture-read path's own valtype check confirms it. All four cells leave `rep unsup`; one function
  builds whole, the others now stop at `operand type`, `open temp type` and field coercions, which
  are separate classes. The template lambda never runs, but legacy emits its body before
  dead-function elimination, so the IR compares against that body and must build it.
- **Nullable-box receivers** (`holeRecvBox`, `ir_build_ref.vl`): a hole parameter whose frame rep
  is a nullable over a box is read, under `?.`, as that box. `hole-optional-member-read-record-union`
  drops from 5 functions to 1; the others move to `box ladder` (N9) and `tail coercion`.

## What stays in the class (9 functions)

- 6 member reads recorded at `<error>` in statically dead complements of `is` guards
  (`inference/hole-*`), all co-blocked by `decided is guard ends block`. Coordinator ruling: N1's,
  no row; N1 checks them after its fix.
- `shared-nullable-scalar-field-read` `X` (co-blocked by `coalesce box after an operand`),
  `hole-optional-member-read-record-union` (1) and the hole call in
  `captured-hole-fn-handed-on-two-generics` (1).

## Legacy tails the IR calls

None.

## Readings (base 603a09a5e = batch 2 merged with master, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7717, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14044, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45442 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, margin | 429 ok; fail 903 KB / pass 906 KB on both |
| L2 self-compile fuel per PR | +0.00% on 120,978,365,067 |
| tests/cases `rep unsup` (mode 4 blockers) | 18 → 9 functions |
| tests/cases claimed | functions 78,985 → 78,988, starts 6,809 → 6,809 (0 lost) |
