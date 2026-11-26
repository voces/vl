# IR: `irConvert`, slice 2: the argument, cell and field store sites (2026-11-26, COV-CALL)

**Ruling.** This is slice 2 of the converter the coordinator ruled on 2026-11-26 (DECISIONS.md,
"One structural converter, `irConvert`, for every delivery site").

**Sites converted, and the chains deleted.**

- **Argument (`directCallAt`):** the `listRetag` / `holeRetagNoted` / `recRetag` /
  `cloListUndeclaredTakes` / `recRetagNoted` chain is gone, along with `cloNicheTakes` /
  `cloNicheRetag` and the closing as-is check.
- **`let` initializer:** the `listRetag` / `boxListRetag` / `boxMapRetag` / `recRetagAt` chain is
  gone, along with the trailing `holeRetagNoted` retag. `localStoredAt` and `cellTakesClosure`
  still retype a fresh cell first, unless the converter would retag.
- **Local assignment and global store:** the exact-rep checks are gone, along with
  `storedAsStands`, which is deleted.
- **Field store:** the value's exact-rep check is gone. A sub-word field still takes a plain
  `i32`.

**New cases.**

- `convertRetag` takes over the predicates only the deleted chains used: `boxListRetag`,
  `boxMapRetag` and `cloListUndeclaredTakes`.
- `CONVERT_NICHE`: a value into a niche nullable (`rnDisc` 1) when it is the inner value or
  retags to it. It is retagged to the inner rep where apart, then into the niche. A closure keeps
  `cloNicheRetag`'s field-retag note.
- `CONVERT_BOX`: a value of no box into a box rep, through `boxTempIn` at the destination's
  union.
- A cell site calls `irConvertStored`. SAssign and the verifier want one rep, so a value taken
  as it stands at another rep is retagged where `convertRetag` admits it (a holed closure, list
  or map, START-2's finding), goes in by its niche, or misses.

**Census (regen-9's coercion classes, this branch's probe).**

- Newly claimed:
  - generics/generic-function-into-nullable-function-slot `a`, `a$1`
  - globals/record-global-read-at-its-row-positions `unionArg`, `init`
  - records/intersection-recursive-twin-row-retag-positions `lets`
  - types/null-hole-fill-widens-returned-join-runs `pick`, `wide` (D17208, D17209)
- Every other row of the classes now misses as `convert <src> -> <dst>`, the converter's own
  sentence:
  - record -> record (6): slice 4, the record row copy, which is COV-START's;
  - list -> list (4) and map -> map (3): slice 3;
  - closure -> closure (2): the D5160 written generic adapter;
  - str -> nullable (1): an atom assignment delivered at its string;
  - list -> nullable (1).

**Armed sweep.** All 7,698 `@run` programs under `tests/cases/` were run on the box-case build.
Four print differently armed, and all four are listed in `scripts/ir-divergence-baseline.txt`:
wider-record-write-as-if-arm-value, hole-opt-field-coalesce-at-adopted-record (D17566),
keys-values-of-a-call-receiver-evaluate-it-once-positions and
wider-record-global-store-positions.

**Q58.** `tests/cases/functions/converted-delivery-site-positions.vl`. The master seed claims 3
of its functions and this branch claims 7, and the armed run prints the `@log` list.
