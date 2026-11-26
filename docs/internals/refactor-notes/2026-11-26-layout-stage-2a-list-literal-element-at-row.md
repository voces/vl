# Layout family stage 2a: a list literal's elements at the struct row its ref-list row lays out (2026-11-26, lane COV-START)

b000498 (102 census cells; COV-UNION's diagnosis, routed by the coordinator) is a list literal of
a maker's records handed to a generic. INFRA's witness is `reverse([mkcall()])[0]`, where `mkcall`
builds `{ r: null }` and an unused `type Shape = Circle | Sq` makes legacy lay that type out at
`Circle`'s struct row. Legacy writes `mkcall` returning `(ref $12)` and the list as
`array (ref null $12)`. The IR built the literal at its own rowless type, 663 (`{ r: null }`,
field `null`), which its ref-list slot also records. Every element missed `array element coercion`.

## The mechanism

- `elemRowTy`: a ref-list row's element type is the declared type of the struct row legacy lays the
  slot's elements out at (`rlElemStructRow`), where that row's rep is another record. A twin of the
  element's own rep (`recTwinRep`, stage 2) keeps its own rep. `listRowTyOf`, and so `listRowRep`,
  builds the list at that row's list, and the literal's build type follows (`rowed` in the
  `ArrayLit` arm).
- `listElemRowRep` and `listRepElemIs`: an element read is held at the row its list lays out, but
  only where the list operand is held at that list. A read whose type no struct row records (663)
  takes the row's element. A typed read takes it only where the row's type is another.

## Tried and dropped

- **The element type's own struct row (`structIndexOfTy`).** 663 has none. Only the slot's row
  (`rlElemStructRow`) finds `Circle`'s.
- **Every element read at its list's row.** It lost 5 programs, among them
  `generics/generic-body-list-union-read-ops.vl`, `lists/twin-row-record-list-positions.vl` and
  stage 2's own sweep (rule 2). A list held at a place keeps its own rep, so its read must not move.
  The read now moves only where the list operand's IR rep holds that element.
- **The row on the slot's element heap.** `lists/nested-record-list-beside-same-layout-declared-records.vl`
  (D6731) lost its start and a function: legacy keeps an un-annotated list at its own row beside
  declared twins on the same heap. Twins share a heap, so heap equality cannot tell them apart.
  The twin test does.

## Measured

Merged stage 2's seed against this tree's, over the same tests/cases.
- **Armed census:**
  - functions covered: 97,726 → 97,730;
  - verified: 97,726 → 97,730;
  - matched: 97,447 → 97,451;
  - no verifier failure and no mismatch class rose.
- **Per program:** two functions newly covered (`declaration coercion`):
  `records/intersection-recursive-twin-row-retag-positions.vl` and
  `records/plain-record-at-variant-twin-and-bool-list-at-i32-positions.vl`. Nothing newly missed.
- **b000498, shadow-4:**
  - before: `node-in array: miss array element coercion` and `blockers array element coercion`;
  - after: neither, and no other blocker. One `node-in array: miss fragment rep` node row remains;
    it is a node shadow row and blocks nothing.
- **`$VL_IR_REQUIRE_CLAIM=1 vl run`** (the claim acceptance check) on the witness and on the sweep:
  - master's seed exits 1 on both (`the IR declined this statement (array element coercion)` and
    `(index element coercion)`);
  - the head exits 0 on both, and the sweep prints `1`…`5`;
  - control: D17131, still a fallback, exits 1 on the head.
- **Sweep:** `tests/cases/lists/maker-list-literal-at-union-member-row-into-generic-positions.vl`.
  The witness reads an element in a closure, in a function, bound, as an argument, and the
  list's length. On merged stage 2 it shows `blockers index element coercion` (2) and its start is
  uncovered; on the head it is clean under shadow-4 and prints the same.
