# IR: an object literal's variant field arms, 2026-11-20

After #9222 took the struct field arms, a variant row's field still missed at every arm but
`plain`: `variantFieldArmOf`'s `box`, `f64`, `i64` and `f32` named misses as
`object variant field <arm>`. In the corpus census on #9222's struct head, the ones that block a
function alone are box 342, f64 57 and i64 50.

## The change

`variantArmFits`, an exhaustive match over `VariantFieldArm`, admits the box and the widenings
where the literal's field rep is the slot the arm writes. Each is built by `deliver`, as #9222's
struct arms are. Legacy writes the box through `emitVariantFieldBox`, which is `emitUnionBoxOwed`
at the variant field's own union, and the widenings through `emitWidened`. A box value into
another union's box stays legacy's ("object variant field box from a box"), as on the struct side.

Compiler lines are +21 −1, all in `ir_build.vl`. No legacy line is deleted or moved.

## Readings (base #9222's struct head `06737779`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 17,279 | 17,282 (+3) |
| corpus covered = verified = matched (shadow) | 39,735 of 45,678 | 40,111 (+376) |
| L2 self-compile fuel | 101,235,276,813 | 101,248,113,366 (+0.013%) |
| seed size | 6,863,360 | 6,863,614 (+254 bytes) |
