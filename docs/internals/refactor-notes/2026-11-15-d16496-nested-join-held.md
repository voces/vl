# D16496: a nested join that keeps its type keeps its literals (2026-11-15, lane O)

`numLitAdoptJoin` (check_num_adopt.vl) adopts a join's type into its literal tails through every
nested join. `numLitJoinSpineSync` then retypes a nested join only when all its tails hold that
type. A nested join with a typed tail of another type therefore kept its own type while its
literal tail moved, and the emitter built an `i64.const` arm in an `if (result i32)`.

The fix: `numLitJoinHeldLeaves` finds the nested joins that keep their type, those with a tail
that is no literal and no literal tree (`numLitDstTy`, `litTreeOps`) and is typed other than the
join's. Their tails are left out of the adoption. Nested joins of literals only, the D16491
case, still adopt.

## Grading

- Witness and ablation: every face runs, in both condition parities, and the oracle agrees with
  each. Faces: swapped arms, `match` for `if`, an annotated `i64` destination, and an `f64`
  outer arm. The fixture `tests/cases/numerics/nested-join-wide-constant-arm.vl` fails to
  validate on the base seed.
- The fuzz cell `ar_s42_0050` AGREEs and leaves `scripts/oracle/known.txt`.
- `scripts/gate.sh`: every row passes except three. Each of the three fails only because this
  container's host binary predates #8314 and #8370:
  - `vl_host_float_print_test`, and D16472 MOVED in filed witnesses: the 17-digit print;
  - `vl_ifaces_test`: `$VL_IFACES` support.

## Open: match filed rows by witness, not by cell id

`fuzz.sh` and `oracle.ts` know a filed wrong value only by its cell id, and the nightly draws
fresh seeds. So a family with an open row reds a night whenever a new cell lands in it (D16497
and D16498 today, about 3 in 4,000 arith cases). A follow-up should list a row with its
minimal witness and classify a disagreeing cell as that row's when the cell reduces to it, or
when the witness alone disagrees in the same way. This is tooling, so it has no VL witness and
no inventory row. Lane O picks it up after D16496.
