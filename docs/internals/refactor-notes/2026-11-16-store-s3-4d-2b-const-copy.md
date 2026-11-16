# S3.4d step 2b: a `const` copy of a parameter reads the parameter's sets, 2026-11-16

Lane STORE. This is the first bucket of the breakdown of the mint facts the arrow solve misses
(step 2's note, and the coordinator's order: set, then norow, then open, before any deletion).

## The bucket

433 (hole call, set) keys were missing from the solve. In 209 of them, a row stood at the hole call
but resolved to other sets. Sampled cause: the hole callee is a `const` copy of a parameter
(`const hh = h; hh(1.5, 1.5)`), and the facts read a parameter's sets only through a `Param`
declaration.

`arrowParamDeclOf` now follows a `const`'s initialiser, copy by copy, to the parameter it
reads. Both the sets a hole call goes through and the parameter-takes table use it.

## Measurement

All `@run` programs, fixpoint seeds:

| key | before | after |
|---|---|---|
| (hole call, set) in both | 2,171 | 2,213 |
| mint only | 433 | 391 |
| programs fully covered | 421 | 434 |

This closes 42 of the bucket's 209 keys. The other 167 still resolve to other sets, for causes not
sampled yet; they are the next slice of this bucket.

The late-changed population is unchanged at 288: the keys this covers sit in sets something else
still blocks.

## Grading

- A/B, fixpoint against master's fixpoint: wasm and output byte-identical on all `@run` programs.
- The late-outside-exclusions probe fires on none.
