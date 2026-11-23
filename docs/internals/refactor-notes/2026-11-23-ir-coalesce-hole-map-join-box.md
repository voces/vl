# IR coverage: `??` over hole map reads joined into a union box (2026-11-23, lane IR-N2)

These are the d3127 cells IR-N6 and IR-N9 handed over: `p.a[k] ?? p.b[k]` and `(m[k] ?? m[k]) ?? d`
in a hole instance. Legacy writes each as a null-test `if` whose arms box into the join's union.

## Design

- **Box plan.** `holeBoxPlanOf`'s map rung returned `mapReadBoxPlanOf`'s `ladder` for every map
  read it did not box as a scalar. Legacy's map-get rung takes only a union-valued map
  (`unionBoxArgGoMapRead`). Two other reads now take the plan's rungs below, as legacy's
  ladder does: a read of no union value (`!exprUnion`), and one from a map that stores its
  values as themselves rather than as union boxes (`mvValKindAt` is not `union`). #9662 opened
  this only for a literal-union read.
  - A map that stores union boxes hands its box on, and stays on the ladder.
  - Letting such reads fall through moved legacy bytes: they were unboxed and re-boxed under
    the same tag. That cost an extra cast and allocation, so it is excluded.
- **Boolean niche atom.** The plan's atom rung admits a `boolean | null` read at the boolean atom
  (its niche's 0/1), as legacy's writer boxes it.
- **Union `if` arm.** `unionIfArm` boxes an arm that `deliver` leaves unboxed, with
  `boxTempIn` at the `if`'s union, as legacy's `emitUnionIfValue` boxes every arm
  (`emitUnionBoxArg`). The checker records no box for an inner `??` operand.

The box plan is shared with legacy, and with the box-stored exclusion no legacy byte moves. A bare
map read that misses still boxes as `null`
(`tests/cases/expressions/hole-map-read-boxed-present-and-miss.vl`).

## Legacy tails the IR calls

- None new. `boxTempIn` writes through the existing `RToBox` lowering.

## Measured

Against master `d699cfc48` at its fixpoint seed, with `VL_STD` on both arms:
- Census: `box ladder` 43 → 40, `start: box ladder` 19 → 17.
- tests/cases: covered = verified 78,790 → 78,807, matched 78,789 → 78,806. No new fail or
  differ row.
- Handed-over d3127 cells and siblings: covered = matched 318 → 332.
- The box-stored exclusion's price is 13 functions in 5 programs that the re-box would have
  covered:
  - `coalesce-map-read-joins-atom` 21 → 12;
  - `d3127_r2_g1_F1_i32_ab_1_34` 4 → 3;
  - `d3127_r4_gx_x0284` 3 → 2;
  - `coalesce-hole-map-reads-joined-into-a-box` 6 → 5;
  - `coalesce-map-read-wider-default` 2 → 1.
- The tree-wide legacy A/B moved 0 programs. `--names`, `--cases` and `--claimless` differ 0.

After the master merge (`floorDeliver`), an arm that is itself a `??` stays a named miss
(`union if arm coalesce chain`). Built as a nested join, it had locals legacy's single chain does
not have (2 d3127 cells).

Open: 11 cells stop at `rep ?`, a minted node with no type in the hole instance. 4 stop at
`coalesce mapScalarJoin`.
