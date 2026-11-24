# IR-N3: `global read coercion`, part 3 — a null test of a narrowed union-box global (2026-11-23, lane IR-N3)

A union-box global the checker narrowed past one member (`string` out of `string | R | null`, a
record arm out of `R | null | { tag }`) is typed at the rest, a rep that is no box. Legacy's null
test on the `boxTag` arm reads the global as its cell stores it and compares the box's tag
(`struct.get 0` against the null tag). The IR read the operand at the narrowed rep and missed as
`global read coercion`.

## The operand (`nulTestOperand`)

On the `boxTag` arm, a module global whose cell is a box stored at its binding's own row, read
where the checker typed it at no box, is read as the cell stores it (`globalStoredRead`). Any
other operand is built as before. A local's spelling is unchanged: it misses at `narrowed read`
(N7's class).

## Grading (tests/cases, mode 1, fixpoint seeds)

| class | program | after |
|---|---|---|
| nullable → nullable union cell | `generics/lambda-record-result-at-generic-union-param` | covered, matched |
| nullable → nullable union cell | `arrays/mixed-nullable-record-string-literal` | → `narrowed read` (N7) |
| box → nullable union cell | `soundness/union-with-nullable-record-alias-member-runs` | covered, matched |

On master 73c87bffa (mode 4): `start uncovered global read coercion` 9 → 6, `start uncovered narrowed read` 2 → 3, start covered and matched 7,268 → 7,270; the corpus is unchanged (45,524 of 45,678 functions with no blocker).

## Legacy tails the IR calls

None new: `globalStoredRead` and the `boxTag` null test the IR already builds.

## Measured (fixpoint seeds on both sides)

Full proof on base master 41c3d2f6: byte A/B 20,121 programs 0 moved; `ir-identity --cases`,
`--claimless`, `--names` differ 0 / differ 0 / self-compile identical; mode 3 self byte-identical;
corpus shadow 45,524 matched, 0 order rows; self-compile guest fuel 123,638,803,546 →
123,638,834,572 (+0.00%). After the operand's bound test (the gate's `sentinel-index-unguarded`
finding) and a mechanical merge of master 73c87bffa: `gate.sh --fast` passed, `ir-identity
--cases` differ 0, byte A/B 20,125 programs 0 moved.
