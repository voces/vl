# A `null[]`'s fill and pushed element are its i32 sentinel (lane COV-START, null unit read rep)

**What.** The four `null unit read rep` units on master are generic functions instanced at
`T = null`. Each read a `null`-unit local at the unit's rep, which a value whose storage names the
i32 sentinel's niche (`nullOwnAt` = bool) cannot meet.

- `__array_new__` (`filled`) and `.push` (`insert`) delivered into a `null[]` at its element rep.
  They now write the i32 sentinel (`nulSentinelStore`), as an element store and a list literal
  already did. The verifier takes an i32 fill and push into a `null[]` at those two rules, as it
  does for an element write.
- `return self[0] = v` (`put`): a `null`-unit local read where the unit itself is asked, with no
  other null in context (`unitCtxAt`), is the bottom ref, which is what legacy writes. The rule sits
  on the local read only. A broader one in `nullUnitRepAt` also took an element read whose real
  destination is the i32 storage, and made `insert` an invalid module, so it was dropped.

**Measured** (per-function shadow-5 census, master `dfb9a8026` vs head, both probes built alike):

| population | fnc | fnu | newly claimed / missed |
| --- | --- | --- | --- |
| tests/cases | 88,543 → 88,545 | 183 → 181 | 2 / 0 |
| witnesses | 22,485 → 22,486 | 52 → 51 | 1 / 0 |
| capability probes | 650 → 650 | 4 → 4 | 0 / 0 |
| distilled | 46,954 → 46,954 | 10 → 10 | 0 / 0 |

`ir-identity.sh --cases`: 0 differ, behaviour 166 of 166 same, witnesses 81 same. `insert`'s
element copy (`self[i] = self[i - 1]`, a `null`-unit element read) still misses `null unit read rep`.
