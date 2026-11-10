# Step 7: classifier round 28, `arrLitIsRefTpl` and `arrLitNumKind` graded at their consumers, 2026-11-10

Round 28 starts from master `3de5b959`, where `classifier-census.vl` reads 31 probed classifiers.
It follows round 27's two leads (`2026-11-10-step7-classifier-r27.md`). Each twin is graded at the
consumers' answer, not only at the classifier's, which round 27 had not done. Method: shadow counts
under `$VL_CLS_CENSUS=1` over the 23,816-program sweep population (post-mono calls). Then a scratch
compiler with the twin switched in builds every file where the two disagree, and its wasm is
compared with master's fixpoint seed (6,598,290 bytes). Nothing is switched, so this PR is the
note and the accounting.

**`arrLitIsRefTpl`, graded at `arrLitIsRef`'s answer.** `arrLitIsRef` is `arrLitIsRefTpl ||
arrLitFrameRefTy >= 0`, and the frame half asks the template half too. So each twin was
re-evaluated through the whole of `arrLitIsRef`, with the template half answering typed at every
level, recursion and frame half included:

| twin | agree | disagree |
| --- | --- | --- |
| V1: `tyIsRefArray(nodeTyIxOf(arrIx))` | 84,068 | 4,891 |
| V2: V1, but a function element is a ref list only when its type is not a tagged set (`fnTagTyIsTagged`) | 88,771 | 188 |
| V3: V2, declining a template type that holds a type variable | 86,914 | 2,045 |

The tagged-set gate closes the 4,628 tagged-leaf calls round 27 found. Of the rest, the frame half
already answered everything round 27 counted as map, record and non-leaf function. V2's 188 misses
fall in 67 files:

* Typed says ref and legacy does not (129): a union element (66), a list (30), a nullable (23) or
  a map (9) at a hole or generic pin (`hole-list-element-handed-on-at-two-types.vl`,
  `generic-function-value-stored-after-construction.vl`, `literal-union-destination-body-closed.vl`).
* Legacy says ref and typed does not (59): 47 literals whose recorded type is no list, or none at all
  (`spread-run-built-at-holder.vl`, D14041), plus nested records at a type parameter (`d581_nest_obj_obj_*_typar`).

Switched in, V2 builds 31 of the 67 files byte-identically, gives the same refusal in 10 and
different wasm in 13. In 13 more, one side builds and the other does not: `d362al_numlitun_unionmem`
and `d362in_numlitun_unionmem` become compiler traps (exit 70), and D15626, D8200 and
`hole-list-element-handed-on-at-two-types.vl` become refusals. It is not switched. The missing fact
is the stored row of a list at a hole or generic pin. That is a function-value or hole-row fact
(groups 2 and 3), not the template's type.

**`arrLitNumKind`, graded at its consumers.** The twin is the width of the literal's recorded
rep element (`litRepTyAt`). It agrees in 72,518 calls and disagrees in 6,118, across 1,221 files.
Switched in:

| result | files |
| --- | --- |
| byte-identical wasm | 1,197 |
| the same refusal | 1 |
| different wasm, same output | 23 |

Most of the 4,806 calls where the rep is `i64[]` and the scan reads no width, and of the 907 for
`f64[]`, are in byte-identical files, so no consumer reads the scan's answer there. The 23 differing
files fall in two classes, and a file can hold calls of both, so they are counted by file:

* 13 hold a literal whose recorded element is a nullable or a union where the scan reads a width
  (`mty_*_arr2un_f64`, `capture-union-list-*`). The legacy build is a scalar list, and the typed
  answer lets the box rep drive.
* 10 hold only the opposite class: the rep is `f64[]` and the scan reads none. These are an inner
  literal of a nested list at a type parameter or an `f64`/`i32` join (`d581_nest_f64_*`,
  `d591t_nest_f64_i32`, D2273, D3529). Every one of the 23
prints the same output both ways. In 21 the typed build is smaller, by 3 to 39 bytes. One is the
same size and one is 14 bytes larger. A second twin also read the widths of a nullable's or a
union's members, and it was worse: 70,320 agree. Legacy boxes most union elements (`arrLitBoxElem`)
and reads a width only for some of them.

It is not switched, because 23 files differ in bytes. **For a ruling:** switching to the rep's width
changes only these 23 programs, with the same output in each. That is the emitter following the rep
it reconciles, so the change would be a decision that the box build is the right one for a nullable
or union-element literal under a scalar-width scan.

**Not tried this round:** `arrLitElemNameTpl` and `refListElemNameOfExprRaw`. Round 27 found their
misses in the function-value list rows (group 3).

**Census:** unchanged, 31 probed. **Seed:** unchanged (no compiler change).
