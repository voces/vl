# Step 7 L2 §7: every closed list-literal element keys its row by the build type, 2026-11-11

`2026-11-11-step7-l2-arrlit-placeholder-rekey.md` (#7190) keyed a list literal's row by its build
type only for closures and lists of `string` or `u8`. Keying every class failed three programs,
D15711's witness among them. Two causes were found, and both are now gone:

- The element readers took the shared row's first-minter spelling as its union. #7218 has them ask
  the row's type.
- A row keyed by a list of lists (kind 9) did not intern its inner rows by type.

This PR sits on #7218. Counts are **programs** over the sweep's 23,885.

## Changed

- `arrLitMintHintTy(i)`: the closed build element type for every class except a hole, a type
  parameter, a literal or a record. A record's declaration is its identity, and that waits for
  w319's struct-row key.
- A type-keyed list mint whose type is a list of lists goes through `ensureRefElemTys(name, ty, ty)`,
  so its inner rows are interned by type before the outer one.

## Measured

The probe was an `emitFail` where the new key differs from the name key. It fired in 166 programs:
`(()=>void)` against a typed closure (46), `i32[]` against `(i32 | null)[]` (17), `string[]` (14),
`f64[]` (14), `u8[]` (6), `i32[] | null` (5) and `(i32 | f64)[]` (5), and smaller classes. All 166
were built and run with the #7218 seed and with this one.

| | programs |
| --- | --- |
| output changed | **0** |
| byte-identical | 103 |
| fewer wasm types (a placeholder row no longer minted) | 53 |
| the same types, reordered | 8 |
| more wasm types | 2 |

The 2 that grow are `D4874` and `arrays/list-literal-join-widening-runs.vl`. In both, the literal is
named `f64[]` while its recorded build type is `i32[]`, narrower than the numeric join its elements
hold. The extra row is unused and the output is right. That is the price, named here, of a build type
that misses that join.

D15711's witness and the two former refusals
(`closures/written-binding-of-generics-delivered-by-list-of-lists-literal.vl`,
`lists/spread-boxes-nested-and-pushed.vl`) print what they print on master.

## Still keyed by name

- An inference hole or a type parameter in the element: generic or hole function values whose rep
  is the tagged function set (w321's census, #7212).
- A record (w319), and a literal union.
- A variant literal delivered into a union, which is built unboxed by design (D36).

## Proof

- One refresh, at 6,620,735 bytes. The comment edit gave a byte-identical seed.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse, seed-size, late-demands, rep-fuzz (exact), `cases_wasm`,
  `vl_check_codegen` and `vl_scaling_shape`. `check-filed-witnesses --strict` grades every row as
  filed, with D15711 running.
- The full population is graded by CI's Sweep job.
