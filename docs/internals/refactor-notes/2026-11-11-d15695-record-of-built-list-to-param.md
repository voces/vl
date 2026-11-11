# D15695: a held record handed to a field-read parameter of its own type is instanced at its build, 2026-11-11

Clause-1 close. Base is D15694's branch (#7161) over master `94b382ce`.

## What was wrong

`const r = { ys: xs }; use(r)`, with `xs = [mk2()]` built at `J[]` and
`use(r: { ys: { f: i32 }[] })`. D15690 builds `r` at `{ys: J[]}` in the store column. The store
column runs after the record solve's delivery checks, so no rule saw `r` reach a parameter that
stores the element differently. The call handed a `{ys: J[]}` struct to a `{ys: {f: i32}[]}`
parameter, which is invalid wasm.

## The fix (checker)

- `storeHeldArgsAt` (check_store_rep.vl) runs where the store column adopts a record literal at a
  held build. Each read of the binding goes to `recHeldArgTakesRep` (check_fit_rules.vl).
- `recHeldArgTakesRep` is D14532's `recAnnArgTakesRep`, with the relation changed. The parameter is
  the read's own type over the build's field names, not a narrower record. Where the callee reads
  the parameter only for a field, it is instanced at the build (`recArgRepNote`).
- The read's other deliveries at its own storage are refused through `recHeldReadsOwnRefuse`
  (D15655). Before this they were invalid wasm.

## Graded

| cell | master | here |
| --- | --- | --- |
| `use(r)` reading `r.ys[0].f`, `.length`, a `for` over `r.ys` | invalid wasm | runs |
| two calls, a second own-type record to the same function, `type R`, a second field | invalid wasm | runs |
| the callee binds the parameter, `const q = r` | invalid wasm | check reject, D15698 |
| `use({ ys: xs })` | check reject | check reject |
