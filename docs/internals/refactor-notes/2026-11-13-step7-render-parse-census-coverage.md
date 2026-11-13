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

## The true count, by origin

A parse is a violation only when its input came from a render or a synthesized name. Parsing source
annotation text is the checker's job. So each parse site is graded by where its strings came from.

**The instrument.** `scripts/render-parse-origins.ts` builds a probe compiler from a scratch copy of
`compiler/`:
- the first argument of every parse site in every compiler file is wrapped, so the probe records
  each distinct string a site receives during emit;
- each parser `mkTypeRef` records its spelling.

It checks the sweep's population of 24,207 programs, in fixed batches. Each string is graded:

| grade | test |
| --- | --- |
| synthesized | holds `#`, `$` or `@` |
| source | a parser spelling of this program, or (whitespace ignored) a substring of the program's text, of a module it imports by a relative path, of std, or of a parser spelling |
| bare | a bare identifier, which no text test can place |
| render | anything else |

A site that ever receives a render or a synthesized string is graded `render`. Graded only on
source strings, it is `source`. Bare-only and unreached sites stay ungraded. Two runs at different
`--jobs` grade the same.

**The control.** At D15042's instance, the arm sites receive `{f:f64}`, which no source holds:
render. They also receive `{f:i32}`, a slice of the user's `{f: i32} | {f: T}`: source.

**Two outputs:**
- `scripts/render-parse-origins.txt` grades the census's own sites. It records the probe's date,
  seed and population, and `--check` compares only its graded rows.
- `docs/internals/render-parse-sites.md` lists every reached site of any compiler file, the
  `check_*` ones included: its origin, the expression that produced its argument, the program
  count and a witness.

**How the census uses it.** It keys sites by file, enclosing function, callee and ordinal, and
reports three codes. All three are ratcheted, so:
- a new ungraded parse fails the budget until it is graded;
- a site regraded from source to render raises its file's `ty-string-parse` and fails, unless the
  PR that regenerates the file names why.

The control: one added `isValueUnionName(n)` in `emit_rep.vl` fails with
`ty-parse-unclassified: 5 (baseline 4)`.

| | before | after |
| --- | --- | --- |
| `ty-string-parse`: a render or synthesized name, the violation | 1 (ungraded) | **69** |
| `ty-source-parse`: source text only | — | 25 |
| `ty-parse-unclassified`: bare names only (20), unreached (34), empty only (1) | — | 55 |
| `ty-render`: `tyToEmitName` calls | 8 | 13 |

**How to read the numbers:**
- **69 is a lower bound.** A site counts only where the corpus shows it a render or a synthesized
  name.
- **25 is an upper bound, not 25 proven clean.** A render that happens to equal a source substring
  grades as source.
- **The 20 bare-name sites are unclassified.** 18 of them are `valueAtomKind` over a primitive.
  Before step 7 closes, each must be shown source (by an ablation, or the call site's provenance)
  or counted as failing.
- **The 34 unreached sites are deletion candidates**, by the same rule as other unreached arms: a
  loud floor, then a sweep.

**`ty-string-parse` by file:**

| file | (a)+(b) | (c) | ungraded |
| --- | --- | --- | --- |
| `emit_base.vl` | 10 | 1 | 9 |
| `emit_collect.vl` | 9 | 8 | 0 |
| `emit_shape_intern.vl` | 9 | 2 | 2 |
| `wasmEmit.vl` | 9 | 3 | 17 |
| `emit_union_atoms.vl` | 7 | 1 | 6 |
| `emit_rep.vl` | 6 | 0 | 4 |
| `emit_mono.vl` | 4 | 0 | 1 |
| `emit_obj_lit_fits.vl` | 3 | 2 | 1 |
| `check_emit_queries.vl` | 2 | 0 | 0 |
| 10 files with 1 each | 10 | 6 | 9 |
| `emit_field_codes`, `emit_if_arm_values`, `emit_map_twins`, `emit_rewrite` | 0 | 2 | 7 |

**By parser:**

| parser | (a)+(b) sites |
| --- | --- |
| `isValueUnionName` | 16 |
| `valueAtomKind` | 14 |
| `groupInnerOf` | 5 |
| `peelGroupParens` | 3 |
| `resolveAnnot` | 3 |
| `nameIsLitUnionArmValueUnion` | 3 |
| 7 parsers | 2 each |
| 11 parsers | 1 each |

## Not counted

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
`canonEmitName`), the emit-side call is counted and graded. `canonEmitNameOfTy` (a type plus its
render) is not listed; the render it parses is named here instead.

The parser set comes from name-flow and character-scan heuristics plus a reading of each
candidate. It is a lower bound: a hand-rolled scanner outside `tyname.vl` that no heuristic flags
would still be missed. Every such scanner also breaks `tyname.vl`'s contract that every question
asked of a spelling lives there.
