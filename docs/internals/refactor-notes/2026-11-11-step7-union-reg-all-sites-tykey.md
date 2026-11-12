# Step 7 L6: every typed registry lookup but the one-list readers asks the canonical type key, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`) put 18 typed sites on
the canonical type key first (#7131), then the literal-set sites (#7152), then site 10 (#7186).
The rest still asked the softened key, `unRowOfKey(ty)`, which renders the type and keys the text.
That render is what keeps `canonUnionKeyOfTy` and `canonUnionKeyOfName` producing keys. This PR
measures every remaining site against the canonical key and moves all of them but two.

The base is #7208 on master `d63370ab`.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, compared
`unRowOfKey(ty)` with `unRowOfTyKey(ty)` at every typed site still on the softened key. It read
every `tests/cases` file and every distilled `cells/` cell (9,202):

- **Only site 45 saw no difference at all.**
- **"canon-only"** was the most common difference: the canonical key finds a row the softened
  key misses. These are recursive aliases (`Json`) and record unions spelled by shape
  (`{r: i32} | Sq`). Sites 9, 13, 16, 17, 24, 30, 31, 40, 46, 49, 75, 77, 88, 92, 95, 104 and
  106 saw only this.
- **"soft-only" and "differ"** were literal sets and newtypes the softened key folds together:
  `"x" | 7` under `string|i32`, `1 | null` under `i32|null`, a map value's literal set. These are
  sites 1, 4, 11, 12, 15, 18, 26, 27, 28, 29, 41, 42, 82, 89, 91, 93 and 94.

## Moved, and what moved with it

| step | sites | movers over 9,202 |
| --- | --- | --- |
| canon-only, plus 45 | 18 | 0 |
| literal sets and newtypes, all but 27 and 28 | 15 | 1 bytes-only |
| every other site (never reached in this population) | the rest | 0 |
| 27 and 28 | **kept on the softened key** | 3 stop building |

- **The bytes-only mover** is `generics/type-param-write-union-local-reads-at-pin.vl`. It needs
  sites 1 and 42 together, and neither moves it alone. The module is the same size and prints
  the same 14 lines.
- **27 and 28** (`emitLetDeclStmt`'s union and nullable-inline readers) are the D4320 one-list
  collapse. `i32[] | K[]` with `K = 0 | 1` is one list after numeric-literal softening, so the
  softened key finds the list's row and the canonical key, rightly, keeps two members. The census
  records that this question is decided on the rep before any row exists. On the canonical key,
  `unions/is-list-tests-every-element.vl`, `unions/one-list-member-union-positions.vl` and
  `unions/one-list-member-union-element-list-two-spellings.vl` stop building. These two sites
  are the softened key's last typed readers.

`unSiteOnTyKey` is now a rule rather than a list: every site but 27, 28 and 55. Site 55 keys on
`repCanonId`, as before.

## Also measured, not changed

`monoRegisterPinUnion` gates a pin's union on its spelling: `unNameBound(name)` and
`unionSetAtomsOf(name)`'s member count. Over the same population:

| gate outcome | reaches | programs |
| --- | --- | --- |
| name bound, type key finds the same row | 1,933 | 246 |
| name unbound, type key finds a row (the mint then adopts it by type) | 62 | 45 |
| member count disagrees with the type's (an alias spelling) | 28 | 14 |
| name bound, type key finds no row | 2 | 2 |

The mint behind the gate (`registerInlineUnionGo`) already asks the canonical key first, so the
spelling decides only the last two rows. Moving the gate would change those 30 reaches. It waits
for the name-only readers that still need the spelling bound.

## Proof

- **Bytes.** Every `tests/cases` file and every distilled `cells/` cell (9,202) was built with
  #7208's L1 seed and with this candidate's L1 seed. 9,201 are the same, and the one mover is
  bytes-only, as above. CI's sweep grades the whole population.
- **Locally:** one refresh, lint-self, rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, the dead-export and render-parse budgets, and `cases_wasm`.
