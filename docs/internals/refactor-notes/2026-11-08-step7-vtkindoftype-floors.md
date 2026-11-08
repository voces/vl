# Step 7: `vtKindOfType`'s three floors, measured and closed

Measured 2026-11-08 on a 4-core box, on top of #6888 (`c160b28d`). Both seeds are fixpoints
(two `refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,720 programs.

`vtKindOfType` was `annRepKindOf(ann)` plus three floors. A probe compiler counted each call
by the floor that answered it (`$VL_CLS_CENSUS=1`, rows read with `classifier-census.vl --keep`):

| floor | calls | files | what the descriptor said |
| --- | --- | --- | --- |
| descriptor covered | 3,846,195 | 22,045 | (the answer) |
| A: the `null` type answers `nulnone` | 1,469 | 66 | `nulnone` in every call |
| B: a nullable numeric literal union answers `union` | 26 | 1 | uncovered |
| C: `i32` for an uncovered node | 32,887 | 3,037 | every call had `tyIx < 0` |

* **A** was already the descriptor's answer: `repOfPrim("null")` is `nulnone`. Deleted.
* **B** fired only on `x: 1 | null` in `tests/cases/unions/litunion-is-base-type.vl`.
  `repOfNullable`'s `TyLit` arm covered a string literal and nothing else. It now reps a
  numeric literal as its base scalar made nullable, the value-union box, which is what the
  floor answered. A second census with that fix found no annotation node the descriptor
  leaves uncovered.
* **C** never met an uncovered node. Every call was "no annotation", and that stays the
  function's contract: `-1` is the scalar default.

So `vtKindOfType` is now `annRepKindOf(ann) ?? "i32"`, and `annRepKindOf` is the
descriptor's kind with no arm of its own. VKind for an annotation is derived from the rep
descriptor.

| | base (#6888, fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,720 same; 0 bytes-only, 0 output movers |
| seed bytes | 6,577,698 | 6,577,696 |
| L2 self-compile fuel | 78,748,560,694 (#6888's reading) | 78,655,583,002 |
| rep-fuzz | exact | exact |

## late-demands

`late-demands --check` reports 2 files falling 1 → 0, on this candidate as on master's
own fixpoint (#6888's note). The baseline is rewritten here from the fixpoint seed: 3 in 3
files, of 6,420 built.
