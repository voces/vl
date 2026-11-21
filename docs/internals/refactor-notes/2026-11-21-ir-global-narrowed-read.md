# IR: a nullable global read at the member the checker narrowed it to, 2026-11-21

Lane IR-N4. This is the first family of the `global read coercion` census. The coordinator ruled
it a plain delivery before the D14426 note. Their condition: the local and global reads share one
decision, with no parallel predicate mirror.

## The census that split the class

A scratch-only diagnostic seed named each miss by its cell kind, cell rep, read rep, and whether
the binding type's rep is the cell's. The worktree and seed were untouched. It ran over the 401
`tests/cases` files that hit `global read coercion` or `global initializer coercion`:

| family | functions | files |
| --- | ---: | ---: |
| narrowed read: the cell rep is the binding type's, the read is at a narrowed member | 363 | 277 |
| binding-vs-storage split (D14426): the binding type's rep is the built or read rep, not the cell's | 116 | 57 |
| other initializer coercions | 32 | 19 |

This PR takes the first family's nullable half. Legacy writes such a read as `emitIdentNode`'s
global arm (`emitUserGlobalGet`, then `globalReadRecovers`' `ref.as_non_null`) followed by
`emitReadRecover` (`readOwesNonNullRecover`). There is no conversion.

## The change

- **One decision.** `nullNarrowArmOf(ix, cellRep, rep)` is the arm a read of a `rep | null` cell
  takes at `rep`:
  - `plain`: the cell's read, then legacy's recover.
  - `atom`: an atom recovered from a read the checker left nullable.
  - `miss`: any other recover.
  - `none`: the cell is not `rep | null`.

  `narrowedLocalRead` now asks it, with the same arms as before. The global read asks it too and
  takes `plain`.
- **The global's storage.** A `union` cell (`globalCellKind`, legacy's storage producer) holds
  the `{tag, payload}` box, which a narrowed read unboxes. That stays a miss.
- **IR.** `RGlobalGet` gains `ggAt`: the read node of a narrowed read, else -1. The lowering
  writes legacy's global read, then `readOwesNonNullRecover(ggAt)`'s `ref.as_non_null`. The
  verifier lets a read with `ggAt` take its nullable cell's inner rep.

Compiler lines +70 / −32 (`ir_build.vl`, `ir_lower.vl`, `ir_verify.vl`, `ir.vl`, and the
closed set in `lint.vl`). Legacy lines deleted: 0. The shadow row is
`tests/ir-shadow-rows/global-narrowed-read.vl`.

**Measured on the way.**
- Excluding discipline 4 inside the shared decision lost 18 corpus functions and 1 self-compile
  function. A local whose rep reads as discipline 4 can be stored as the plain nullable reference,
  which is the D14426 split again. So the exclusion is the global's storage fact, not the rep's.
- The first cut, with no storage test, mismatched on 27 `tests/cases` functions whose global is
  an `i32 | null` union cell.

## Readings (base and candidate are fixpoint seeds; merge-base `1d7e639b`)

| reading | base | this PR |
| --- | ---: | ---: |
| self-compile covered = matched / claimed | 19,466 / 19,353 | 19,466 / 19,353 (seed hash identical) |
| corpus functions with no blocker (covered = matched) | 44,204 | 44,242 (+38) |
| corpus claims | 44,065 | 44,103 |
| `tests/cases` armed shadow covered / matched | 62,686 / 62,685 | 62,729 / 62,728 |
| `tests/cases` start covered / matched | 4,349 / 4,348 | 4,480 / 4,479 |
| `global read coercion` over the 401 files: uncovered / start / node-in rows (functions) | 125 / 225 / 29 | 81 / 52 / 28 |
| `tests/cases` fail or mismatch rows | 3 | 3, the same list |
| L2 self-compile fuel | 106,257,331,820 | 106,272,411,571 (+0.014%) |

Byte identity:
- Mode 3 and mode 5 self-builds equal the plain build.
- `ir-identity.sh --names`: 9037 identical, 0 differ.
- `--cases`: 7584 identical, 0 differ.
- `--claimless`: 14014 identical, 3267 fail under both, 0 differ.
- tests/cases A/B: 7298 identical, 0 differ.

Late tag rows: 307, the baseline.

## Left

- The union-box half of the first family (`union → i32` 29, `→ record` 11, and others) needs the
  narrowed-unbox arm for a global.
- The D14426 split is the family-2 note.
