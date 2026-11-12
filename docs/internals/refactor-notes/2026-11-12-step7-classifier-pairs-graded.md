# Step 7 L2 exit: the two-producer rep classifiers, graded, 2026-11-12

The L2 exit criterion reads: every ARENA+NAME and ARENA+SPELLING classifier pair is a named
floor, or converted. `vl run scripts/rep-classifier-census.vl -- --summary` on master
`2c252adf2` reads:

| set | classifiers | call sites |
| --- | --- | --- |
| ARENA+NAME | 11 | |
| ARENA+SPELLING | 0 | |
| NAME | 40 | 73 |
| SPELLING | 6 | 10 |

The census classes a read by text tells. NAME is `tyToStr(`, `tyToEmitName(`, `tyNameOf(`,
`.tyName`, `nameIs…` and similar. SPELLING is `nullablePartOf(`, `nameIsShapeSpanEnds(`,
`indexOf(` and similar. A tell is not a second producer by itself, so each site below was read by
hand, and the decision is its grade.

**The new pair.** This afternoon's census read 10, so I ran the census on `git archive cf01f012`
and on origin/master and diffed the two lists. The one new pair is `internShapeDeepTyGo`
(emit_shape_intern.vl). #7600 (`1cfe43d1`) added it. Before #7600 the function parsed the spelling
`nm` (`normTypeAtom`) and read SPELLING without ARENA. Since #7600 it walks `tyAt(ty)` and renders
its registry key with `tyToNominalName(ty)` / `tyToEmitName(ty)`, which the census counts as NAME.

## The eleven ARENA+NAME pairs

| classifier | file | owner | what its NAME read is | grade |
| --- | --- | --- | --- | --- |
| `elabSlotCallTysOpenFns` | emit_elab.vl | I | a `tyToStr` key over each call's argument tuple, compared between calls | **converted**: the tuples are compared element-wise with `tyEq`, the notion that is "renders alike" (`elabCallTupAgrees`) |
| `elabMintOuterSlotFactAt` | emit_elab.vl | I | a `tyToStr` key over the argument tuple, handed to `mintFactNote` | **converted**: the key fed only `mintFactKey`, which nothing reads; the key, the column and the parameter are deleted at all three `mintFactNote` sites (check_mint.vl, lane A told) |
| `annTyIsRefList` | emit_collect.vl | I (lane F told) | `nd.tyName == ""`: whether an annotation is written | a **label** (presence), not a second producer; the rep is the arena's (`tyIsRefArray`) |
| `emitLetIfInit` | wasmEmit.vl | G | `tyNameOf(s.letType)`, the union box's name, handed with `nulTy` to `emitUnionBoxArg(siteNm, siteTy)` | lane **G**'s: it converts with that union-box reader; sent the site and the typed input `nulTy` |
| `jrFieldFitsAt` | emit_shape_rows.vl | I | `nameIsLitUnionArray(elem)` on the arm field's element name, at the `FC_I32_LIST` rung | **unreached**: a trap control on that rung fires in 0 of 24,178 programs, and two hand-written controls built to reach it (an arm with a literal-union list field, matched through `mvValArmOfShapeTy`) do not. The typed input is `et`, the arm field's element type. It is converted or deleted with the first program that reaches it |
| `paramStructIndex` | emit_sig_tokens.vl | B | `structRowOfAnnTy(ty.tyName, pty, pty)`: a struct-name producer | **closed by B** (#7615 asks the struct row by type). Its other read, `annIsSpelledInlineShape(…, ty.tyName)`, is converted below |
| `structIndexOfTypeNameTy` | emit_shape_rows.vl | B | `structIndexByName(name)`, then `nameIsWholeSpanShape(name)` | **closed by B**: deleted in #7615 |
| `retFlagsSeedResult` | wasmEmit.vl | G | `tyNameOf(fn.fnRet)` as the result's union name | lane **G**'s (union-box readers), in flight |
| `unionNameOfCall` | emit_classify.vl | G | `tyNameOf(fn.fnRet)` as the call's union name | lane **G**'s, in flight |
| `monoTagMapRepName` | emit_mono.vl | D | `tyToStr(m.mKey)` inside the pin spelling it builds from the arena | lane **D**'s (mono pin keys). It is one producer, the arena rendered into a key: an output, not a second source |
| `internShapeDeepTyGo` | emit_shape_intern.vl | E | `tyToNominalName` / `tyToEmitName` of `ty`, the union registry's key | lane **E**'s, in flight. The name is a render of the walked type, so this is one producer. The census pairs it on the render |

## The six SPELLING readers

| classifier | file | owner | grade |
| --- | --- | --- | --- |
| `annIsSpelledInlineShape` | emit_sig_tokens.vl | I | **converted**: it asks the annotation's tree alone. Its spelling fallback (`nameIsShapeSpanEnds(nm)` where the annotation has no tree) is reached by 206 programs, and a second probe that traps only when the fallback answers true fires in none of them. The fallback and its `nm` parameter are deleted |
| `funcTypeShapeLowerable` | emit_shape_intern.vl | E (field codes: H) | in flight with E |
| `structElemArrayLowerable` | emit_shape_intern.vl | E | in flight with E |
| `nulScalarListKind` | emit_shape_rows.vl | H | **closed by H**: deleted in #7609 |
| `refArrElemNameGo` | emit_shape_rows.vl | F | in flight with F (cut 4) |
| `refArrShapeKindGo` | emit_shape_rows.vl | F | in flight with F (cut 4) |

## Labels among the NAME readers

The coordinator asked which NAME readers are only labels. Of the pairs above, three NAME reads
decide no rep:

- `annTyIsRefList`'s read is a presence test.
- `monoTagMapRepName` renders a key from the type.
- `internShapeDeepTyGo` renders a key from the type.

The two `emit_elab` keys were comparison keys standing in for a type comparison; one is now that
comparison, and the other compared nothing. Lane B's two (`paramStructIndex`,
`structIndexOfTypeNameTy`) closed in #7615. That leaves 4 pairs that are a second producer:
`emitLetIfInit`, `retFlagsSeedResult` and `unionNameOfCall` (G), and `jrFieldFitsAt` (unreached,
mine).

## Proof

- **Census after this PR** (on its base it read 9 ARENA+NAME and 5 SPELLING; the two `emit_elab`
  pairs and `annIsSpelledInlineShape` are gone). Merged with master at #7615, it reads:

  | set | classifiers | call sites |
  | --- | --- | --- |
  | ARENA+NAME | 7 | |
  | ARENA+SPELLING | 0 | |
  | NAME | 33 | 64 |
  | SPELLING | 4 | 7 |

  #7615 removed lane B's two pairs, and #7609 removed `nulScalarListKind`.
- **Sweep:** both sides on fixpoint seeds (base `2c252adf2`), 24,178 programs: 24,178 same, 0
  bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Probes:** built by the master seed into scratch and never refreshed into `build/`.
  - The `annIsSpelledInlineShape` reach probe's control is the fallback trap itself, which fired in
    206 programs. The true-answer probe fired in 0 of those 206.
  - The `jrFieldFitsAt` probe has no control that fires; that is the finding, and the site stays
    unconverted until a program reaches it.
