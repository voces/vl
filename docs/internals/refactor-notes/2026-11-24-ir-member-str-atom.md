# IR coverage: `member record` family E, a literal-set field stored as its string and read as its atom (2026-11-24, lane IR-N8)

Family E of `member record` (`2026-11-24-ir-member-atom-str.md`) is A+D mirrored. A literal-set
field beside a `string` field of the same tag in the same union is stored as the string by the whole
layout family (D14752). Its read records the atom (`i32`), but legacy's field tail leaves the
string, and the consumer takes it as it is: `"useA " + a.kind` is
`__str_concat__(global, struct.get $2 0 (local.get $0))`, with no decode. The IR asked for the read at
the atom and no plain predicate took a `str` row read as an atom.

- **`fieldStoresReadStr` (emit_plan_union.vl, private)**: `structFieldPlain` and `variantFieldPlain`
  also take a row stored as `str` when the read records the `i32` atom. Both stay IR-only, as in
  #9947. `exprIsLitAtom` is not a usable guard here: it reads false for this read.
- **The builder** (`buildMember`) reads such a field at its `str` storage, typed at that rep, the
  raw read A+D's arm already writes. The consumer takes the string where legacy's does.

## The hazard: a string where the type says atom

A consumer that reads the value as an `i32` atom would read garbage silently. Each such position is
a case in `tests/cases/unions/layout-family-string-field-read-as-atom-hazards-runs.vl`, and none is
claimed wrong:

- `match a.kind { "circle" => … }`: the read builds; the function declines on the builder's
  `rep ?` miss (a node of the `match` desugar with no rep).
- A map keyed by `K`, `m[a.kind]`: declines on `pre-path atom hook`, as on base.
- A `K[]` element `[a.kind]` read back and compared, a `K` parameter compared inside the callee,
  and `const k: K = a.kind` then `k == "circle"`: each declines on `atom tower place`, as on base.

The output is the same under legacy and with every function claimed. The verifier gets three cases
(`ir_selftest.vl`): a string field read at its storage and delivered holds; typed at the literal
set it fails rule 3; handed to an atom decode with no delivery it fails rule 2.

## Measured

Base #9947's head `4ff6037b3` (E is stacked on it), head this branch on it, both seeds fixpoints;
re-checked after merging master `2864c97c2`.

- Class regrade over E's programs: base 10 `uncovered member record`; head 77/81 functions matched,
  the rest the pre-existing `atom tower place`; the start's own `narrowed field read coercion` on
  both. With the hazard file, against master `2864c97c2`'s seed: 11 → 0, 79/88 matched, `match`'s
  function on `rep ?`.
- Census, each arm in a tree at its own commit (#26): `member record` rows 10 → 9.
- Covered-fell: tests/cases fell 0, rose 2; corpus fell 0, rose 0.
- L2 self-compile fuel per PR +0.01% on `4ff6037b3`; the pair (the head seed compiling the base
  tree) is +0.0006%.

Disassembly: `unions/layout-family-literal-set-beside-string.vl`'s `useA` and the position file are
byte-identical with `--names` under the base seed and under the head seed with every function
claimed.

Position sweep (Q58):
- `tests/cases/unions/layout-family-string-field-read-as-atom-positions-runs.vl`: return at `K`
  and at `string`, argument at `K` and at `string`, generic argument, `print`, string hole, concat,
  `==` with a literal, and a `K` binding. Base 6 `member record` of 75; head 71/75 matched, the 4
  others the pre-existing `atom tower place`.
- `scripts/capability-probes/matrix/variant-layout-string-field-read-as-atom.matrix.vl` (a union
  member) and `struct-layout-string-field-read-as-atom.matrix.vl` (an anonymous record of the
  same shape), both faces: 48 of 48 graded cells run, 0 silent, 0 `runs → not-runs`.
- Row: `tests/ir-shadow-rows/layout-string-field-read-as-atom.vl`, a union member, an anonymous
  record and a nested `h.a.kind`.

## Legacy tails the IR calls

None new: `structFieldTail` and `variantFieldTail`.
