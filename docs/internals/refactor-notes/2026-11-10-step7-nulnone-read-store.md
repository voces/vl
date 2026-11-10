# Step 7: `exprIsNulNone`'s reads ask their storage, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, the second PR after
`2026-11-10-step7-read-rep-slots.md` (#7029), which has the shadow. Base is master `93b07f69`
(#7027), whose fixpoint seed is 6,596,277 bytes.

**Shadow** (from #7029's census, post-mono calls over 23,816 programs). For the name, field,
element and call reads that reach `exprIsNulNone`:

* Every true answer has a read rep whose store is `nulnone` or `fc37`: 244 names, 234 fields,
  65 calls, 38 elements.
* No false answer has such a store.
* Two false answers have `rrRead` `nulnone` over an `mv3` store, in
  `functions/linked-open-collections-take-one-pin.vl`.

So the twin is `rrStore`, not `rrRead`. A trial on `rrRead` printed `none` for that program's
`ma["a"] ?? "none"`, where master prints `q`. The read of an open `Map()` is typed `null` at that
site, while its storage holds strings.

**Switched.** `exprIsNulNone` answers a name, field, element or call read with
`kindIn(readRepOf(·).rrStore, READ_NUL_NONE_KINDS)`. This replaces the `isNullTy`-gated read-rep
arm, the `callIsNulNone` arm, the field code arm, the element and map-value arm, and the `Ident`
fall-through to the cell. Those are the producers `readStoreOf` already asks. It stays probed for
its `if` and `??` joins.

**Graded at the consumers.** A one-level candidate against the base fixpoint seed covered 1,148
programs: every `tests/cases` and distilled program that spells a `null` type, plus the
disagreement file. All 1,148 give byte-identical modules or the same refusal.

**Census** (`classifier-census.vl`, 32 probed classifiers on both sides):

* Total calls go from 11,249,602 to 11,347,221. Every read now asks the read rep, so its
  producers take more calls:
  * `mapReadMvSlot`: +188,786
  * `unionNameOfRead`: +162,653
  * `exprUnionCall`: +97,823
  * `cloArrCallRetKind`: +90,692
  * `calleeRetKindOfRead`: +73,361
* `structIndexOfExpr` falls by 517,677, because the deleted field arm asked `memberFieldCode`.
* `exprIsNulNone` goes from 658,670 to 658,610.

**Proof.** Both sides are fixpoint seeds: base 6,596,277 bytes, this PR 6,596,111 (−166).

* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* `cases_wasm` shards 0–3: 7,389 passed.
* `plumb-shape-cost --check`: ok.
