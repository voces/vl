# IR coverage: a null test of a union box or a scalar map read (2026-11-20, lane IR-N1)

Two arms of `nulTestArmOf` the builder refused: `null test boxTag` (8 self-compile functions alone)
and `null test mapHas` (7). Measured on fixpoint seeds of this branch and of its merge base,
`6851d881`, each building this branch's source.

## The shapes

- **`boxTag`**: `x == null` over a `U | null` union box, mostly `const n = repNodeAt(r)` then
  `n == null`. Legacy writes the box, its tag, `null`'s tag and `i32.eq` (`i32.ne` for `!=`). That
  tail is now one shared writer, `nulTestBoxTagTail`, which legacy and `RNulTest`'s lowering both
  call. The operand must be held as a box (`heldAsBox`: `RBox`, or the discipline-4 nullable, which
  is the box itself and never `ref.null`), and the verifier's `RNulTest` rule accepts that rep.
- **`mapHas`**: `m[k] == null` over a scalar-valued map read. Legacy's `emitMapHas` is the same
  writer `m.has(k)` uses, so the builder builds the `RMapHas` that `mapHasRhs` builds for the call,
  now taking a receiver and key node, and negates it with `not` (`i32.eqz`) for `==`.

No new IR op and no new decision: both arms are legacy's `nulTestArmOf` answer.

## Coverage

| population | merge-base | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker (of 19,376 → 19,378) | 19,054 | 19,071 (+17) |
| self-compile covered = verified = matched (armed shadow) | 19,054 | 19,071 |
| corpus functions covered = verified = matched (45,678) | 41,780 | 41,881 (+101) |

The self-compile's +17 includes this change's two new functions (`nulTestMapHas`,
`nulTestBoxTagTail`), both covered, so +15 are the classes' own. In the self-compile `null test
boxTag` falls 8 → 0 and `null test mapHas` 7 → 0. `expression if union + null test boxTag` (1)
becomes `expression if union`. In the corpus, `null test boxTag` alone (120) leaves the census, and so
does every set it was in.

- **Byte proof:** mode 3 self-compile identical; `ir-identity --names` 9,037 identical, differ 0,
  self-compile identical; `--cases` 7,546 identical, differ 0, witnesses 61 same; per-file
  `tests/cases` A/B 8,660 same, differ 0.
- **Ratchets:** L2 fuel 104,685,486,128 against the merge-base's 104,683,723,346 (+0.002%; +0.7% on
  the stored baseline at both); late demands 9 (baseline 9); late tag rows 307 (baseline 307); seed
  6,929,038 bytes (+410 over the merge-base, +0.5% on the baseline); phase state, ladder sets,
  dead exports and lint-self clean.
- **Compiler lines:** +54 / −21.

The shadow pin for a field store of a short-circuit value now counts six covered functions.
Its `coal`, `x != null` over `i32 | null`, was blocked by `null test boxTag` alone.
