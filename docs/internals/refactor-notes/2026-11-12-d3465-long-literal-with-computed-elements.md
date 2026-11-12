# D3465: a long scalar literal with computed elements builds from a data segment plus stores, 2026-11-12

This closes D3465, a clause-1 row. A literal of 2.7 million elements with one computed element
built a start function past wasmtime's 7,654,321-byte body limit. D3417's data segment
(`arrLitDataBuild`) declined any literal with a non-constant element, and the chunked build costs
a few bytes per element.

## What changed

`arrLitDataBuild` (`compiler/wasmEmit.vl`) takes a scalar literal past the `array.new_fixed` cap
with computed elements too:

1. Each computed element holds zero bytes in the passive segment.
2. `array.new_data` builds the backing into a lazy-frame slot (`arrLitDataKind`).
3. The computed elements are stored with `array.set`, in source order, so their effects run in
   the order the chunked build ran them.

The body is a few bytes per computed element, not per element. `arrLitDataStores` admits the
i32, i64, f32 and f64 forms, and only an element the literal's own loop would lower as one scalar
of that form. Anything else returns 0, and the literal keeps the chunked build. A string, ref or
record literal of that length still chunks.

## Witnesses

- **D3465's repro:** 2,700,002 elements. It runs, and prints `2700002`, then the computed
  element `4`.
- **The same in a function:** runs.
- **`tests/cases/literals/long-literal-with-computed-elements.vl`:** 10,500 constants with
  computed elements, at i32 (with a side-effect order check), f64 and i64. `wasm-dis` shows
  three `array.new_data`.
- **f32 and string spellings:** checked by hand and unchanged. The string literal keeps its
  chunked build.

## Measurement

This changes the module bytes of any scalar literal past the cap with a computed element, so the
sweep is CI's under the `sweep` label. Expect bytes-only movers there.
