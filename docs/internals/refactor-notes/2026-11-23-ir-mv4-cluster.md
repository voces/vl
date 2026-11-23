# A `??` over a mono-closed binding read holds that binding's type (D17057, D17058), 2026-11-23

Lane IR-N6. This is a clause-2 capability fix in legacy mono. Two filed rows move from loud emit reject to runs.

## The family, by ablation

The witness is `const mv4 = m4["k"]; const got = mv4 ?? [inc0]; print(got[0](3))` at module scope, over a map of lists of un-annotated functions. Removing one ingredient at a time:

| removed | outcome |
| --- | --- |
| nothing | refused: `a function-value call has no interned signature`, parameter `_` |
| the intermediate `mv4` (`m4["k"] ?? [inc0]`) | runs |
| the call through the list (`const h = got[0]; h(3)`) | runs |
| module scope (the same lines in a function) | runs |
| the reassigned `b2 = [dbl]` | runs (the set is tagged, so the call dispatches by id) |
| `b2`, with the map holding one function | refused (no set in play) |

With the function set left as closures, `got[0](3)` takes the closure call. The set is left as closures because `ftHoldCtxOk` refuses the module-scope reassignment of `b2`, which is a chosen limit. `got`'s list type is `((_) => _)[]`, its ref-list slot is the `() => void` placeholder, and no key resolver answers.

## Mechanism

`monoBindingAdoptInit` gives an un-annotated binding the elaboration's closed type, but only when the initializer's held type (`monoInitHeldTy`) is closed too:

- `mv4`'s initializer is a closed map read, so `mv4` adopts `((i32) => i32)[] | null`;
- `got`'s initializer, the `??`, stayed open, because `monoInitHeldTy` followed only a bare read of a binding.

The fix: a `??` whose left side holds a closed type holds it too. It takes the non-null type, or the nullable one where the `??` result is itself nullable, as in a chained `a ?? b ?? [..]`. The same-ctor check and the elaboration agreement check (`holds another type than the elaboration's`) still guard the binding.

## Readings (base: master 2cc0a73d1 fixpoint; fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| identity by name: corpus, then self-compile | — | 9,037 identical, differ 0; self identical |
| `ir-identity --cases` | — | 7,672 identical, differ 0; witnesses differ 0 |
| tests/cases legacy bytes A/B | — | differ 2: the two new files, refused → build |
| claimless | — | 14,030 identical, differ 0 |
| capability probes run | 280 of 282 | 281 of 282 (the new probe) |
| capability probes whose bytes move | — | 1 of 282 (the new probe) |
| `emit-refusal-sites` (from source) | 13 concede, 873 unmatched | unchanged; no literal removed |
| distilled `regress.vl` | no runs lost | no runs lost; the same movements as base |
| armed self-compile covered = verified = matched | 20,072 | 20,072 |
| L2 self-compile fuel, per PR | — | +0.02% |
| late demands / late tag rows | 9 / 307 | 9 / 307 |

Legacy lines deleted: 0. Moved to `@ir`: 0.
