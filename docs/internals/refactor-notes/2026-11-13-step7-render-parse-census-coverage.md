# Step 7, lane H: what the render-parse census sees, 2026-11-13

"Type-string parses to 0" is an honest close only if `scripts/render-parse-census.vl` sees every
parse. It did not.

Before this change, the census:
- counted calls to ten named parsers, and only in `compiler/emit_*.vl` and `wasmEmit.vl`;
- had three of those ten names that no longer exist (`nameIsRefArray`, `mapValNameOf`,
  `refArrElemName`), so the list had drifted with nothing noticing.

The committed baseline was 1 parse and 8 renders.

## The instrument

Every call site of a type-spelling parser in `compiler/*.vl` was wrapped in a probe:

- **The parser set:**
  - every export of `tyname.vl`, the type-name grammar;
  - `nameToTy`/`nameToTyAt`;
  - the ad-hoc spelling scanners outside the grammar.
- **What the probe records:** a site only while `emitProgram` runs.
- **The run:** a scratch compiler, over the 24,170-program corpus (`vl check --batch --codegen`).

The control is D15042. It reaches 73 sites, and their callers read back to known emit paths.

## Findings

Two kinds of gap.

**A parser the census did not name.** Most emit-time parses go through a grammar export or a
spelling reader outside the ten, so they were never counted:
- `isValueUnionName` (23 emit sites);
- `valueAtomKind` (44 emit sites; its body is in `check_ty_rep`, so neither the call nor the body
  was seen);
- `annGenAppSpanEnds`, `groupInnerOf`, `gaeLtAt`, `tyTopLevelSplit`, and others.

**A file the census did not read.**
- `check_emit_queries.vl` is the emitter's query surface. Two `nameToTy` calls run there at emit:
  - `recordClonedNodeTyFb`, reached from `synthTypeRefFb` (78 programs);
  - `recordClonedIsVarTy`, reached from mono's `monoSubstIsExpr` (36 programs).
- The same file holds 5 `tyToEmitName` renders.

## The change

**Parsers.** The census's parser set is now:
- every `tyname.vl` export, read from the file, except the display rewrite `demangleSpelling`;
- an explicit `EXTRA_PARSERS` list: `nameToTy`, `nameToTyAt`, `resolveAnnot`, `canonEmitName`,
  `valueAtomKind`, `isValueUnionName`, `unionHasAtom`, and ten more.

**Stale names.** A listed parser declared nowhere in `compiler/` fails the census with rc 2, so
the list cannot drift again.

**Scope.** `check_emit_queries.vl` joins the emitter files.

**`--parsers`** prints the set.

**The control.** The fixture tree in `tests/vl_render_parse_budget_test.ts` adds:
- a grammar export call;
- a `check_emit_queries` call;
- the display rewrite, which must not count;
- a stale-name tree, which must exit 2.

Master's census over the same fixture is red; this census is green:

| census | lists |
| --- | --- |
| master | `emit_x.vl:9` ×2, `:20`, `:21` ×2 — misses `check_emit_queries.vl:1 nameToTy` and `emit_x.vl:13 groupInnerOf` |
| this | all seven, plus `valueAtomKind` at `:20` |

## The true count

| | before | after |
| --- | --- | --- |
| type-string parse sites in scope (static) | 1 | 149 |
| `tyToEmitName` renders in scope (static) | 8 | 13 |
| of the 149, sites that run at emit in the corpus | — | 115 |

**Emit-time parse sites the widened census still does not count, in scope: 7, each by design.**
- 4 are inside a parser's own body: `nullablePartOf` and `unionHasAtom` reading `spanEqAt` and
  `tyTopIndexOf`.
- 3 read parameter-hole identity keys (`elabHoleDeclOf`, `paramHoleName` in `emit_elab`), which
  are not type spellings.

**Out of scope: 148 `check_*` entry sites run during emit.** These are entry sites, not lines
inside a parser body. They are parses in checker files that emit re-enters, and they also serve
the checker, so a static per-file ratchet cannot own them:

| file | sites |
| --- | --- |
| `check_program.vl` | 48 (`canonEmitNameTs`, `inlineUnionGenAppShapes`) |
| `check_relate_core.vl` | 45 (`annotResolve`, the `nameToTyReal` family) |
| `check_ty_rep.vl` | 20 (`valueAtomKind`'s body, `nameIsInlineLitUnion`) |
| `check_lit_union_spell.vl` | 12 |
| 13 other `check_*` files | 23 |

Where the emitter enters one of these through a listed parser (`valueAtomKind`, `resolveAnnot`,
`canonEmitName`), the emit-side call is now counted. `canonEmitNameOfTy` (a type plus its render)
is not listed; the render it parses is named here instead.

The parser set comes from name-flow and character-scan heuristics plus a reading of each
candidate. It is a lower bound: a hand-rolled scanner outside `tyname.vl` that no heuristic flags
would still be missed. Every such scanner also breaks `tyname.vl`'s contract that every question
asked of a spelling lives there.
