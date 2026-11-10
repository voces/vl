# Step 7: `arrLitIsRefTpl` falls back to the emitter's build for its recorded type, 2026-11-10

Group 10 of `2026-11-09-step7-classifiers-remaining.md`, after #7076. Base is master `34f46a82`,
whose compiler is 6,598,974 bytes. Counts are post-mono calls over the 23,842-program sweep
population. The per-rung counts were read on `d21f4448`'s tree, which #7076 changed only in
`arrLitElemNameTpl`.

## The rungs

Each return was tagged. The twin is round 28's V2: `tyIsRefArray(nodeTyIxOf(arrIx))`, with a
tagged set's function element held as an id.

| rung | calls | the twin agrees | what it reads |
| --- | --- | --- | --- |
| empty literal: false | 34,698 | 28,909 | nothing. The destination decides an empty literal's kind (`arrLitFrameRefTy`, the binding's build). |
| closure-typed element: true | 2,634 | all | the checker's recorded element |
| lead object literal: true | 8,041 | 8,014 | the lead's build: a record literal builds a record |
| lead lambda: not a tagged-set leaf | 64 | all | the checker's tagged set (`fnTagLeafId`) |
| lead list literal over a scalar inner list: true | 2,735 | 2,690 | this classifier on the inner literal |
| union, map, nominal, nested and nullable element names | 11,948 | 11,926 | the checker's recorded element |
| **none of the above: false** | 29,469 | 28,745 | **nothing** |

The last row was the blind answer. Its 724 disagreements are 143 calls where the type is a ref
list, and 581 where the literal has no recorded list type.

## Switched: the default

Where no rung claims the literal, the answer is the build the emitter gives the literal's
recorded type: `listBuildOfTyHeld(nodeTyIxOf(arrIx))` is a ref, union-box or ref-at-slot list.
`listBuildOfTyHeld` mints nothing, so this is no mint-on-miss in a question reader. A type with a
hole or a type parameter has no build, and stays false.

Both defaults were A/B-built over the 48 files where the twin said ref at the default rung:

| default | byte-identical or the same refusal | different wasm | a build lost | a refusal becomes a trap |
| --- | --- | --- | --- | --- |
| `tyIsRefArray`, tagged set as ids | 22 | 9 | 13 | 4 |
| `listBuildOfTyHeld` is a ref build | 48 | 0 | 0 | 0 |

That run's tree carried #7076, whose 2 `d581_nest_str_str_*_typar` files are among the 9.

`tyIsRefArray` calls a literal-union list such as `Z[]` (`type Z = 0 | 1`) a ref list. The
emitter builds it as the i32 atom list, so `d362al_numlitun_unionmem` and
`d362in_numlitun_unionmem` built invalid modules. These are round 28's traps. The emitter's own
rule for the type has no such gap.

Over the whole population, the switched compiler builds every one of the 23,842 programs
byte-identically against master's. Refusals and traps are identical too. One trap banner,
D12131's, differs only in the seed size it prints. The new default answers true at 11 post-mono
calls in 5 files. In each of those, `arrLitFrameRefTy` or a caller's own rung already decides
the build.

`arrLitIsRefTpl` now reads the arena directly, and its probe is deleted. Three rungs ahead of the
default still pick by the lead element's node: the object literal, the lambda and the nested
literal. Each one answers with a fact about that element's build (a record, the checker's
tagged set, the inner literal's own classification), not a guess at the list's type.

## Census (`classifier-census.vl`)

| tree | probed |
| --- | --- |
| base `34f46a82` | 10 |
| this PR | 9 |

**Proof.** The fixpoint seed is 6,599,022 bytes (+48), byte-identical over two
`refresh-compiler.sh` runs. The whole sweep population A/B is above.

* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`, `vl_probe_rollback`,
  `vl_scaling_shape`: 7,511 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,689 as filed, 0 moved, 0 output mismatch.
