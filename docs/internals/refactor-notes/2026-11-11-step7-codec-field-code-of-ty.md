# Step 7 codecs, cut 4 producer: a field's code is read off its type, 2026-11-11

This is cut 4 of `2026-11-11-step7-codec-field-rep-column-design.md`, the producer half, done in
lane w310 by agreement with w314. `nameFieldCodeTy` coded a field from its spelling wherever the
descriptor (`fieldCodeOfTy`) declined. It now asks `fieldCodeOfTyCovered`, which reads the code
off the field's type for every class the type decides. The spelling ladder (`nameFieldCode`,
`fieldCodeOfSpelling`) answers only the three floors below and the untyped fields. It still
returns a code, and w314's cut 3 converts it at the push.

The base is master `765cf650`+, with fixpoint seeds on both sides. The population is the whole
sweep, 23,923 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the
accumulator of the predicates note. At every reach of `nameFieldCodeTy` it compared the code it
returned with `fieldCodeOfTyCovered(ty)`. It tagged a disagreement, a decline (-2) and an
untyped field (`ty` -1), each with the type's shape. The reach tag is the control: 10,273
programs reach it. Each class was added until it showed 0 disagreements and 0 declines. Five
rounds:

- **The `i32[]` pair (4 against 5).** Both are distilled cells holding a field `c: Z[]` with
  `Z = 0 | 1`. A numeric literal union stores its base scalar, so its list is the `i32` list,
  and the program prints `7` with code 4. `fieldCodeOfTy` coded every union element as a ref
  list. Its `TyArray` arm now asks the descriptor for a numeric-literal-union element. That is
  the one change to `fieldCodeOfTy` itself.
- **The classes the type now decides:**
  - `nameFieldCodeTy`'s own type rungs: a lone string literal, a closed record, an `i32` list
    behind `| null`, and an integer-literal list.
  - `fieldCodeForMatch`: a record with a row is 15; a map is 19.
  - A literal type is its base's code.
  - `null` is 37.
  - A nullable value is decided by its inner type: `string` 20, `boolean` 21, a literal union
    30, an `i32` list 18, a map 29, a scalar list 31–34 or 36, a ref list 28 through
    `nulRefListFieldCodeOfTy`, a number or an all-primitive union 16.
  - A `u8` list is 35.
  - A union whose members share one list code is that list (`i32[] | K[]`).
  - A union of primitives is 16.
  - A union the registry keys by type (`unRowOfKey`, `unRowOfCanonFolded`) is 16.
  - Anything left falls to `nulRefListFieldCodeOfTy`.

## Floors: the type declines, and the spelling answers

| floor | programs | why |
| --- | --- | --- |
| a type parameter (`TyVar`, alone or behind `\| null` or `[]`) | 82 | typed at its instance by cut 5. One shadows an alias by name, and the spelling codes it 15 |
| a list whose element is nullable, at any depth (B171) | 64 | kept on purpose: B171's mis-coded wrapper trapped on an out-of-bounds index |
| a union with a literal member | 21 | whether it is the box turns on whether its literals are a registered alias (`boolean \| K` is -1, inline `i32 \| "a" \| "b"` is 16). Only the spelling or the union registry (w316) says which |

## The 22 untyped programs

Cut 5 can delete the ladder only once these hand in a type.

- **11 with a leading-space field name (` i32`).** `fvaAnnotMinted` (`check_annot_resolve.vl`)
  spells a minted annotation with the display render `tyToStr`. The interner's field split then
  keeps the space, so `tyFieldTyOf` misses the field (`2026-11-11-step7-l2-shape-field-split-mismatch.md`):
  D15430, D6371, and `closures/if-arm-records-written-into-fn-widened-place-runs`,
  `maker-result-in-module-record-field-passed-whole`,
  `maker-result-in-module-record-field-returned-or-listed`,
  `record-generic-field-returned-handed-to-hole-param`,
  `functions/hole-handed-on-only-in-record-called-at-two-types`,
  `hole-in-literal-handed-to-hole-callee-result`, `hole-param-called-and-handed-on-in-record`,
  `set-in-record-literal-handed-to-hole-callee` and
  `set-of-boolean-fns-in-record-handed-to-hole-callee`.
- **6 with a `T` field.** The field belongs to a generic original's untyped shape: D15042, D1578,
  `distilled/named/d2781_cell_generic_body`, `d2781_run_generic_pattern`,
  `generics/list-param-union-with-type-param-length` and
  `unions/is-record-field-union-other-member-order`.
- **5 field walks with neither `tyIx` nor `fieldsTy`.** These are D4930,
  `closures/closure-value-union-array-struct-elem-list-field`,
  `generics/typaram-list-union-return-keeps-both-arms` and
  `unions/inferred-record-literal-list-union-arm-generic` and
  `structs/nested-union-softening-list-return-twin`. The last is the union of records that
  #7203 declines; its fields are split from `{f:string}|{f:{q:i32}}`.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,923 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 35 renders and 60 parses, with `--findings`. This cut is cut 5's
  prerequisite: the ladder's parses go only when it is deleted.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,444 with 0 failed.
  `check-filed-witnesses --strict` grades 4,731, all as filed. lint-self is clean. The export
  budget, with findings, has 0 dead exports.
