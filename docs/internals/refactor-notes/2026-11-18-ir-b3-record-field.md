# IR B3: the record field read, and the driver census, 2026-11-18

Lane IR2. The blocker census put `list length rep` first, 1,348 self-compile functions alone. It
was a mask. `buildMember` refused the list's rep before it built the receiver, and the receivers
are record field reads (`declAnnTy.node.length`). Admitting every list rep alone gained 77
functions, and `member record` rose to 3,095. This step takes both.

## What landed

- **A list of any element is a value** (`refRepOk`). Each read, write and walk over it still
  decides its own arm. An element read of a packed `u8` list is a named miss (`index packed
  element`).
- **A record rep is a value** (`valueRep` admits `RRecord`).
- **The plain field read is one decision, shared with legacy.**
  - `memberReadPlain`: `emitExpr`'s plain member arms, with no null-unit or niche read, no
    `length`, no two-list use and a receiver read raw. B2's `narrowedFieldPlain` now starts from
    it too.
  - `variantFieldPlain` and `variantFieldTail`: a bare variant receiver.
    `emitMemVariantRead`'s variant arm writes through the tail.
  - `structFieldPlain` and `structFieldTail`: a plain struct receiver with no narrowing op and
    no union-box field. `emitMemStructRead` writes through the tail when no narrowing op applies.
- **`RGetField { gfV, gfIx, gfAt }`** is built over that decision.
  - `gfIx` is the field's position among the record rep's fields, in the type's field order
    (`repRecordKidOf`). The struct's own field order can differ, and the verifier's rule 2
    caught that on the first build.
  - A field whose rep is not the read's is a named miss (`field read coercion`).
  - The lowering writes the receiver, the struct or variant tail, then `emitReadRecover`.
- **`RGetField` is the `record` family, and `record` is claimed.**
- **`irLSkip` consumes a field read's receiver.** A loop-hoisted list such as
  `declAnnTy.node`, held in a local by legacy, is skipped together with the global read beneath
  it. This fixed the 14 functions whose lowering had stopped at "non-stack temp: out of order".

## The gate220 fixes, and the pre-path guard (G0, folded in)

The merge queue's gate red B3 on master 665aeae3: four `tests/cases` programs became invalid
modules and one an emit error. They are outside the distilled corpus these bars ran on. Every
claim decision now misses on those shapes, and the armed shadow over all of `tests/cases` plus
`scripts/capability-probes` (10,340 programs) is a standing bar: 35,526 covered, 35,526 matched,
no `fail` row.

- **A field whose row stores another kind** (`fieldStoresRead`). The rep says `str` where an
  adopted row stores the `i32` atom, and legacy converts at the delivery (D7445, D11030). The
  field predicates require the row's storage kind to equal the read's recorded kind.
- **`emitExpr`'s generic pre-paths** (`exprPrePathWhy`, at the top of `irBExprAt`). These are
  the table's coercions, a function tag's leaf and dispatch, the atom hooks, the nullable-atom
  place and niche, and the null-unit and niche reads, each a named miss. It turns the two wider
  record deliveries from a call into misses, and makes "no pre-path runs under a covered node"
  structural. Each check is asked only where it can fire (a dispatch at a call; the coercion,
  tag and atom checks at a node not typed a numeric or boolean primitive), and a dead `never`
  read at its own node, which keeps it to about 0.2% of L2 fuel.
- **A `.push` on a record's field named `push`** reads the checker's receiver type and misses
  "member call on a record field". `pushPlanOf` had emitFailed on it once records were values.
- Three more, two of which master's own claim also shipped wrong:
  - a parenthesised call statement is that call statement, as in legacy's `emitStmt`;
  - an element read narrowed past its element's rep misses (`index element coercion`);
  - a return of a call's result boxed into a boxed nullable misses (`return of a boxed call`).
    Legacy tail-calls it when the box writer writes nothing, a choice made on bytes the
    lowering cannot see ahead.

Their price is 7 self-compile and 9 corpus functions. New first misses, self-compile / corpus:

| miss | self-compile | corpus |
|---|---:|---:|
| `pre-path coercion` | 5 | 90 |
| `pre-path tag dispatch` | 0 | 88 |
| `pre-path tag leaf` | 0 | 83 |
| `pre-path atom hook` | 10 | 0 |
| `return of a boxed call` | 11 | 338 |
| `member record` (now with the storage check) | 13 | 296 |

## Coverage

Fixpoint seeds of master 665aeae3 and of this step, each built from its own checkout.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 8,386 | 11,011 | **+2,625** |
| corpus covered = matched = claimed (12,297 cells) | 28,695 | 30,400 | **+1,705** |

First miss, master → this step:

| first miss | self-compile | corpus |
|---|---|---|
| `list length rep` | 2,699 → 0 | – |
| `parameter rep record` | 1,568 → 0 | 1,530 → 0 |
| `member record` | 486 → 11 | 29 → 296 |
| `local rep record` | 163 → 0 | 588 → 0 |
| `parameter rep list` | 168 → 0 | 505 → 0 |

Net compiler lines are +221 (+253, −32), the pre-path guard and the gate220 misses included: 12 self-compile and 8 corpus functions per line.

Next doors, from the self-compile blocker census on this step (one class alone):
- `expression if` 1,127;
- `narrowed read` 653;
- `is guard` 566;
- `map read inline` 290.

## The driver census

`scripts/ir-driver-census.sh <seed>` counts calls into every top-level function of
`wasmEmit.vl` and `emit_*.vl`, in a throwaway instrumented copy of the compiler. It runs the
self-compile and the corpus twice: armed with claiming off, then as shipped. A function hit in
the first run and not in the second is reached only by functions now claimed, on this
population. That is where a deletion is sought, not its proof. Its five rows are in
`2026-11-18-ir-driver-census.tsv`.

- Of 7,572 emitter functions, 6,365 run with claiming off and 6,360 with claiming on. The other
  1,207 are reached by nothing on this population.
- Of the five candidates, `emitIndexBanked` is the armed shadow's own element-read row writer,
  so it is not a claim effect. The other four are rare arms: `emitStrCpLen` (674 calls),
  `emitF64RemCall` (10), `fbF64Neg` (3) and `emitArrF32` (1).
- So at about 60% of the self-compile claimed, legacy's drivers are still reached by the
  unclaimed functions. The census becomes a deletion list as coverage closes the doors above.
  The largest falls today are `emitCallCoreFromCodePoint` (348 to 2), `emitCharLitNode` (6,747
  to 383) and `emitCallCoreFromCodePoints` (4,074 to 349).

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; master's fixpoint seed builds this source to it byte for byte |
| corpus identity, master seed vs this seed | 9,030 identical, 3,267 fail under both, 0 differ; `--names`: 0 differ |
| `--claims` and mode 3 | 11,011 self-compile and 30,400 corpus claimed, 0 fell back; mode 3 corpus identity 0 differ |
| `tests/cases` and probes, armed shadow | 35,526 covered, 35,526 matched |
| shadow | all matched; the armed self-build is byte-identical |
| L2 self-compile fuel | 96,464,709,530 to 96,852,171,467 (+0.40%; the pre-path guard about 0.2%) |
| pin helpers in `emit_mono.vl` | 904 |
| phase-state census | ok |
