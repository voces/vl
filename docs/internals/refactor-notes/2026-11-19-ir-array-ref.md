# IR coverage step: a short plain ref-list literal, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10, chosen by the blocker census. Measured
on fixpoint seeds of this branch and its master base (`65327211c`).

## Why this class

The census (`ir-shadow.vl -- --blockers`) on the master fixpoint put `array ref` third among the
classes that alone keep a function uncovered: 491 corpus functions, and 108 self-compile
first-misses. The scalar list arms' long builds (`array long or seeded`) block 7 self-compile
functions and none in the corpus's top classes, so they wait for the slice that deletes the five
scalar writers (IR2 agreed the order).

## What landed

- **One shared decision.** `arrLitRefPlainSlot` names the ref-list slot a literal builds at when
  it is within the chunk cap and every element builds as itself: no union box, no non-null
  variant coercion, no record twin, no narrowed unbox, and no list element a non-list slot does
  not hold. `arrRefSlotPlain` is `arrRefSlotOf`'s slot without its refusals; legacy keeps them.
- **One shared tail.** `arrLitRefShortTail` writes the backing, length, capacity and wrapper;
  the chunked build ends through `arrLitLenCap`.
- **Legacy consumes the decision.** `emitArrRef` asks `arrLitRefPlainSlot` first and, where it
  names the literal's slot, writes each element with `emitExpr` and ends through the shared tail;
  only the other literals take its per-element ladder. One decision serves both emitters, so an arm
  added to `emitArrRefElem` later cannot leave the IR shipping uncoerced bytes (review, option b).
- **The IR.** `arrayLit` builds a ref list along that decision, each element delivered at the
  list's element rep; `makeList` writes the shared tail. Every other ref literal misses as before.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| corpus functions covered (45,675) | 30,648 | 30,699 |
| `array ref` alone (corpus census) | 491 | 240 |
| self-compile functions covered (18,842) | 12,655 | 12,680 |
| self-compile first-miss `array ref` | 108 | 8 |

Functions gained per compiler line: 76 over +74 net (100 added, 26 deleted), about 1.0. Of
legacy's lines, 26 are deleted from `emitArrRef`'s and `arrRefSlotOf`'s bodies, against the
decision (`arrLitRefPlainSlot`, `arrRefSlotPlain`) and tail (`arrLitRefShortTail`) moved into
shared functions both emitters call. Most of
the 251 functions `array ref` no longer blocks alone stop at their next class instead.

## Bars

| bar | reading |
| --- | --- |
| self-build | fixpoint at the second compile |
| corpus identity (`ir-identity.sh`), master seed against this seed | 9,034 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `--names` | the same, 0 differ |
| `--cases` | 7,508 identical, 68 fail under both, 0 differ |
| armed shadow, corpus | 30,699 covered, 30,699 verified, 30,699 matched |
| armed shadow, self-compile | 12,680 covered, verified and matched |
| mode 3, corpus and self-compile | see the PR body |
| L2 fuel, seed size, late demands, phase-state, regress | in tier; see the PR body |
