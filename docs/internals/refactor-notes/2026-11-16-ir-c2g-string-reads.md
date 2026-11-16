# IR cutover C2g: string literals, length and reads (coverage step), 2026-11-16

Lane IR-C. This is a coverage step under the `ir-design-2026-11.md` §10 exemption, the first one
chosen and sized with the blocker census (#8642). The string family led the census on the corpus.
This step takes three string arms through the op seam. The string operators wait for the next step,
together with `valued tail if`. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **String literals.** A literal at the `str` rep, not an interned atom, is the operand `OStr`. Its
  field `osAt` is the literal's node. The lowering writes it with legacy's `emitStr`, now exported:
  the pool's global, a data segment, or a chunked build. This was C2f, which never landed alone,
  because by itself it unblocked nothing.
- **`.length` of a string** is `RListLen` over a `str` operand, and the verifier admits it. The lowering
  is C2e's shared `arrLenTail`, whose raw-string arm writes the header's `len`. Any other string
  member is a miss that names the member.
- **The raw string read `s[i]`.** `emitIndexRawString` splits into `rawStrHoistOf` and `rawStrGetTail`,
  which legacy and the IR both call. The builder takes `idxArmOf`'s `string` arm. A string `RListGet`
  yields an i32, and the verifier admits that.

## Coverage

| reading | before (census base) | this branch | gained |
|---|---:|---:|---:|
| corpus covered = matched | 12,996 | 15,030 | +2,034 |
| self-compile covered | 2,795 | 2,888 | +93 |
| self-compile matched | 2,791 | 2,884 | +93 |

The census predicted this before the build. It counted 1,361 corpus functions whose only blockers
were string classes. After the literal and `.length`, `index string` alone held 1,011 more. The
build took 2,034. Compiler lines are +71 / −14 over seven files, so 57 net: about 36 covered corpus
functions per net line, and 1.6 on the self-compile.

**Census after the step.** No corpus function is held by string classes alone. `operand at string`
(the string operators) always comes with another blocker. On the self-compile, string classes alone
hold 307, and 604 with `valued tail if`. That pairing is the next step.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the base seed, 12,213 cells | 8,934 identical, 3,279 fail under both, 0 differ |
| shadow | corpus 15,030 of 15,030 matched; self-compile 2,884 of 2,888, the same four named unlowered misses as before |
| mode 3 with `list` admitted (throwaway build) | self-compile 2,884 functions claimed and byte-identical; corpus 8,934 identical, 0 differ, 0 fell back |
| L2 self-compile fuel | 93,771,548,620 to 93,797,517,411 (+0.028%) |
| seed size | 6,434,832 to 6,438,701 (+3,869) |
