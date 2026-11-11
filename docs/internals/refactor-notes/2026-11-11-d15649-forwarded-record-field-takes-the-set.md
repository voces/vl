# D15649: a call through a forwarded record field makes its parameter take the set, 2026-11-11

Clause-2 close, and a clause-1 close with it (D15701). Base is master `2842f92a`.

## What was wrong

`bothD(g) { return cf({ f: g }, 2.5) }`, with `cf(r, x)` returning `r.f(x)`, hands `g` on only
inside a record literal. D15638's forward note binds `cf`'s `r` at `{f: Fn#s}`, and
`elabMintParamRowFactAt` (emit_elab.vl) deliberately notes no fact for `r.f(x)` there: a fact
builds arms that type the literal and `cf`'s parameter at two struct types of one layout (tried:
invalid wasm in 52 grid programs that ran). With no direct call of `g`, nothing named `{dbl}` to
the decision after the elaboration, and nothing recorded that `cf`'s parameter takes it, so
`ftLateParamOk` refused `bothD(dbl)` when a list caller (`bothG`) did try the set. `{dbl}` stayed a
closure, and `bothG`'s calls at two types had no one signature.

## The change

On the skipped call, where the instance types the field at a set the check did not:

- `mintParamSetNote(decl, pri, set)`: the parameter takes the set, as the list spelling's
  `r[0](x)` fact already records (`elabMintFactAt`).
- `mintFwdFieldSetNote(set)` (check_mint.vl): the set is a candidate of the late decision, tried
  in `fnTagDecide`'s second pass beside D15432's held sets, and counted by `elabMintFacts` so the
  decision runs though no fact was noted.

## The row the change exposed (D15701)

The first push was vetoed: `functions/hole-in-literal-handed-to-hole-callee-result.vl` built
invalid wasm. There `bothF` (an uncalled hole) and `bothD` (a called one) hand `{ f: g }` to
one `cf`. Once `{dbl}` is tagged from `bothF`'s side too, each literal is built at its own
anonymous row: each function's record type is its own type index, `tySame` but not aliased, so
`structIndexOfTy` found the row for the first only. Master builds the same invalid wasm when
both functions call `g`, check-clean (D15701). `mintPinnedObjLit` (emit_collect.vl) now gives a
literal whose record type is `tySame` as one an id row was minted or found at that row
(`litIdRowOfSameTy`, over `sLitIdTys`/`sLitIdTyRows`, emit_state.vl).

## Graded

A 1,296-program grid (scratch, not committed): record vs list × three callee shapes (one call,
calls at `1` and at `x`, through a second function) × four hand-on shapes (`g` called or not,
literal as argument or `const`) × binding of `{ f: dbl }` before, after or none × `dbl`, `idf` or
both handed × `x` at `4`, `2.5`, `"s"` × a list caller calling at two types or not. Master runs
962 (every list cell runs); this change runs 986: 24 emit reject → runs, 0 runs → not-runs. The
gains are the uncalled hole with a callee calling the field at two types, and D15649's record
beside a list caller. Measured again after the D15701 fix against `2842f92a`: the 1,728-program
version (a binding of `{ f: idf }` too) +36, 0 lost; a 2,220-program grid of the D15651 shape
(record value, binding position, hand order) +301, 0 lost; a 768-program grid of two hand-on
functions sharing one callee (the shape the first push missed) +36, 0 lost, 12 of them invalid
wasm on master.

**Not reached** (refused as on master): D15639 (`const r = { f: g }` beside a direct call,
checker); D15651 and its grid row (a record of `dbl` beside `both(dbl)`, `both(idf)`); the
uncalled hole handed in a `const` record (`const r = { f: g }; call0(r, x)`, emit, filed as
[D15700](../inventory/D15700.md)); a callee forwarding the record again to a second function
beside a list caller.

**Proof run locally.** refresh (fixpoint), D15649's and D15701's witnesses and the fixture, the
corpus oracle (`cases_wasm_0..3`, 7,436 passed), every `@run` case against `2842f92a` (only the
new fixture differs), the record matrix
(22 of 48, as master; no runs → not-runs), `check-filed-witnesses --strict` on both inventories
(D15649 moved, every other row as filed), distilled `regress.vl` (no runs lost; the two
`d15317_d380` cells move on master too), lint-self, seed size (+0.5%), late demands (6).
