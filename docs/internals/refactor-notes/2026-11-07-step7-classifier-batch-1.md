# Step 7: classifier deletion batch 1, 2026-11-07

Five type-blind classifiers in `emit_classify.vl` are gone. Each one's callers now read the
rep of a type (`repOfTy`, `repOfNode`), after a shadow over the sweep population found 0
disagreements.

**Method.** A scratch compiler computed the old answer and the typed one at every call, and
counted each pair through the census channel (`clsCensusEnter("SH <fn> agree|DIS …")`). It
was graded with `classifier-census.vl -- --compiler <shadow> --keep <dir>` over the sweep's
23,610 programs. The counts are calls, summed over both phases.

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `letIsNulRefArray` | `repOfTy(letBindTy(let, fn))` is `nulreflist` | 6 | 0 | deleted |
| `letIsF64Array` | the same reader is `f64list` | 3,087 | 0 | deleted |
| `readLoopElemKind` | `repOfTy(tyStepElem(nodeTyAt(iter, fn)))` | 202 | 0 | deleted |
| `letInitLoopElemKind` | the same reader, on the initializer's read | 10 | 0 | deleted |
| `loopVarReadIsAtom` | `repOfNode(iter, fn)` is not `strlist` | 20 | 0 | deleted, inlined |
| `letIsClosure` | binding rep is `closure` | 766 | 2 | kept |
| `moduleCopySigKey` | `sigKeyOfTy` of the init's type, its elaboration, or the read's | 3 | 12 | kept |
| `arrLitRefListRow` | `anonRefListElemKeyOfTy` alone (the code-5 key) | 92 | 6 | kept |
| `letIsRefArray` | binding rep is `reflist` | 4,530 | 3 | kept |
| `letIsNulString` | binding rep is `nulstr` | 150,300 | 1 | kept |
| `letIsStruct` | binding rep is `struct` | 3,125 | 67 | kept |
| `letIsUnion` | binding rep is `union` | 3,683 | 265 | kept |

`letBindRepKind` (the binding's `letBindTy` rep kind, or null when uncovered) and
`readLoopElemRepKind` are the two typed readers. `loopVarReadIsAtom` gave `false` only for
a local array literal of strings, and the shadow saw no `false`. Its typed check reads the
iterable's rep, so it also covers a string list the spelling never named.

**Why the kept ones stay.**

* `letIsClosure`: both disagreements are `let hh = h` over a hole parameter that a nested
  function captures (D14843, and its test
  `tests/cases/closures/error-forwarded-hole-param-alias-read-in-nested-fn.vl`). Both
  programs are refused at monomorphize. At the template the binding's type is open, so it
  has no rep, while the old ladder answers `closure`. Taking the elaboration's type when the
  rep is open fixes those 2 calls but breaks 45 others: `const v = a` over a hole
  parameter, `alias-of-fn-param-litunion-arg.vl` and D1626/D3147.
* `moduleCopySigKey`: all 12 disagreements are a module alias of a hole lambda
  (`const e = (y) => y + y`, D3868, D9130). Its type stays open at module scope and in
  every elaboration read here. The answer is the lifted lambda's lowered signature
  (`cloSigKeyExt`), which no type records.
* `arrLitRefListRow`: the literal route names the row of the first object literal, which
  for a mixed literal (`[p, null]` beside `{x}`) differs from the key the element type gives
  (`#anon0|null` against `{x:i32}|null`).
* `letIsRefArray`: all 3 disagreements are a template binding whose type is open (old
  `true`, typed rep uncovered): `hole-fn-own-result-and-direct-call.vl`,
  `empty-list-pushed-type-param-pins.vl`, `literal-read-in-place-and-bare-param-result.vl`.
  `letIsNulString`: 1, `generics/value-join-at-the-pin.vl` (old `false`, typed `nulstr`),
  the D3290 join. `letIsStruct` and `letIsUnion` were counted, not examined.

**Proof.** Fixpoint seeds against master `409a3a79`: 6,451,370 → 6,450,611 bytes.
Sweep base vs candidate over 23,610 programs: 23,610 same, 0 bytes-only, 0 output movers,
0 `runs → not-runs`. Census: 112 → 107 probed classifiers (pre-only 4 → 2, both 102 → 99,
post-only 6). `emit_classify.vl` is 16,155 → 16,086 lines.
