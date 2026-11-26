# A list literal's element at another rep goes in by the cell converter (lane COV-START)

**What.** `arrayLit` missed `array element coercion` for an element whose rep was not the list's
element rep, unless the element was one `retagsAsStands` took. It now goes through
`irConvertStored`, the converter a cell of one rep uses: a retag where one admits it, a niche, a
box, else that converter's own named miss. An empty `Map()` element is built at the element's map
rep (`elemMapNew`), as `letMapNewHeld` builds a `let`'s.

**Units** (regen-10, COV-START):

| shape | units | result |
| --- | --- | --- |
| `list -> list` | `d16739_retann_ann`, `d16739_retann_unann`, `hole-fn-list-of-lists-annotated-return` (`__deliver`) | claimed |
| `closure -> nullable` | `generic-function-in-nullable-function-list-literal` (`@start`, `a`, `a$1`) | claimed |
| `map -> map` | `mty_par_maparr_f64`, `_i32`, `_string` (`@start`) | claimed |
| `nullable -> closure` | `map-read-at-twin-closure-rep-positions` (`pList`) | left: a narrowing, so the list's storage rep is the fix |

**Measured** (per-function shadow-5 census, master `a2f916d70` vs head, both probes built alike):

| population | fnc | fnu | newly claimed / missed |
| --- | --- | --- | --- |
| tests/cases | 88,528 → 88,531 | 204 → 200 | 3 / 0 |
| witnesses | 22,483 → 22,484 | 55 → 54 | 1 / 0 (2 moved to `convert record -> record`, COV-CALL's) |
| capability probes | 650 → 650 | 4 → 4 | 0 / 0 |
| distilled | 46,954 → 46,956 | 14 → 9 | 2 / 0 |

Start bodies claimed: tests/cases 7,532 → 7,533, distilled 9,423 → 9,426. `ir-identity.sh --cases`:
0 differ, behaviour 162 of 162 same, witnesses 83 same.
