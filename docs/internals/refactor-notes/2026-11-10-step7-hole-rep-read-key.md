# Step 7: a hole binding's covered rep is its producer's key; group 2 closes, 2026-11-10

This round follows `2026-11-10-step7-hole-rep-and-kept-row.md` (#7036). The shadows ran on master
`c73fe4c5` (29 probed). The census and proof are on the tree merged with `cc8c522e` (28 probed,
after #7038 typed `exprUnionCall`). It takes the two classifiers left in group 2 of
`2026-11-09-step7-classifiers-remaining.md`: `calleeRetKindOfRead` and `calleeReturnsStructIdxOfRead`.
Both decoded the key `calleeCloSigKeyOfRead` resolves for a function-value callee read. Every count
below is post-mono calls over the 23,818-program sweep population, under `$VL_CLS_CENSUS=1`.

**Where #7036 left it.** A twin that read only the read's type missed 7,442 calls. 6,722 of them
answered from the binding's producer: the lambda its initializer lowers, keyed by `cloSigKeyExt`. The
binding's type is a hole, or a function over a type variable, and the checker binds it per call.

**What a typed reader needs.** The producer attribution, by the initializer of the binding the read
resolves to:

| initializer | calls | files | the checker's declaration link reaches the binding |
| --- | --- | --- | --- |
| a lambda literal (`const`) | 7,823 | 128 | 6,884 yes, 939 another copy |
| a lambda literal (`let`) | 505 | 19 | 475 yes |
| a named function (`let`) | 1,362 | 81 | 1,075 yes |
| a named function (`const`) | 225 | 25 | 198 yes |

So the record the ruling asks for already exists: the read's declaration (`bindingDeclInScope`, else
`identDeclOf`), then its initializer's lifted function, whose key is interned where its signature
is collected. No new column is needed. The lifted node is often not the initializer's own node (an
instance copy), so a per-lambda record would not have reached the binding.

**Shadow** (`readCloSigKey` against `calleeCloSigKeyOfRead`, full key):

| twin | agree | disagree |
| --- | --- | --- |
| A: the mono field read's type, a narrowing, the read's closed type, then the declaration: an annotation's or parameter's instance type, an initializer's lowered key, an alias hop | 357,712 | 2,920 |
| B: A, ending in the read's own type at the instance (`calleeNodeSigKey`, which the legacy ladder ends in) wherever A finds nothing | 360,269 | 363 |

A's 2,333-call largest miss was a named function (`mk`, `pick`, `len`): no binding, so only the
read's own type answers. B's 363 are parameters typed as a hole or as another type parameter
(`typaram-binding-seeded-from-another-typaram.vl`, D12940, D6706) and three written bindings
(`coalesce-default-hole-function-over-map-read.vl`, D14881). The legacy ladder answers those from
its capture-frame rung.

**Graded at the consumers.** I built a compiler with B in place of both classifiers' key and
compiled every program that reaches either of them (10,337 files). I compared each against master's
fixpoint seed: **10,337 of 10,337 give byte-identical wasm**. The 363 differ in the key, but not in
the result kind or struct slot the two classifiers decode. I graded the final tree again the same
way: 10,337 of 10,337. Merged with `cc8c522e`, 8,510 files reach the two classifiers, and all 8,510
are byte-identical against that master's fixpoint seed.

**Switched and deleted.**

* `readCloSigKey` is B. `calleeRetKindOfRead` and `calleeReturnsStructIdxOfRead` are deleted, and
  their five call sites decode `readCloSigKey`'s key (#7038 removed `exprUnionCall`'s). The declaration ladder is a `_`-less `match`.
* `calleeCloSigKeyOfRead` stands for its other callers (`refListKeptSlotOfCall`, `cloCallSigKey`
  and others), which are not probed.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `cc8c522e` | 28 | 28 | 0 | 0 | 0 | 0 |
| this PR | 26 | 26 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds: two `refresh-compiler.sh` runs, byte-identical. Before the
merge, master `c73fe4c5` was 6,598,575 bytes and this PR 6,599,189 (+614). Merged with `cc8c522e`,
master is 6,598,554 and this PR 6,599,168 (+614). Late demands are 6,
the baseline.
