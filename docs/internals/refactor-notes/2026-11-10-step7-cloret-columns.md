# Step 7: classifier group 4, the closure result read off the return columns, 2026-11-10

Group 4 of `2026-11-09-step7-classifiers-remaining.md` held three classifiers: `cloRetValKind`,
`cloRetKindOf` and `cloRetValSlot`. This PR switches all three on master `9c5f881e`. Probed
classifiers go from 25 to 22.

**The missing fact was already recorded.** The brief asked for a per-function delivered-bundle row.
For an un-annotated function, `frsColsOfTy` (fn_ret_shadow.vl) already writes one when it reads the
return columns off the recorded result. A closure result that mono lowered as its bundle's record
becomes `fRetKind` `"struct"`, with `fnBundleRetRow`'s row in `fRetStructIdx`. The only thing the
columns lose is a plain closure result, which they key `i32`. The recorded result's rep says
`closure`. So the twin needs no new column, and `emit_elab.vl` is not touched.

**Method.** Shadow counts under `$VL_CLS_CENSUS=1` over the 23,826-program sweep population
(`classifier-census.vl --keep`, rows summed per class). Each legacy body was kept and compared with
its twin on every call.

| twin | agree | disagree |
| --- | --- | --- |
| A: `repOfTy(cloRetResultTy(fe))`, a closure with a bundle row read as `"struct"` | 740,216 | 27 |
| B: a declared result's annotation, else `fRetKind`, where `i32` over a recorded `closure` rep is `"closure"` | 740,243 | 0 |
| `cloRetValSlot` with A's bundle row on a closure result | 130,077 | 0 |

A's 27 calls are in 3 files: `D14082` (`__lambda_1`, variant), `D14782` (`deliverNested`,
ref list) and `d15270_generic_mk` (`mk`, record). In each, the recorded result names a ref where
the columns keep `i32`, so the recorded type alone is not the emitter's rep.

`cloRetKindOf` was graded at its two consumers. `fnSigKeyOf` mints a value-ABI key only where
`cloRetKindOf` and `cloRetValKind` agree on `i32` or `f64`. `collectMapFilterUse` asks only
whether it is `f64`. A second shadow ran B, as written in this PR, against the legacy
answers. Calls are per `cloRetValKind` call:

| question | agree | disagree |
| --- | --- | --- |
| `cloRetValKind` | 613,565 | 0 |
| `fnSigKeyOf` mints a key: legacy `r == vk && r in {i32, f64}`, typed `vk in {i32, f64}` | 613,565 | 0 |
| `r == "f64"` against typed `vk == "f64"` | 613,565 | 0 |

The first shadow also compared `cloRetKindOf` with A's kind folded to `i32`/`f64`/null. They
disagreed in 305 calls. 299 are the `nulstr` fold: legacy answers `"i32"` for an un-annotated
`string | null` result. The other 6 are in A's three files. `fnSigKeyOf`'s `vk == r` test refuses
all of them, and none is `f64`, so neither consumer could see them.

**What changed.**

* `cloRetValKind` (emit_classify.vl) reads a declared result's annotation. Otherwise it reads
  `fRetKind`, and returns `"closure"` where the column says `i32` and `fnRecordedRetTyFn`'s rep is
  `closure`. Its legacy arms are gone: `fnReturnsClosure`, `cbRetVariantIdx`,
  `inferredRetKindCore` and the f64-tail scan. B shows none of them changes an answer.
* `cloRetKindOf` is deleted. `fnSigKeyOf` keys on `cloRetValKind` directly, and
  `collectMapFilterUse` (emit_collect.vl) tests `rvk == "f64"`.
* `cloRetValSlot` loses its probe. Its kind is now typed, and the rest was already the result
  type's row or the columns written from it. It is listed in `classifier-census.vl`'s `NOT_BLIND`,
  because its type read goes through `cloRetResultTy`, which the ARENA tell cannot see.
* Without a reader now, and deleted: `tailIsF64NoLocal` (emit_local_scope.vl) and `paramIsF64`
  (emit_query.vl).

**Proof.** The fixpoint seed is byte-identical over two `refresh-compiler.sh` runs: 6,597,954
bytes, against master's 6,599,324. Seed size is +0.1% over the baseline. Late demands are 6,
the baseline. rep-fuzz is exact. The `cases_wasm` shards pass 7,395 with 0 failing.
`check-filed-witnesses --strict` grades 4,683 rows, all as filed. Every consumer gets the answer
it got before, so no program's output should move. The sweep re-proves that.
