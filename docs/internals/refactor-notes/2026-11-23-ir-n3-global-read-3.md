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

`start uncovered global read coercion` 10 → 7; start covered and matched 7,245 → 7,247.

## Legacy tails the IR calls

None new: `globalStoredRead` and the `boxTag` null test the IR already builds.
