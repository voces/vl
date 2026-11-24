# IR coverage: a member equality over a box local narrowed by an earlier equality (2026-11-24, lane IR-N7)

`narrowed read` family E. A `match` over a mixed `N | null` with a null arm reaches the IR as an
equality chain, and the miss reduces to a member equality after a narrowing equality:
`if k == 0 { … } if k == "one"` with `k: (0 | "one") | null`, a box. The second test's operand is
narrowed past `0` to `"one" | null`, so the IR asked it at a nullable atom and missed
(`narrowed read`). Legacy's `eqRouteOf` takes the union compare there and reads the box as it
stands: tag `== 2`, then `__str_eq__` on the payload.

| Mechanism | Change | tests/cases, by origin |
|---|---|---|
| union compare over a box local narrowed by an earlier equality | `unionSideOf` asks legacy's route for a local legacy holds as its box (`boxLocalRead`: `exprUnion` and a box-held variable), and `unionConcreteEq` reads the box through `unionEqSide`, past the narrowing, instead of at the narrowed type's rep | `narrowed read` −1: match/litunion-mixed-type-member-dispatch's `c` → none (and the 4 of this PR's pin) |

Ablation: `k == 0` alone, `k == null` after `k == 0`, and `k is "one"` all covered before; only a
member equality after a narrowing equality missed.

Only an identifier read of a local held as its box takes the new route. A field read such as
`a.kind` (IR-N8's member-record reads, whose string-stored literal-set fields read at their
string) does not, so a `K == "lit"` over such a field is untouched.

Also here: `globalTarget`'s doc comment heads `globalTarget` again (V3's note on #9952), and the
handoff of family B to IR-M1 (`2026-11-24-ir-n7-narrowed-read-family-b-heap-identity.md`).

## Measured

Fixpoint seeds: master `cea354ff6` and head (before the merge of later master, which was clean).
- tests/cases, `VL_IR_SHADOW=4`: `narrowed read` 20 → 15; none 87,474 → 87,479; no other class moves.
- `VL_IR_SHADOW=1`: covered = verified 87,474 → 87,479, matched 87,463 → 87,468; mismatch rows the
  same files on both sides; no new fail/differ.
- `--cases` identical 8,133, differ 0; witnesses 81 / 0; `--claimless` identical 14,502, differ 0.
- A/B over tests/cases: same 7,854, differ 0, built under one only 0.
- Corpus 46,916 matched, unchanged; self ir misses 0; L2 fuel +0.00% per PR; late demands 10 / 10.
- `check-filed-witnesses --strict`: 5,678 graded, 0 MOVED.
- Position sweep: `member-equality-after-narrowing-equality-over-a-box.matrix.vl` runs 66 / 66 graded
  cells under both seeds; `VL_IR_SHADOW=6`: 84 of 94 functions covered and matched (80 on master),
  `start`s unchanged; `--claimless` identical 66, differ 0.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `exprUnion` (existing), `boundVarOf`, `heldAsBox` | `eqRouteOf`'s `unionLeft`/`unionRight`, the box read as it stands |

## Legacy tails the IR calls

None new.
