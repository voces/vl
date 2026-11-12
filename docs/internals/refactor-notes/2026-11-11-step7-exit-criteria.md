# Step 7 exit criteria: what stands between master and deleting §7's L1, L2 and L6 lines, 2026-11-11

Step 7 completes when `ARCHITECTURE.md` §7's deviation lines L1 (§3.5, §4.1), L2 (§2.4, §3.4,
§4.1) and L6 (§3.3, §4.1) can be deleted. This note lists, for each line, what remains.

It is measured on master `77d45015` (#7288), with a fixpoint seed of 6,623,600 bytes. The counts
come from closing census 3 (`2026-11-11-step7-closing-census-3.md`), re-run where master has moved
since. Each open PR's effect is measured on that PR's own tree against its merge base.

Each remaining site is graded one of two ways:

- **floor:** named and accepted by design in architecture-target, a DECISIONS.md ruling or a
  coordinator ruling;
- **convert:** a site that must change before the line can go.

## L1: instance reads of a type holding type parameters

**What the line cites:**

- 94 of the emitter's 959 `nodeTyIxOf` call lines read a type holding type parameters while an
  instance is emitted (`2026-11-11-l1-instance-reader-recount.md`, master `2fb114d7`, 19,544 files).
- `bindGenWalk`: 3 call sites in `emit_mono.vl` and 23 in `emit_elab.vl`, by grep today.
- `monoArgTyName`: 6, by grep.
- No open row. The (c) literal is gone.

**Floor or convert:** the 94 have not been classified. On 2026-10-24 each of the then 78 had a
by-design reason. Of today's 94, the elaboration's 15 include its reads of the template's own type
(`elabCheckedTyOf`, `litRepTyIn`, `litRepTyAt`), which are by design. The line can go only once
every site is either classified by design or converted to `nodeTyAt(ix, fnIx)`.

**In flight:** w318 is staging the deletion, and #7243 (w318) converts the empty `[]` readers. Its
effect on the 94 is not measured here: the recount's instrument poisons a seed, and it is not
committed.

**Unowned:** nothing, since w318 holds the line.

**Exit item:** w318's classification of the 94, one class per site, with every non-by-design site
converted.

## L2: render-then-parse, two-producer classifiers, rows minted under a name

**What the line cites, re-measured:**

| measure | line as written | census 3 | now | instrument |
| --- | --- | --- | --- | --- |
| `tyToEmitName` calls | 50 | 35 | 35 | `render-parse-census.vl --out`, then `vl check --budget … --findings` |
| type-string parses | 86 | 60 | 59 | the same |
| classifiers reading NAME directly (call sites) | — | 52 (107) | 51 (106) | `rep-classifier-census.vl -- --summary` |
| classifiers reading SPELLING directly (call sites) | — | 12 (29) | 12 (29) | the same |
| ARENA + NAME / ARENA + SPELLING pairs | — | 15 / 2 | 14 / 2 | the same |
| `rlRowNameOfTy` | — | 16 | 16 | grep |

**In flight:** only one open PR moves render-parse, measured on each PR's own tree against its
merge base.

| PR | lane | renders | parses |
| --- | --- | --- | --- |
| #7298 (mono argument-ladder and lambda pins) | w317 | 35 → 28: `monoAnnPinNameOfTy`, `monoConcreteFnPinName`, `monoFnTyPin`, `monoHoleMapPinName`, `monoLamPinName`, `monoLitUnionPinOfTy`, `monoPinLamAtTys` | 60 → 60 |
| every other open step-7 PR | — | unchanged | unchanged |

#7231 (w309) keeps `anonMapValName`'s render, now only as a test that the render is not empty.

**The renders, by class:**

| class | sites | grade | owner |
| --- | --- | --- | --- |
| diagnostics: `cloCallSigRejectWhat` ×4, `nulNicheIsTestImpossible`, `mapSoftTwinTagFail`, `emitMapUnionPayloadTail` | 7 | floor (render-parse-residue's measured floor) | — |
| the `clo:` link key: `cloSigNameOfTy` | 1 | floor | — |
| recorded TypeRef texts: `synthTypeRefOfTy`, `lvSpellOf` | 2 | floor | — |
| nominal spellings: `nominalizePartOfTy`, `nodeMapArmNominalName` | 2 | floor (the residue's D3) | — |
| mono pin names (`emit_mono.vl`) | 16 | convert: 7 in #7298, 9 left | w317 |
| key producers: `anonMapValName` (D8), `listUnionEmitName` (D5), `internShapeDeepOfTy` and `internArmShapeRow` (D6), `nulRefElemEmitName` (D1) | 5 | convert, when D1, D5, D6 and D8 key by type | w309, w311, w310 |
| union names: `registerRetJoinUnions`, `retFlagsSeedResult` | 2 | convert, with the union key | w316 |

The renders' floor is **12**; 23 must convert, 7 of them in #7298.

**The parses, by owner:** the residue's parse floor (`cboxElemNeedsParens`) is gone, so every
parse converts.

| file | parses | owner |
| --- | --- | --- |
| `emit_base.vl`, the `nameIs*` predicates and `monoSubstAnn` | 21 | w310 (D6) |
| `emit_shape_rows.vl` | 22 | w311 (shape rows and ref-list keys); `fieldCodeOfSpelling` and `nameFieldCode`, w314 (cut 5); `mapValKindLowerable`, w309; `nulScalarListKind`, with w314 |
| `emit_mono.vl` | 6 | w317 |
| `emit_shape_intern.vl` | 5 | w310 (D6) |
| `emit_map_value_slots.vl` | 2 | w309 |
| `emit_union_registry.vl` | 2 | w316 |
| `emit_union_atoms.vl` (`ensureRefElemTys`) | 1 | w311 |

**Named floors that wait on another lane, not conversions anyone can start:**

- `mvValKindOfSpelling` and `mapValKindLowerable` (#7260): F1 and F2 wait on w314's field-type
  column, and F3 on Family B;
- `scalarListRepOfName` and `nulScalarListKind`, which die with those ladders (coordinator ruling,
  #7303);
- `retStructRowIndex`'s name rung (109 programs, #7296): it switches to the type with the struct
  and variant name producers, below (w324).

**Rows minted under a name:** `rlRowNameOfTy` (16) is w311's (ref-list rows keyed by type and
declaration). The 15 slot-layer name producers are below, under L6.

**Unowned:** nothing in L2 lacks a lane.

**Exit item:** renders at 12, parses at 0, and the two-producer classifier pairs explained. The
classifier census has no ratchet, so the figure to close on is "every ARENA + NAME and ARENA +
SPELLING pair is a named floor". There are 14 + 2 today.

## L6: registries keyed by spelling

**What the line cites, re-measured:**

| measure | line as written | now | instrument |
| --- | --- | --- | --- |
| module-scope `{[string]: i32}` / `{[i32]: i32}` maps in `emit_*.vl`, `wasmEmit.vl` | 56 / 41 | 45 / 94 | grep of `let` and `const` declarations annotated with exactly that type |
| `structIndexByName` call sites | 81 (a wider count) | 35 | live grep |
| the union registry's name-taking entries | — | 36 of 36, 272 call sites (census 2; not re-measured) | the union-registry census method |
| `canonUnionKeyOfName` | — | 21 | live grep |
| `registerInlineUnionAt` / `mintInlineUnion` | the inline union's row and key are its name | 10 / 2 | live grep |
| `nliInferLet` | one of two value-union registrations that hand over no type | 3 | live grep |
| exported type-equality notions | 8 | 8 (`tyEq`, `tyEqSameHoles`, `tyEqNoneIsMap`, `tySame`, `tySameSet`, `tySameSpelled`, `tySameAnonRow`, `repCanonId`) | grep of `export function` |

**The slot layer's name producers:** 15, unchanged since census 3 (`vkind-census.vl --
--slots-list`).

- **struct (10):**
  - `structIndexByName`, `repStructRowByName`;
  - `structIndexOfTypeName`, `structIndexOfTypeNameTy`, `structIndexOfTypeNameGo`;
  - `shapeElemDeclaredStructIdx`, `armFieldStructRow`;
  - `structRowOfSpelling`, `structRowOfNameTy`, `structRowOfAnnTy`.
- **variant (1):** `variantIndexOf`.
- **reflist (4):** `calleeAnnRetRefListSlot`, `rlRowOfNameMinted`, `rlSlotByName`, `rlSlotByNameK`.

Family B's grading puts most of the struct names on one road. #7269 grades `variantIndexOf`'s 53
sites, #7294 grades `structRowOfSpelling` and `armFieldStructRow`, and #7300 names the step-7
remainder as `retStructRowIndex`'s name rung. w324's census (#7306) then shows that no
`(type, declaration)` key is needed:

- a newtype brand is erased;
- twins and arms share heaps;
- D1023 is a value test, not a row key.

**In flight:**

| PR | lane | what moves |
| --- | --- | --- |
| #7261 (the softened key's near-dead readers) | w316 | `canonUnionKeyOfName` 21 → 18 |
| #7252 (direct typed lookups ask the canonical type key) | w316 | no grep count moves; the union registry entries |
| #7232 (every typed lookup but the one-list readers asks the canonical key) | w316 | the same |
| #7236 (frame-leaf ref-list row asks the inner literal's type) | w311 | names three ref-list name producers as floors |

**Floor or convert:**

- **The struct and variant name producers (11), and `retStructRowIndex`'s name rung:** convert.
  Each switches to the type and is deleted. w324 owns it, in cuts (#7306). Nothing in step 7 is
  unowned.
- **The ref-list name producers (4):** w311. #7236 names three of them floors.
- **The union registry's name entries, `canonUnionKeyOfName` and the inline-union mint:** convert,
  on the union registry's cut order items 5b–6 (w316).
- **`nliInferLet`:** convert, so that it hands over its type. It is in the union lane (w316).
- **The map counts:** not a site list. The line's figure counts declarations, not readers. Its
  exit test has to be stated per registry: each spelling-keyed map is either re-keyed by type or
  named as a floor. No instrument lists them by reader yet.
- **The eight type-equality notions:** the line states them as a fact, not as a deviation to fix.
  Proposed: keep them as a floor, or move them out of the deviation line into §3.3's contract
  text, as a ruling.

**Exit items:**

- the 11 struct and variant name producers and `retStructRowIndex`'s rung switched to the type
  and deleted (w324, #7306);
- the union registry's cut order completed (w316);
- a per-registry list for the spelling-keyed maps, which needs an instrument;
- a ruling on the eight equality notions.

## The scoreboard targets

architecture-target §4 says the scoreboard "reports side effects of the migration; it is not a
landing criterion". Neither target gates step 7. They are graded here because the coordinator
asked.

**emit_classify ↓.** 14,557 lines and 620 functions on master. The reference is 14,412, from the
2026-11-10 census, so the file is 145 lines over.

- **In flight:** the open PRs that touch it net about −8 lines (#7261 −1, #7252 −1, #7243 0,
  #7255 −1, #7231 −5). #7261 and #7252 may share their hunk.
- **A dedicated cut:** `dead-exports.vl`'s reachability rule finds no dead function in it (#7287).
  The 29 single-caller helpers were ruled kept: a name with a contract comment beats 140 lines.
- **Why it grew:** each step-7 conversion added a typed read where a name read was, and an
  invariant `emitFail` where a silent default was (`2026-11-11-step7-classify-trim-1.md`).
- **Not reachable from in-flight work.** The lines that go with step 7's remainder are the name
  ladders' callers. They leave with w324's switch of the name producers and the union cut order,
  and their size is not estimated here.
- **Ruled (coordinator, 2026-11-11):** re-baseline the target at step 7's close, with that reason,
  graded by the measure it stood in for: the classifier census's NAME and SPELLING readers.

**seed ↓.**

| reading | bytes |
| --- | --- |
| census 2 (`505f30b3`) | 6,620,813 |
| census 3 (`0a9e9948`) | 6,623,286 |
| now (`77d45015`) | 6,623,600 |
| the seed-size gate's baseline (#6986, 2026-11-09) | 6,589,035, +0.5% against today |

- **The trend:** the PRs that delete move it down by about 250 bytes each (#7294 −248, #7300 −261);
  conversions move it up.
- **In flight:** no open PR is a large deletion.
- **Not reachable from in-flight work.** §4.2 expects step 7 to cut the seed sharply (↓↓); the
  deletions that would do it are the name ladders, the same set as emit_classify's.
- **Ruled (coordinator, 2026-11-11):** re-baseline at step 7's close, with the conversions' cost
  named, as `2026-11-01-seed-growth.md` did for an earlier step. It is graded by the measure it
  stood in for: the name ladders deleted.

## The list to close step 7 against

1. **L1:** w318's classification of the 94 instance reads, each by design or converted.
2. **L2:**
   - renders to the floor of 12, with 9 mono renders after #7298 (w317) and 7 key and union renders
     (w309, w310, w311, w316);
   - parses to 0, with 21 in `emit_base` (w310), 22 in `emit_shape_rows` (w311, w314, w309), 6 in
     mono (w317), 5 in the interner (w310), 2 in map values (w309), 2 in the union registry (w316)
     and 1 in `ensureRefElemTys` (w311);
   - the 14 ARENA + NAME and 2 ARENA + SPELLING pairs named.
3. **L6:**
   - the 11 struct and variant name producers and `retStructRowIndex`'s rung switched to the type
     (w324, #7306);
   - the union cut order items 5b–6 (w316);
   - the ref-list name producers (w311);
   - an instrument listing the spelling-keyed maps by reader;
   - a ruling on the equality notions.
4. **The scoreboard (ruled):** re-baseline both targets at the close with their reason, graded by
   the measures they stood in for. They are not landing criteria.
