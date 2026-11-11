# Step 7 L2 §7: a list literal's placeholder element name no longer keys its row, 2026-11-11

This is the behaviour-changing half of the list-mint conversion. It sits on
`2026-11-11-step7-l2-arrlit-mint-hint.md` (#7184). That PR passed the literal's element type only
where the type key equals the name key. This PR drops that guard for the classes where the name is
a placeholder that denotes no type, and keys those rows by the type. Counts are **programs** over
the sweep's 23,885.

## Changed

`arrLitMintHintTy(i)` is `arrLitElemHintTy(i)`, else the closed element type the literal is built
at (`arrLitBuildTy`). It applies only where that type is a closure, or a list of `string` or `u8`.
A hole, a type parameter, a literal or a record keeps the name's key, as does any other element.

## Measured

The probe was an `emitFail` in a compiler built into scratch. It fires where the new hint keys a row
differently from the name. It fired in 67 programs:

| name | the type | programs |
| --- | --- | --- |
| `(()=>void)` | a typed closure (`(i32) => i32`, `(i32) => void`, `(i32, i32) => i32`, …) | 45 |
| `i32[]` | `string[]` | 16 |
| `i32[]` | `u8[]` | 6 |

All 67 were built and run with the #7184 seed and with this one. 0 change output. 52 build
byte-identical wasm. 15 build fewer wasm types, because the placeholder's own row is no longer
minted. 0 build more.

## Measured and left out

A first cut keyed every closed element type, against the literal's recorded element type
(`arrLitArenaElemRow`). It moved 95 programs. In 40 of them the build gained types: there the name
is `f64[]` against a recorded `i32[]`, and the list is built at the destination's widened element.
Switching to the build type (`arrLitBuildTy`) moved 111. Three of those failed:

| program | element type | outcome |
| --- | --- | --- |
| `closures/written-binding-of-generics-delivered-by-list-of-lists-literal.vl` | `((i32) => i32)[]` | `runs → emit_reject`: a list-of-lists element has no inner list shape: `i32[]` |
| `lists/spread-boxes-nested-and-pushed.vl` | `(string \| i32)[]` | `runs → emit_reject`: the same, for `i32[]\|string[]` |
| `unions/empty-list-is-narrowed-read.vl` | `i32[] \| string[]` | `runs`, with a wrong output (`-1` for `0`) |

A later reader looks those rows up by the placeholder name. A list of closure lists, a list of union
lists and a union of lists stay keyed by name until that reader takes the type. Numeric leaf lists
stay too: their recorded type can be narrower than the join the name spells. The silent wrong
output is the case to pin before anyone widens this.

## Proof

- One refresh, at 6,619,122 bytes.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse, kind-ladder sets, seed-size, rep-fuzz (exact),
  `cases_wasm` (7,438), `vl_check_codegen` and `vl_scaling_shape`.
- The full population is graded by CI's Sweep job.
