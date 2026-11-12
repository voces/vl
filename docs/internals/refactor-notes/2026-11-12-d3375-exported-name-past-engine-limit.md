# D3375: an exported name past the engines' 100,000-byte limit is refused at parse, 2026-11-12

This closes D3375, a clause-1 row: an exported function named past 100,000 bytes checked clean
and built a module wasmtime and V8 refuse to parse.

## What changed

`exportNameFits` (`compiler/parser.vl`) refuses an exported name longer than 100,000 bytes. It
names the limit and the name's length. It runs at two sites:

- the declared name after `export function`, `export let` and `export const`;
- every name in a re-export clause, `export { g as h } from "./m"`.

The refusal names a contract, the engines' limit on an export's name. Spelling the export some
other way would change the name the host imports, which is the module's interface. A
non-exported name of any length is untouched, since only the export section spells it.

## Witnesses

| spelling | before | after |
| --- | --- | --- |
| `export function` of 100,001 bytes, D3375's repro | invalid wasm | parse error |
| `export const` of 100,001 bytes | invalid wasm | parse error |
| a re-export aliased to 100,001 bytes | invalid wasm | parse error |
| `export function` of exactly 100,000 bytes | runs | runs |
| a plain function of 100,001 bytes, called | runs | runs |

No fixture carries a 100 KB name. The row's `@@repeat` witness is graded by
`check-filed-witnesses.vl`, and it grades as a check reject.
