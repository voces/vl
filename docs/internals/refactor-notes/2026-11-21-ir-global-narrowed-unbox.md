# IR: a union global read at its narrowed atom, and a recover count decided at build, 2026-11-21

Lane IR-N4, stacked on #9402 (`2026-11-21-ir-global-narrowed-read.md`). Two parts, as the
coordinator ruled:
- the union-box half of the narrowed global reads;
- #9360 (the recover decision) folded in, since it edits the same arm.

## The union-box half

- **One decision.** `boxNarrowArmOf(ix, cellRep, rep, arm)` is the arm a read of a union-box
  cell takes at a narrowed rep:
  - `variant`: a record arm's payload;
  - `atom`: the one atom legacy's `unbox` read arm names;
  - `box`: the same box at a smaller union's rep;
  - `none`.

  `narrowedLocalRead` asks it, with the same three arms as before.
- **The global read** takes `atom`. Legacy writes it as `emitUnionBoxPush`'s global read
  (`ref.as_non_null` for a non-const global), then `emitUnionUnboxTail`. The IR builds the box
  read at the cell's rep, typed at the global's own type, then `RBoxNarrow` with the atom.
- The box ladder is untouched: this is read and unbox only. Boxing into a union is IR-N2's.

## The recover decision (#9360)

- `RRecover` and the narrowed `RGlobalGet` carried predicates the lowering asked itself:
  `localNulStrRecovers` and `readOwesNonNullRecover`. Both read context an outer site sets
  around one legacy emit, such as an assignment's re-read inside `asgReReadEnter`.
- Now `RRecover.rcNn` and `RGlobalGet.ggNn` carry the `ref.as_non_null` count, decided by the
  builder in the read's own context. The lowering writes that many and asks no checker question.
- `nullNarrowArmOf`'s `atom` arm is now `held`: a read the checker left nullable is held at its
  non-null type for any kind, not only an atom.
- On the base, `soundness/short-circuit-write-may-not-run.vl`'s `(s = "w").length` re-read
  stopped at the named miss `nullable read recover`. It now builds and matches.

## `claims-fallbacks.txt`

It was rewritten with `--claims --write-fallbacks`. Five rows go from 1 to 0:

| file | was |
| --- | --- |
| `generics/map-declared-callback-return-reads-its-pin.vl` | operand above a valued if's value |
| `literal-unions/asg-into-nullable-atom-local-value-runs.vl` | verifier |
| `literal-unions/pop-coalesce-widens-to-string.vl` | verifier |
| `soundness/short-circuit-write-may-not-run.vl` | verifier |
| `unions/wide-union-forty-arms.vl` | verifier |

All five already read 0 on the base seed, where the gate printed `fell: 1 -> 0`. The file was
stale, not this PR's doing. This PR's own effect is that `short-circuit-write-may-not-run.vl`'s
function is now claimed: claims outside the corpus go 80 → 81. `hole-map-tail-value.vl`
(effect outside I1) stays at 1.

## Readings (base: #9402's head `a9a54be6`, fixpoint; candidate fixpoint)

| reading | base | this PR |
| --- | ---: | ---: |
| self-compile covered = matched / claimed | 19,506 / 19,393 | 19,506 / 19,393 (seed hash identical) |
| corpus functions with no blocker (covered = matched) | 44,477 | 44,477 |
| claims outside the corpus | 80 | 81 |
| `tests/cases` armed shadow covered / matched | 63,267 / 63,266 | 63,284 / 63,283 |
| `tests/cases` start covered / matched | 4,910 / 4,909 | 4,961 / 4,960 |
| `tests/cases` fail or mismatch rows | 3 | 3, the same list |
| L2 self-compile fuel | 106,738,112,390 | 106,762,988,691 (+0.023%) |

Byte identity:
- Mode 3 and mode 5 self-builds equal the plain build.
- `ir-identity.sh --names`: 9037 identical, 0 differ.
- `--cases`: 7588 identical, 0 differ.
- `--claimless`: 14014 identical, 3267 fail under both, 0 differ.
- tests/cases A/B: 7302 identical, 0 differ.

Late tag rows: 307, the baseline.

Compiler lines against #9402's head: +118 / −52. Legacy lines deleted: 0. Shadow rows:
`global-narrowed-unbox.vl` and `recover-decided-at-build.vl` (from #9360).
