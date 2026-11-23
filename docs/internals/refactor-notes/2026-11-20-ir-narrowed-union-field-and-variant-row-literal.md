# IR: a narrowed box's union-box field, and a variant literal at its wider row (2026-11-20)

Two self-compile rows, by origin (a probe seed naming each failing step):
- `member record` (16 alone). Every one is an Ident box narrowed to one variant, reading a field
  whose flat row is a union box. `narrowedFieldPlain` refused it for the union box alone.
- `object variant field i64` (9 alone). Every one is a variant literal built at its layout row,
  whose row stores the field as `i64` while the literal's own type says `i32`.

## The change
- **One narrowed-member tail.** `narrowedMemTail(vi, idx, memIx, fnIx)` (wasmEmit) writes the
  field, then a union-box field's unbox (`emitUnionFieldNarrowUnbox`). `emitNarrowedMem` and the
  IR's `boxField` both write through it. `narrowedFieldPlain` admits the union-box field, and the
  builder takes the read's rep from the unbox's own decision, `unionFieldNarrowUnboxOf` (#9272):
  - `none`: a box;
  - `atom`: `memNarrowAtomKind`'s atom;
  - `unbox`: `memReadUnboxAtomKind`'s atom;
  - `container`: a named miss, `narrowed field unbox rep`.
- **A variant literal at its row.** `objLit` builds a `variant` literal whose layout row's type
  (`uVarTyIx[objLitVariantLayoutOf(ix)]`) has another rep at that row. This is the twin of the
  struct arm's redirect. It goes through the one helper IR4's box-literal arm (#9294) added,
  renamed here from `armLit` to `objLitAtVariantRow`, with its misses renamed `variant row literal
  type` and `open variant row literal type`. The field is then delivered widened, as legacy's
  `emitWidened` writes it. `object variant field box` also falls to 0 through the same redirect.
- **A statement `if`'s dead `else` is not built.** Legacy neither writes nor counts an `else` that
  `ifWritesElse` calls dead (D16006). The builder built its body anyway, which surfaced as a
  `--cases` mismatch once `member record` let `variant-member-union-field.vl`'s `go` through. The
  builder now builds nothing there.

## Measured on fixpoint seeds: merge-base `de317fa31` (#9294) against this branch

| | merge-base | this branch |
|---|---|---|
| self-compile `blockers member record` (in all) | 18 | 1 (`narrowed field unbox rep`) |
| self-compile `blockers object variant field i64` (in all) | 10 | 0 |
| self-compile `blockers object variant field box` (in all) | 13 | 0 |
| self-compile functions claimed | 18,914 | 18,952 |
| distilled functions claimed (`--claims`) | 41,683 | 41,758 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,542 identical, 0 differ; witnesses 59 same.
- **`tests/cases` A/B, master seed against this seed, no shadow:** 7,262 identical, 0 differ.
- **Mode 3:** 0 differ, and the self-compile identical.
- **L2 fuel**, same box: 104,597,321,174 → 104,619,093,943 (+0.021%).
- **Witnesses.**
  - `narrowed-variant-union-box-field.vl`: the `none` arm is built. Its atom and unbox reads sit in
    functions an `is`/null test blocks first.
  - `variant-literal-built-at-its-wider-row.vl`: `i32` into `i64`, `i32` into `f64` and `f32` into
    `f64`. All five functions are built, with the same output under both seeds and mode 3.
  - No generic open-type witness: the checker refuses the generic widening, and the non-generic
    widening's generic twin fails in legacy's emitter (sent to F1 to file and fix).
