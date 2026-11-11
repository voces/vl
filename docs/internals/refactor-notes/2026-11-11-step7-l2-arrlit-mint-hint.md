# Step 7 L2 §7: the list mint passes the literal's own element type where the keys agree, 2026-11-11

`collectAArrayLit`'s list mint keys its ref-list row by `arrLitElemHintTy(i)`. Where that declines,
it keys by the element spelling. `2026-11-11-step7-l2-reflist-row-key-census.md` measured the
declines against the literal's own element type (`arrLitArenaElemRow`). The type key agreed with
the name key in ≥ 1,985 programs and disagreed in 458. This PR passes the type where the keys
agree, so no row moves. Base is master `02cf40c6`. Counts are **programs** over the sweep's 23,885.

## Changed

`arrLitMintHintTy(i)` is `arrLitElemHintTy(i)`, else the literal's closed element type. It declines
where the type holds an inference hole or a type parameter, and where the type key differs from the
name key.

The last guard is the transitional half of this cut. It keeps every key where it was. The rows it
still declines are the placeholder names (an empty inner literal spelled `i32[]` against a real
`string[]`), nullable elements, closures over literal types, and declared names keyed nominally.
The next PR drops the guard for the placeholder class, which moves rows on purpose.

## Measured

- The new hint is reached in 1,950 programs (first per program).
- A hint changes a minted row's recorded type (`rlElemTyIx`) where `fieldElemTyIxOfName(name)` is
  not the same type. That happens in 36 programs: `i32[]` against `boolean[]` (17), `string[]`
  against `(string | null)[]` (7), literal-union members (5), a `Json` map value (2), and others.
- Those 36, and 30 sampled from the 1,950, build byte-identical wasm against the base seed.

## Proof

- One refresh, at 6,616,677 bytes (+103).
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse (unchanged), kind-ladder sets, seed-size, rep-fuzz
  (exact), `cases_wasm` (7,436), `vl_check_codegen` and `vl_scaling_shape`.
- The full population is graded by CI's Sweep job.
