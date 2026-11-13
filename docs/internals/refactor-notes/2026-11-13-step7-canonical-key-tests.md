# The canonical-key test over the render-keyed tables, 2026-11-13

Lane A. The step-7 close accepts a type rendered to a string and used only as a dictionary key,
never parsed back, under the spelling-index contract, but only when the key is canonical for the
type. Every site that mints a row and every site that looks one up must give one row per type.
This note records that test for five tables. The variant-row table (`uVariants` / `uVarTyIx`) is
lane E's, in E's PR. Measurement only; no compiler change.

## Method

One probe compiler, built from master and never committed, adds:
- **A drain at the end of emit**, called right after `emitProgramRun` in `emitProgram`. It scans
  each table's type column in pairs and reports every hit in one `emitFail` per program, since
  `emitFail` surfaces only the first message.
- **A hook at each bind or reuse site**, for the second check.

The two checks, both over the full sweep population (24,140 programs):
- **(i) one type, one key.** No two rows whose types are `tySame` and `tyEq` carry different
  keys. Using `tyEq` keeps nominality, so a newtype's row beside its base's (`NtI32|null` /
  `i32|null`) is distinct by design. `tySame` alone flags 38 programs, all newtype pairs.
- **(ii) one key, one type.** No key is bound or reused for a row whose type differs.

A hit is graded by ablating a witness: what the two rows store, and whether the program prints
its expected output.

## Results

| table | (i) one type under two keys | (ii) one key over two types | grade |
|---|---|---|---|
| ref-list (`rlElem*`) | 0 | key is a rep id, so a merge is by design | floor |
| `unNames` (after #7772) | 0 | 0 | floor |
| mv slot keys (`mvValName` × `mvKeyKind`) | 0 | 0 | floor |
| mono instance keys | 462 hits in 95 programs, distinct elaborations | 0 | floor |
| shape_rows element names (`sFieldElemName`, R4d) | 190 hits in 41 programs | 35 hits in 12 programs | floor |

**Ref-list.** The dedup key is `repElemIdOfNameTy`, the element's rep id. Two spellings that share
one wasm wrapper merge on purpose, so (ii) measures only where the string decides the key: the
unhinted interns (`ty < 0`). There are 1,912 of them in 1,415 programs, keyed
`repElemId(resolveAnnot(name))`, and with 0 duplicate rows none splits a type from its hinted row.
D16001 (`M = Node & {…}` beside `Node`) was this table's one duplicate before #7775.

**`unNames`.** Keyed by name through `unRowBySid`. The hook at `unNameBindRow` and
`unNameShareTyKeyRow` finds no name rebound to a row of a different type. D16000 was this table's
one duplicate before #7772.

**mv slot keys.** A slot is found by type (`repMvValId` over `mvValTyIx`). `mvValName` is still a
string key in the link and relocation keys (`"map:" + kind + ":" + name`). No two slots of one type
share a kind and arm signature, and no `(kind, name)` key covers two slot types.

**Mono instance keys.** The key is (typed key, elaboration). The hook records the spelled key and
the typed key at each `monoMakeInstanceRegister`.
- No spelled key stands for two typed keys.
- The 462 repeats of one typed key under two spelled keys differ only in the elaboration ordinal
  (`E61|0|…` / `E61|14|…`), with identical type text. Reuse under a typed key is gated on
  `elabInstSpelling(hitKey) == elabInstSpelling(reqKey)`, so these are distinct functions with
  different bodies, not two rows of one value rep. Examples: D13260, D2722.

**Element names (R4d).** Lane I's nine `tyToNominalName` sites in emit_shape_rows key the element-row
column. `fieldTypeRefusalMsg` is an unreached diagnostic, going to lane F as a deletion. The test
runs on the column (`sFieldElemName` × `sFieldElemTyIx`), so it holds whichever site writes it.
- (i), declared structural twins, 27 programs (`R`/`S`, `Circle`/`Dot`, `A0`/`B0`; D1154, D14162,
  D15097): separately declared records each keep their own row, per the #7768 ruling.
- (i), `#anon` pairs, 14 programs (D15805, `d15209_nested_rec_*`): the two rows hold closures of
  different signatures, `[{r:{f:inc0}}]` beside `[{r:{f:half}}]` (i32 and f64), so they differ in
  storage. Their recorded types compare equal only because the hole function's type is unpinned.
  That is a checker coarseness, not a key defect. The witness prints `4` and `1.5`.
- (ii), `i32[]`, 8 programs: fn-tagged id lists share the `i32` list row by design
  (`fnTagListRepName`). The name is a storage label.
- (ii), `i32|null`, 2 programs (D15730, `null-field-at-inline-numeric-literal-union`): a numeric
  literal union beside `i32|null`, the same atom-storage fold.
- (ii), `{f:(i32,i32,i32)=>string}`, 1 program (`twin-fieldset-closure-field-string-vs-bool-result`):
  two layout-identical closure records collapse to one heap type, as that fixture documents. The
  `=>string` label also names the boolean-result field, which is misleading, but readers take the
  checker's type since that fixture's fix, and the program prints as filed.
- (ii), `boolean|f64|string|Json[]`, 1 program (`deep-is-json-shape-walk`): the label names the
  rolled and unrolled forms of the recursive `Json`, one type under `tyUnrollsTo` though not under
  `tyEq`. Its output matches its `@log` lines.
