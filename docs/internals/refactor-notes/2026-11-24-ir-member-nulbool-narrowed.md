# IR coverage: `member record` family H, a `boolean | null` field narrowed to its boolean (2026-11-24, lane IR-N8)

A `boolean | null` field is stored as an `i32` niche, `2` its null. Narrowed by `is boolean` or
`!= null`, legacy reads that `i32` as the boolean with no recover:
`call $__print_bool__ (struct.get $3 0 (local.get $0))`. The read records the `i32` kind, the row
`nulbool`, and `fieldStoresRead` took neither the equal kinds nor the `nulstr` twin, so the IR's
plain predicates declined it.

- **`fieldStoresRead` (emit_plan_union.vl, private)** also takes a `nulbool` row when the read
  records `i32` and the node's type is not nullable: the checker's narrowing. Its callers are
  `structFieldPlain`, `variantFieldPlain` and `nulVariantFieldPlain`, all IR-only. A read the
  checker has not narrowed is typed `boolean | null`, records `nulbool`, and takes the equal-kinds
  arm as before. The guard reads `nodeTyIsNullable`, already imported, so the module's checker
  surface (`phase-state-census`) does not rise; the first version compared with `TY_BOOL` and rose
  it by one.
- **The builder and the lowering** are unchanged: the kid rep is the nullable bool whose inner is
  the read's rep, the `narrowed` arm of `buildMember`, and the field tail writes no recover.

## The narrowing is the checker's

The verifier cannot see a narrowing: a `nulbool` field read typed `boolean` verifies, as every
narrowed nullable read does, and at `i32` or `string` it fails rule 2 (`ir_selftest.vl`,
`nulbool-field-read-at-*`). So the guard rests on the checker ending a narrowing where the field
can change, which `tests/cases/null/nullable-bool-field-narrowing-ends-at-a-write-runs.vl` pins:

- A call that writes `o.f = null`, with `o` passed in or captured by a closure, ends the narrowing:
  the read after it is `boolean | null` and prints `null` on all four faces (base and head, legacy
  and claim-all). The base seed, which cannot take a narrowed read, builds it too.
- The narrowing covers the name it tested: `const p = o` then `p.f` is `boolean | null`, and a write
  through `p` ends `o.f`'s narrowing.
- `unions/nullable-boolean-place-read-before-a-call-that-writes-it.vl`'s `field`, a read narrowed by
  an assignment and taken before a call that writes the field, now matches; its output is the same
  claimed and claimless.

## Measured

Base master `1bcc41329`, head this branch on it, both seeds fixpoints; re-checked after merging
master `f60da1dbd`, which also carried the guard's move to `nodeTyIsNullable`.

- Class regrade over H's programs: base 16 `uncovered member record`; head 86/88 matched, the 2
  others `null name test of a non-name null side`, one of them
  `null/narrowed-null-field-elem-compared-with-other-nullable.vl`'s `field`, which moves there from
  `member record` (its `else` arm's compares).
- Census, each arm in a tree at its own commit (#26): `member record` rows 10 → 8, the two
  `field`s above.
- Covered-fell: tests/cases fell 0, rose 2; corpus fell 0, rose 0.
- L2 self-compile fuel per PR +0.02% on `1bcc41329`; the pair (the head seed compiling the base
  tree) is −0.0005%.

Disassembly: the position file and the H program are byte-identical with `--names` under the base
seed and under the head seed with every function claimed.

Position sweep (Q58):
- `tests/cases/null/nullable-bool-field-narrowed-read-positions-runs.vl`: both narrowings, the read
  in `print`, a return, an argument, a generic argument, an `if` condition, `&&`, `!`, a `boolean`
  binding, a string hole, a record field and `== true`, on a true, a false and a null object. Base
  12 `member record` of 75; head 75/75 matched.
- `scripts/capability-probes/matrix/struct-nullable-bool-field-narrowed-read.matrix.vl` and
  `variant-nullable-bool-field-narrowed-read.matrix.vl`, both faces: 48 of 48 graded cells run,
  0 silent, 0 `runs → not-runs`.
- Row: `tests/ir-shadow-rows/nullable-bool-field-narrowed-read.vl`, a record, `!= null` and a union
  member.

## Legacy tails the IR calls

None new: `structFieldTail` and `variantFieldTail`.
