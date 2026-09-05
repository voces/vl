# Code-quality survey — the front end and the checker

Read-only survey of `compiler/lexer.vl`, `parser.vl`, `ast.vl`, `tyname.vl`, `symbols.vl`,
`strutil.vl`, `typecheck.vl`, `check_query.vl`, `check_state.vl`, `json_walk.vl`
(41,206 lines, 1,493 functions, 750 exports). Line numbers are `e05d21131`; the profiles and
the A/B were taken on `facb9f610`, whose only difference is a comment-only edit to `ast.vl`
that shifts that file's numbers by one and leaves the seed byte-identical. Every number below
names the command that produced it in §9; nothing here was changed, and no fix is proposed
whose proof is not stated.

Three things dominate. **`nodeChildren` (`ast.vl:1683`) is the second-largest self-time centre
in a self-compile at 11.75%**, because it walks a 25-arm ladder and allocates a fresh array per
node — and 45.5% of the nodes it is asked about have no arm at all. **The checker's
definite-assignment set is a name-keyed `string[]` rebuilt in full at every write**, which is
the whole of the `vl check` call-site super-linearity that
`perf-opportunities-2026-09.md` §B6 measured (exponent 1.51) and left unattributed: on an
8,000-binding module, `daMarkAssigned` is 39.8% self and the three `da*` helpers plus their
`__str_eq__` are ~91% of the run. And **the lexer decodes every string escape into a field
nothing reads** — `Tok.value` and `Tok.stop` have zero read sites in `compiler/*.vl`, while the
live decoder is `decodeStr` in `emit_base.vl`, working from the raw lexeme.

Beyond those, the shape that recurs is *two implementations of one question*: two AST child
walkers, two type-name renderers that must agree character for character, two token records,
two reset surfaces, two ways to resolve a callee's declaration — and the last of those is a
live clause-2 violation with a three-arm witness (§3.1).

## 1 · Ranked top ten

| # | finding | value | size | risk | proof |
| --- | --- | --- | --- | --- | --- |
| 1 | `nodeChildren` allocates and walks 25 tag compares per node; 45.5% of nodes reach no arm, mean 17 steps (§5.1) | 11.75% of self-compile self time | M | low | `regress.py` 0 `runs → not-runs`; `tests/cases` emitted-module byte-identity; `--prove-fixpoint`; profile A/B |
| 2 | definite assignment is a name-keyed `string[]` rebuilt per write; module-level bindings all enter it in pass 1 (§5.2) | the whole call-site `O(n^1.5)`; 91% of an 8,000-binding check | M | low | the §9 A/B ladder at ratio ≤ 2.2; byte-identical seed if the set stays a `string[]`; else `regress.py` |
| 3 | `Tok.value` / `Tok.stop` written per token, read nowhere; `scanQuoted` accumulates a discarded decoded string in 13 statements (§4.1) | 775,815 dead field writes per parse of the compiler; removes one of two escape decoders | S | low | byte-identical seed is *not* available (the emitted lexer changes); `regress.py`, `deno task test`, `--prove-fixpoint`, `tests/cases` byte-identity |
| 4 | `fnParamNamesOf` reads the flat top-level `fnDeclIx` on the closure-callee path, so an unrelated function's parameter names decide whether a named argument checks (§3.1) | live clause-2 violation, three-arm witness | S | low | the three-arm table in §3.1 flips to `rc 1` on all three; `regress.py`; an inventory row |
| 5 | `tyToEmitNameGo` (271 lines) and `tyToNominalNameGo` (259) are 83.2% identical and must agree character for character (§2.1) | one drift surface; six duplicated sentinel-index hits collapse to three | M | medium | byte-identical seed (`refresh-compiler.sh` + `cmp`) |
| 6 | `checkFuncDeclNode` (1,288 lines) — the `if inferring` arm is 752 of them with 12 live locals crossing (§6.1) | the largest function in the tree halves | M | low | byte-identical seed |
| 7 | `checkCallNode` (996 lines) splits three ways at 2 live locals each; the 525-line member arm holds 31 of the 52 untested diagnostics (§6.2, §8) | readability plus a named test target | M | low | byte-identical seed |
| 8 | `jwKids` (`json_walk.vl:575`) is `nodeChildren` minus the annotation slots, maintained by hand (§2.2) | a new `Node` variant must be added twice, once outside the ladder ratchet | S | low | byte-identical seed |
| 9 | 66 of 750 exports have no cross-module use, 5 have none anywhere; no gate sees this (§4.2) | 21 exported mutable tables in `ast.vl` alone | S | none | `lint-self.sh` + `deno task test`; the LSP's own `unused-export` pass |
| 10 | `initChecker`'s contract says it resets all checker state; it resets 244 bindings and `checkProgramNode`'s prologue resets a **disjoint** 37 (§7.1) | no rule says where a new table goes | S | low | byte-identical seed if only the comment changes |

## 2 · Duplication

### 2.1 · Two type-name renderers, 83.2% identical, required to agree

`tyToEmitNameGo` (`typecheck.vl:10112`, 271 lines) and `tyToNominalNameGo` (`:10594`, 259
lines) are the same structural renderer. Line-level similarity of the code lines, no
normalisation: **0.832**. The differences are a nominal-first prelude in the second, the
atom-count global (`emitNameAtoms` vs `nomNameAtoms`), and the recursive entry
(`tyToEmitNameAt` vs `tyToNominalNameAt`). Their own comments state the constraint: the
literal-union leg "matches `tyToEmitNameGo`'s leg character for character — the two renderers
and canon must spell one arena type one way, or the name-keyed registries hold a row per
spelling."

The precedent for the fix is in the same file: `tyToStrGo(ix, nominal: boolean)`
(`:9415`) already parameterises exactly this axis for the diagnostic renderer. The proposal is
one renderer with the nominal prelude behind the same flag, one atom-count global, and the two
existing entry points as wrappers.

Corroboration that the duplication is not free: of `typecheck.vl`'s 47
`sentinel-index-unguarded` hits, **six are the same three reads twice** —
`T.tys[t.nInner]` and `T.tys[t.fnRet]` (twice) at `:10255/:10346/:10359` and again at
`:10745/:10820/:10831`. D1440 was `T.tys[t.nInner]` on a `-1` arena hole.

Size: M (a ~250-line merge). Risk: medium — the renderers feed name-keyed registries, so this
is the one refactor here where a byte-identical seed is both the proof and non-negotiable.
Proof: `scripts/refresh-compiler.sh`, then `cmp` against a seed built from the pre-change
source.

**Done 2026-09-05**, as `tyToNameGo(ix, ctx, nominal)` with one `tyNameAtoms` bank and the two
`At`s kept as the faces' entry points. The survey missed one divergence: the structural face
passes its interior positions through `appKidCtx`, which re-roots a registered generic
application's interior, and the nominal face does not — that is `nameKidCtx`, behind the same
flag. `sentinel-index-unguarded` fell 361 → 358 as predicted.

### 2.2 · Two AST child walkers

`nodeChildren` (`ast.vl:1683`, 25 arms) and `jwKids` (`json_walk.vl:575`, 22 arms) walk the
same closed `Node` set. `jwKids` is `nodeChildren` minus the type-annotation slots: it drops
`letType` from `LetDecl`, keeps only `fnBody` of `FuncDecl`, and has no `Param`, `FieldDef` or
`TypeDecl` arm. `nodeChildren`'s header says it "Covers value children and type-annotation
slots", so the two differ by a stated axis.

The ladder ratchet sees `nodeChildren` (`ast.vl:1687 nodeChildren Node 25/37`) and
`jwKids` (`json_walk.vl:579 jwKids Node 22/37`) as two separate entries, which is correct and
is also the cost: a new `Node` variant is two edits, and only one of them is anchored to a
walker whose default is documented.

Proposal: `nodeChildren` gains a value-only mode (or `jwKids` becomes a filter over its
result), so one arm table exists. Size S. Risk low. Proof: byte-identical seed.

### 2.3 · One scan written twice, run twice on the hit path

`nulFoldWrapperTyIxOf` (`typecheck.vl:10072`) and `nulFoldWrapperNameOf` (`:10089`) are the
same `for k in cUserTypes.keys()` scan differing only in whether they return the key or the
value. `nulFoldAliasNameOf` (`:10063`) calls both in sequence, so the map is scanned **twice**
whenever it answers:

```vl
export function nulFoldAliasNameOf(ix: i32): string {
  if nulFoldWrapperTyIxOf(ix) >= 0 { return nulFoldWrapperNameOf(ix) }
  ""
}
```

`aliasNameOfTyIx` (`:10027`) is a third scan of the same map, by value. Both scans iterate
`cUserTypes.keys()` in the same order, so `nulFoldWrapperNameOf(ix)` is
`aliasNameOfTyIx(nulFoldWrapperTyIxOf(ix))` by construction. Collapsing removes ~18 lines and
one whole-map scan per hit. Size S. Risk low. Proof: byte-identical seed.

### 2.4 · The `nodeTyIs*` / `nodeArrayElemIs*` family

35 exported predicates of the shape "resolve the node's recorded arena type, then test its
shape" (`typecheck.vl:25080` through `:28048`). Four pairs are structurally identical after
identifier normalisation (ratio 1.000):

| pair | lines each | differs by |
| --- | --- | --- |
| `nodeTyIsStructish` `:26415` / `nodeTyIsArrayish` `:26450` | 16 | the leaf kind tested after the same 8-deep one-member-union peel |
| `nodeTyIsNulStruct` `:26373` / `nodeTyIsStructArray` `:26527` | 15 | the leaf kind |
| `nodeArrayElemIsStr` `:27413` / `nodeArrayElemIsBareStrLit` `:27431` | 13 | `TyPrim("string")` vs `TyLit(kind "str")` |
| `nodeArrayElemIsNulBool` `:27391` / `nodeArrayElemIsNulStr` `:27448` | 17 | the prim name under the `TyNullable` |

The six `nodeArrayElemIs*` all begin with `nodeArrayElemPeelTy(ix)` then hop `TyArray → aElem`
by hand rather than through a shared `nodeArrayElemTy(ix): i32`; and they inline the leaf test
(`et.primName == "string"`) instead of calling the `tyIs*` sibling that already exists
(`tyIsPrimNamed` `:9623`). One helper plus six one-liners removes ~80 lines and puts the peel
budget of 8 in one place.

Nine of the 35 have exactly one caller each — `nodeTyIsClosureArray`, `nodeTyIsStructish`,
`nodeTyIsArrayish`, `nodeTyIsNulStruct`, `nodeTyIsNulBoolList`, `nodeTyIsNullableOneRep`,
`nodeTyIsNullableString`, `nodeArrayElemIsStr`, `nodeArrayElemIsBareStrLit` — each ~15 lines of
exported API. Size M. Risk low. Proof: byte-identical seed.

### 2.5 · Three hand-written appends to one five-column table

`symDecl` (`typecheck.vl:5704`), `symDeclInOuter` (`:5759`) and `symUse` (`:5803`) each append
to `symOccTok` / `symOccDecl` / `symOccIsDecl` / `symOccTy` and call `symOccRecordTok` by hand.
The first two share ten identical trailing lines. The columns are in lockstep today (3 push
sites each, verified), but nothing enforces it: a sixth column would be three edits, and a
missed one desynchronises the table that every LSP position query indexes. One
`symOccPush(tok, decl, isDecl, ty)` covers all three. Size S. Risk low. Proof: byte-identical
seed.

### 2.6 · Two token records

A token exists in three shapes. `Tok` is declared twice — `lexer.vl:108` (module-private:
`kind, text, value, start, stop, line, col`) and `ast.vl:20` (exported: `kind, text, pos, start,
line, col`) — and the module cache holds a third as five parallel columns,
`modCacheTokKind/Text/Start/Line/Col` (`driver.vl:478`–`:482`). Because the types are distinct,
the whole token stream is re-materialised field by field: the same eight-line object literal at
`driver.vl:501`, `:874` and `:2097`. `driver.vl` owns the copies and the cache columns;
`lexer.vl` and `ast.vl` own the split. With `value` and `stop` dead (§4.1) the two records
differ only by `pos`, which the copy is computing anyway.

## 3 · Normalising logic — two paths, one question

### 3.1 · Two callee resolvers, and one of them is live

The checker has two ways to answer "which `FuncDecl` does this name denote?":

* `lookupFnDeclNode` (`typecheck.vl:6262`) walks `T.scopes`, stops at the first frame that
  binds the name at all, and answers `-1` when a local shadows a function. Its header states
  the rule.
* `fnDeclIx[name]` (`:2063`) is a flat map of **top-level** declarations with no scope walk.
  `fnParamNamesOf` (`:18375`), `declFirstParamIsSelf` (`:18414`) and `declParamsAfterSelf`
  (`:18430`) all read it.

`checkCallNode:20454` sits on the closure-callee path (`ft is TyFunc`) and calls
`fnParamNamesOf(cfn.identName)`. One variable, three arms:

| program | top-level `g`'s parameter | `vl check` |
| --- | --- | --- |
| `function g(alpha: i32)` + `function tak(g: (i32) => void) { g(alpha: 8) }` | `alpha` | **rc 0**, then `emitProgram: named arguments require a declared function` |
| the same with `function g(beta: i32)` | `beta` | rc 1 — `named argument does not match a parameter` |
| the same with no top-level `g` | — | rc 1 — `named arguments require a declared function` |

Only the unrelated top-level function's parameter *name* changes, and it decides whether the
call type-checks. `vl check` returning 0 and the emitter refusing makes this a clause-2
violation by construction; the checker owns it. This is D1602's shape (a callee resolved by
name where a parameter shadows it) one layer earlier, in the checker rather than the emitter.

The UFCS twin was tested and is **not** affected: with `ld` bound to an `i32` parameter,
`b.ld(ld)` refuses at `no field 'ld' on Box`, so `declFirstParamIsSelf` is guarded by a scope
test ahead of it. Only the named-argument path is open.

Fix: route `fnParamNamesOf` through `lookupFnDeclNode` at the call site, or give it a
scope-aware twin. Size S. Risk low. Proof: the three-arm table above flipping to `rc 1` on all
three, `regress.py` 0 `runs → not-runs`, and an inventory row carrying arm 1 as its witness.

### 3.2 · Two reset surfaces, disjoint, with no stated rule

`initChecker` (`typecheck.vl:2985`, 330 lines) resets **244** module bindings and its header
says "Reset all checker module state … Call once before checking." `checkProgramNode`'s
prologue (`:22808` onward) resets **37** more — `cStruct*`, `cUnion*`, `gaApp*`, `nw*`, `fl*`,
`cFill*`, `annPendingVariant*`. The two sets are **disjoint**: 0 bindings in both.

The split is probably deliberate — `driver.vl:661` runs `checkProgram` a second time for the
deep-`is` pass, so the pass-0 collect tables want resetting per walk rather than per
invocation — but nothing says so, and `initChecker`'s sentence is false as written. A new
module-level table has two places it could go and no rule to choose by. Size S (a comment, or a
`resetPerProgram()` named function). Risk low.

### 3.3 · Three renderings of a token kind in a diagnostic

`parser.vl` has `kindTag` (`:216`, the identity — returns the raw `TokKind` atom), `kindDesc`
(`:221`, a 13-arm human form falling back to `kindTag`) and `foundDesc` (`:240`, the offending
token's lexeme in backticks). `expect` uses `kindDesc` + `foundDesc`; two sites use `kindTag`
directly — `:999` "expected an expression but found " and `:1048` "expected \`}\` to close the
interpolation hole but found ". So one program produces both spellings for the same token:

```
1:6: expected an identifier but found `await`
2:6: expected an expression but found AWAIT
```

`kindDesc` names 13 of `TokKind`'s 72 members, so the raw tag is what a user sees for the other
59. Size S (two call sites). Risk low. Proof: `deno task test` plus the parse-error fixtures.

### 3.4 · One operator predicate, spelled out at neighbouring sites

`checkBinExprNodeReal` (`:28820`, 586 lines) writes `op != "=" && op != "&&" && op != "||"`
twice in four lines, at `:28904` and `:28910`, then its four-way extension
`… && op != "??"` at `:28913`. The function carries **33** `op ==` / `op !=` comparisons in all,
re-tested in sequence over a shared prelude; the natural normalisation is one
`binOpClassOf(op)` computed once. Size S–M. Risk low. Proof: byte-identical seed.

### 3.5 · A 25-arm precedence ladder

`binPrec` (`parser.vl:321`) answers a `TokKind → i32` precedence with 25 sequential `kind ==`
tests after a nine-member early-zero group. It is called once per token in the expression climber
and again in `binOpAfterNewlines`. The ladder ratchet reports it as `binPrec TokKind 25/72`.
The `0` fall-through is meaningful here ("not a binary operator") but is not named as such.
Parser self time is 0.59% of a self-compile, so this is a clarity item, not a cost one.

## 4 · Dead and vestigial

### 4.1 · The lexer decodes every escape into a field nothing reads

`mkTok` (`lexer.vl:441`) writes seven fields per token:

```vl
{ kind: kind, text: gSrc.slice(start, gPos), value: value,
  start: start, stop: gPos, line: startLine, col: startCol }
```

`grep -rnE "\.(value|stop)\b" compiler/*.vl` returns **nothing**. `Tok` is module-private to
`lexer.vl`, so no other module can read them either. Both fields are dead.

`value` is the output of `scanQuoted` (`lexer.vl:517`, 183 lines), which resolves the escape
grammar — `\n`, `\xNN`, `\u{…}`, the lot — into a string it builds with **13** accumulation
statements (`:545`, `:554`, `:571`, `:581`, `:585`, `:604`, `:611`, `:633`, `:641`, `:671`,
`:677`, `:686`, and the initial `let value = ""`). All four call sites (`:932`, `:963`, `:983`,
`:1015`) pass the result to `mkTok`'s `value` parameter. Nothing reads it back, and no
diagnostic inside `scanQuoted` interpolates it.

The live decoder is `decodeStr` (`emit_base.vl:963`), which works from the raw lexeme at emit
time (`emit_sections.vl:3301`, `:5226`; `wasmEmit.vl:5959`, `:19442`). The design is stated in
`tplPartStrLex`'s own header (`lexer.vl:705`): "the one bridge between the two literal
grammars, purely lexical, so no second escape decoder can drift." `scanQuoted`'s accumulator is
the pre-`decodeStr` route left behind.

Scale: **775,815 tokens** over the compiler's own 30 modules, so 775,815 dead `value` writes
and 775,815 dead `stop` writes per full parse; 12,848 of those tokens are
`STRING`/`TEMPLATE`/`CHAR` and pay the accumulator. `perf-opportunities-2026-09.md` §D3 lists
`lexer.vl:673,682,818 scanQuoted` among "the five sites on the per-program hot path" for
quadratic string building — this is the same code, and what it builds is discarded.

The scan itself is load-bearing (cursor advance, `gTplStop`, five diagnostics) and stays; only
the accumulation and the two fields go. Size S. Risk low but not zero — the emitted lexer
changes, so byte-identity is unavailable. Proof: `deno task test`, ci-native,
`regress.py` 0 `runs → not-runs`, `--prove-fixpoint`, and `tests/cases` emitted-module
byte-identity (string and char literals must lower to the same bytes).

Related, same function family: the identifier arm slices the source twice —
`lexer.vl:842` computes `const text = gSrc.slice(startPos, gPos)` for `keywordKind`, and
`mkTok` immediately recomputes `gSrc.slice(start, gPos)`. 207,876 of the 775,815 tokens are
`IDENT`, so that is one redundant slice header per identifier token.

### 4.2 · Exports nothing outside the file uses

Across the ten files, **66 of 750 exports** have no use outside their own file, and **5 have no
use anywhere**:

| | |
| --- | --- |
| `typecheck.vl:31396` | `jsonUnionTy` |
| `typecheck.vl:25884` | `nodePinKindOf` (cited only by `destringify-types-program.md`) |
| `typecheck.vl:27535` | `tyLitIsI32Backed` |
| `symbols.vl:123` | `sidArrClear` |
| `symbols.vl:51` | `sidCount` |

Per file, exports with no cross-module use: `ast.vl` 25 / 209, `typecheck.vl` 21 / 307,
`check_query.vl` 11 / 94, `lexer.vl` 4 / 11, `json_walk.vl` 2 / 6, `symbols.vl` 2 / 10,
`parser.vl` 1 / 9. `tyname.vl` (0 / 43), `check_state.vl` (0 / 59) and `strutil.vl` (0 / 2) are
clean.

`ast.vl`'s 25 include **21 exported mutable tables** — `declGp*` (5), `fnTpBound*` (3),
`declBound*` (2), `ufcsScope*` (4), `ufcsModIx`, `ufcsModBound`, `annTsRoot`, `udTsRoot`,
`udTsNode`, `callSiteLoc`, `defaultGlobalRef`, `dgLossless` — every one of which any module in
the graph may write.

Nothing in the gate ladder sees this. `lint-self.sh` runs the module-graph lint at `info`,
which flags an unused *binding* but exempts exports (another module may use them); the
project-wide answer exists only in the LSP's `unusedExportHints` (`lsp/src/moduleGraph.ts:749`),
which no gate runs. Size S. Risk none for the five dead ones. Proof: `lint-self.sh` +
`deno task test`.

### 4.3 · A reserved word with no feature

`await` is a keyword (`lexer.vl:333`, `TokKind` member at `:47`) with no parser production. The
cost is a stolen identifier and a bad message:

```
$ vl run -   # const await = 1 ; print(await)
1:6: expected an identifier but found `await`
2:6: expected an expression but found AWAIT
```

It is carried in `driver.vl:1437` and `lint.vl:2877` keyword lists. Either retire it or keep it
and say why in the `TokKind` header. Size S.

## 5 · Performance

### 5.1 · `nodeChildren` — 11.75% self, 45.5% of nodes reach no arm

Guest profile of a self-compile (7,151 samples, `--names` seed): `__str_eq__` 18.98%,
**`nodeChildren$m8` 11.75%**, `dsScopeWalk$m16` 5.99 / 30.29 incl, `dsDestSlotAt$m16` 4.17,
`plScanStmt$m12` 3.82, `tyTopIndexOf$m22` 2.42. By module: `emit_classify` 29.04%, host
21.95%, **`ast.vl` 12.64%**, `typecheck.vl` 9.37%, `emit_base.vl` 7.69%, `tyname.vl` 3.29%,
`symbols.vl` 2.29%, `lexer.vl` 1.34%, `parser.vl` 0.59% — the surveyed area is 29.5% of
self time and `nodeChildren` is 40% of that.

Two facts about the function. Disassembled from the `--names` seed, its body carries **25
separate `struct.get $60 0` tag loads** — the discriminant is re-read once per arm, and the
arms are a linear `i32.eq` chain. And it opens with `const out: i32[] = []`, so every call
allocates, including the calls that return empty.

The node population, measured by parsing `typecheck.vl`, `emit_classify.vl`, `wasmEmit.vl`,
`parser.vl`, `ast.vl` and `lexer.vl` with the compiler's own lexer and parser — **271,002
nodes**:

| kind | count | share | arm position |
| --- | ---: | ---: | ---: |
| `Ident` | 85,060 | 31.4% | none (25) |
| `BinExpr` | 26,026 | 9.6% | 2 |
| `Block` | 22,438 | 8.3% | 22 |
| `Call` | 20,454 | 7.5% | 3 |
| `NumLit` | 17,885 | 6.6% | none (25) |
| `IfStmt` | 17,294 | 6.4% | 16 |
| `Member` | 13,793 | 5.1% | 4 |
| `RetStmt` | 10,999 | 4.1% | 21 |
| `LetDecl` | 10,466 | 3.9% | 13 |
| `StrLit` | 7,499 | 2.8% | none (25) |
| `TypeRef` | 7,434 | 2.7% | none (25) |
| the other 22 kinds | 31,654 | 11.7% | |

**123,266 nodes (45.5%) are of a kind with no arm**: they run all 25 tag loads and compares,
allocate an array, and return it empty. Mean ladder position over the whole population: **17 of
25**; total ladder steps 4,645,855 for 271,002 nodes.

Attribution of the reach: **94.6% of `nodeChildren`'s samples come from one caller**,
`dsScopeWalk` (`emit_classify.vl:27502`), with `alcWalk` 2.4%, `dstPinSynthWalk` 2.0% and
`strAccWalk` 1.0%. So the fix has two independent halves and two owners.

* **`ast.vl` owns the per-node cost.** DONE, 2026-09-04: arms in descending kind frequency,
  each returning; a childless kind falls out of the end onto one shared empty list, a
  fixed-arity kind is an exact-size array literal, and `Block`/`Program`/`ArrayLit`/`ObjLit`/
  `TypeDecl` return the node's own list. `nodeChildren` self **8.16% → 3.51%** with the
  byte-identity proofs below.
* **The tag CANNOT be hoisted in VL source, and the ladder was not the cost.** `match`
  desugars to the same `if`/`else if` chain (`typecheck.vl desugarMatchAt`), so a `match n { … }`
  emits the same 25 `struct.get $60 0` loads; and reordering plus the shared empty list ALONE
  measured a 6,215 → 5,819-sample profile with `nodeChildren` self UNMOVED at 507 → 515
  absolute samples. What moved it was the allocation traffic: a VL list starts at capacity 0,
  so a two-child `BinExpr` cost `struct.new` + `array.new_fixed 0` + `array.new_default 4` +
  `array.copy` before its first `array.set`.
* **`emit_classify.vl` owns the reach, and a MEMO is not what removes it** (measured
  2026-09-04, an instrumented compiler never used as a seed, validated against a control that
  must make it count — `calls=0` on `print(6 * 7)`, `calls=6 walks=6` on a program with a
  destination-typed list binding). On the compiler's own source: **16,195 `letRefListDestSlotK`
  calls, 32 of which reach the scoped walk, 12,218,274 arena node visits between them, and
  16,194 distinct `(letIx, want)` keys with ONE repeat.** 29 of the 32 walks start at the
  `Program` node with the identical `(root, fnIx = -1, want = 2)`, differ only in the NAME,
  visit all **421,292** nodes and answer **-1** — they are the module-scope lookup tables
  (`klNode`, `klTokKind`, `asPasses`, …), each searching the whole arena for a union-box
  destination that is not there. So `dsScopeWalk` is not "re-run per query": a
  `(letIx, fnIx, want)` memo skips **0 of the 32 walks and 0 of the 12.2M visits**. Over the
  2,403 gradeable `tests/cases` fixtures the same memo skips 244 of 529 walks and 45,530 of
  183,331 visits — a quarter of a population two orders of magnitude smaller than ONE
  self-compile, so it buys nothing measurable and costs a per-program table.
* **What removes the 12.2M is an INDEX over `(root, fnIx, want)`**, answering every name from
  one pass — D1514's shape, and the reason this row's prescription was wrong is D1514's own
  lesson one level out. Its blocker is named rather than guessed: every one of
  `dsDestSlotAt`'s seven forms is invertible (each reads its name off an `Ident` in a fixed
  slot), but inverting the `Call` form calls `fnParamKindListSlot` — itself a whole-arena scan
  — once per `Ident` argument at every `Call` node, which is a larger cost than the walk it
  replaces. Closing it needs `fnParamKindListSlot`, `destLetOf`/`globalLetOf` and
  `rlSlotByName` to be O(1) first, which is a campaign, not a commit.

Size M. Risk low (the function is pure over the arena). Proof: the emitted module for every
`tests/cases` program byte-identical, `regress.py` 0 `runs → not-runs`, `--prove-fixpoint`, and
a profile A/B on the same `--names` seed.

### 5.2 · Definite assignment is quadratic in module-level bindings

`daUnassigned` (`typecheck.vl:1695`) is a `string[]` holding the names still unwritten on the
current path. The helpers:

* `daIsUnassigned` (`:1698`) — a linear scan with `__str_eq__` per element, called from
  `daCheckRead` (`:1744`) on **every identifier read** (`:23481`).
* `daMarkAssigned` (`:1718`) — allocates a `keep: string[]`, copies the survivors, empties the
  global by popping one at a time (`daClear`, `:1735`), then pushes them all back. Three passes
  and one allocation per call. Called on every write (`:28936`) and on every `let`/`const`
  declaration (`:29599`).
* `daSnapshot` (`:1753`) / `daRestore` (`:1764`) — a full copy at every function body
  (`:21425`), `if` (`:30363`, `:30422`, `:30459`), `while` (`:31945`), `for`-range (`:32151`)
  and `for`-in (`:32193`).

The set is not usually large — except that pass 1 puts **every module-level binding** in it for
the TDZ (`:23169`, `daAdd(sm.letName)` for each hoisted module global). So a module with N
top-level `let`/`const` declarations starts pass 2 with N entries, and pass 2 then calls
`daMarkAssigned` once per declaration, each O(N) with three passes.

Guest profile of `vl build` over 8,000 `const vN = g(N, N)` at module scope (1,027 samples):

| | self% | incl% |
| --- | ---: | ---: |
| `daMarkAssigned$m10` | **39.82** | 60.08 |
| `__str_eq__` | 38.17 | 38.17 |
| `daIsUnassigned$m10` | 9.25 | 30.19 |
| `daClear$m10` | 3.99 | 3.99 |
| `checkProgramNode$m10` | 0.29 | **91.82** |

`__str_eq__`'s parents are 54.8% `daIsUnassigned` and 42.6% `daMarkAssigned`. Nothing else
reaches 0.5%.

The control settles that this is the checker and not the emitter. The same 8,000 bindings moved
inside one function body profile completely differently (1,785 samples): `__str_eq__` 60.95%,
`declaredSlotLive$m16` 10.14, `scopeSlotOf$m14` 9.97, `capIsBound$m12` 6.11,
`frameHasDupLocalName$m16` 2.97, `capHas$m12` 2.80 — all emitter, no `da*` frame above 0.11%.
An in-function binding with an initialiser never enters `daUnassigned`.

This is the missing attribution for `perf-opportunities-2026-09.md` §B6 / item #8: "`vl check`
is super-linear in CALL SITES: 8× the sites costs 22.9×, exponent 1.51". The generated shape
there is `const v$i = g($i, $i)` at module scope, so what the ladder measured was the count of
module-level *bindings*, not of call sites. Re-measured here (best of 3, load 1.7 → 1.8):

| shape | 1,000 | 2,000 | 4,000 | 8,000 | 1k → 8k |
| --- | ---: | ---: | ---: | ---: | ---: |
| bindings at module scope | 0.113 s | 0.192 s | 0.821 s | 2.439 s | **×21.6** |
| the same bindings inside one function | 0.055 s | 0.269 s | 0.414 s | 0.782 s | ×14.2 |

Both are super-linear and they are super-linear for different reasons; the first is this
finding, the second is the emitter's per-function name registries (`declaredSlotOf` and friends,
already item #10 of the perf survey).

Fix: `daUnassigned` becomes a sid-keyed flag column. The facility exists and is used by
compiler code today — `sidOf`/`sidText` and `sidArrGet`/`sidArrPut` (`symbols.vl:55-93`,
`:218-235`), the same instruments the perf survey's §B4 prescribes for every other name-keyed
registry. Membership and mark become O(1); snapshot/restore of a dense column needs a design
choice (a change log per frame, or a generation counter), which is where the work is. A smaller
down payment that needs no design: make `daMarkAssigned` a swap-remove (find the index, swap
with the last, pop) instead of a three-pass rebuild, which removes the allocation and two
thirds of the array traffic while leaving the string key.

Size M. Risk low. Proof: the ladder above with the module-scope ratio at or below 2.2 per
doubling; `regress.py` 0 `runs → not-runs`; byte-identical seed if the set stays a `string[]`
(the swap-remove down payment is observably identical), otherwise `deno task test` plus
ci-native plus `--prove-fixpoint`.

### 5.3 · Already filed, cited not re-derived

`tyTopIndexOf` (`tyname.vl:439`) is 2.42% self here, against 4.94% in the survey's own
self-compile profile — the same function, a different mix. It is item #12 of
`perf-opportunities-2026-09.md` and belongs to the destringify track, not to this survey.
`splitUnionAtoms` 0.59%, `sidOfNode` 1.05%, `sidArrGet` 0.41%, `sidArrPut` 0.36%,
`sidText` 0.35% round out the area. `typecheck.vl` itself has no single hot spot: its 9.37% is
a flat tail whose largest member is `daSnapshot` at 0.95%.

### 5.4 · What the ratchets already hold in this area

Cited, not re-derived. `scan-budget.py --check`: 107 arena scans outside a pass, of which
`typecheck.vl` 15 and `check_query.vl` 1. `ladder-budget.py --check`: 441 silent ladders and 8
split walks, of which `typecheck.vl` 155, `parser.vl` 5, `json_walk.vl` 10, `ast.vl` 1,
`check_query.vl` 1. `sentinel-budget.py --check`: 361 unguarded reads, 0 untested strict reads,
of which `typecheck.vl` 47 and `parser.vl` 1. `goal-scoreboard.py`: runs 4,630 / 7,564
(61.21%), 0 against the goal, 22 capability literals reached by no corpus cell.

## 6 · Oversized functions

1,493 functions hold 32,831 lines. **16 functions of 200 lines or more hold 6,559 lines
(20.0%)**; 40 of 100 or more hold 9,902 (30.2%). The ten longest, with the seam that pays:

| lines | function | natural seam | live locals crossing |
| ---: | --- | --- | ---: |
| 1,288 | `typecheck.vl:21182 checkFuncDeclNode` | the `if inferring` arm, `:21637`–`:22388` (752 lines) | 12 of 113 |
| 996 | `:19659 checkCallNode` | `cfn is Member` `:19664`–`:20188` (525), two `cfn is Ident` blocks `:20189`–`:20398` (210), the value call `:20399`–`:20637` (239) | 2 / 2 / 2 of 93 |
| 586 | `:28820 checkBinExprNodeReal` | a shared prelude then 33 `op` comparisons; see §3.4 | 3 throughout |
| 410 | `:22807 checkProgramNode` | the 37-line reset prologue; see §3.2 | 1 |
| 367 | `parser.vl:1625 parseTypeDecl` | — | — |
| 330 | `typecheck.vl:2985 initChecker` | pure reset; see §3.2 | — |
| 314 | `lexer.vl:764 tokenize` | one arm per lexeme class, already flat | — |
| 298 | `typecheck.vl:12737 canonEmitNameTs` | the third name producer (canon side) | — |
| 280 | `:7438 assignableExpr` | — | — |
| 278 | `:22475 fillTypeDeclAt` | — | — |

### 6.1 · `checkFuncDeclNode`

Of 1,288 lines, **752 (58.4%) are one `if inferring { … }` arm** (`:21637`–`:22388`) that runs
after the body has been checked and the scope popped. Twelve of the function's 113 locals cross
into it. Extracting `finishInferredReturn(...)` leaves a 536-line function whose remaining
structure is legible: the parameter loop (`:21272`–`:21336`, 7 crossing), defaults (`:21337`),
the return annotation (`:21339`–`:21370`), the saved-state block (`:21371`–`:21388`), and the
body check (`:21391`–`:21636`).

### 6.2 · `checkCallNode`

Three arms with two crossing locals each, and the boundaries are already written as
`if cfn is Member` / two `if cfn is Ident` blocks / the `ft is TyFunc` tail. The 525-line member arm is
the builtin-method dispatch, which is also where 31 of the 52 untested diagnostic sites live
(§8) — splitting it names the test target.

Neither split buys performance; both buy a function a reviewer can hold. Proof for both:
byte-identical seed.

## 7 · Naming and API shape

### 7.1 · A contract that is false as written

`initChecker`'s header (`typecheck.vl:2983`): "Reset all checker module state, then intern the
well-known primitives and the global scope. Call once before checking." It resets 244 bindings;
37 more are reset in `checkProgramNode`, and the two sets do not intersect. See §3.2.

### 7.2 · `mkTok` and `LexResult` are exported and used only inside `lexer.vl`

`mkTok` (`:441`, 21 uses, all local), `LexResult` (`:133`), `gSrc` (`:144`), `gDiags` (`:148`).
`gSrc` in particular is the lexer's cursor state; exporting it lets any module in the graph
rebind the source under the scanner. Making them private is four keyword deletions.

### 7.3 · `check_state.vl` is the counter-example worth naming

59 exports, **0** of them unused outside the file, a stated contract ("A declarations-only leaf
— the checker writes these, `check_query.vl` reads them"), and five parallel-column families
whose push sites are in lockstep. It is the shape the other state modules should be measured
against.

## 8 · Test gaps visible from the code

Of the diagnostic call sites in `typecheck.vl` that carry a prose run of 18 characters or more
(`tErr`, `tErrAt`, `tErrCoded`, `tErrCodedAt`, `tHint`, `tHintAt`, `tHintCoded`, `tWarn`),
**52 of 149 (34.9%) have no run appearing anywhere under `tests/`**. The unit is a literal run,
not a message — an interpolated message is built from several literals — so treat this as a
lower bound on coverage rather than a count of untested messages.

**31 of the 52 are one family**, the builtin-method argument checks inside `checkCallNode`
between `:19692` and `:20456`: `push expects 1 argument`, `pop expects 0 arguments`,
`get expects 1 argument`, `set expects 2 arguments`, `add expects 1 argument`,
`clear expects 0 arguments`, `slice expects 1 or 2 arguments`, `keys expects no arguments`,
`values expects no arguments`, `indexOf`, `includes`, `charCodeAt`, `cpAt`, `cpLen`,
`isCharBoundary`, `bytes`, `fromCodePoints`, `fromCodePoint`, `__array_new_default__`,
`__array_copy__`, `__trap__`, plus `filter predicate must yield boolean` and
`callback expects 1 parameter`. One `tests/cases` fixture per receiver kind covers them.

The remaining 21 are scattered: the `flat` family (`:11208`, `:11253`, `:11284`, `:11494`), the
default-argument family (`:18544`, `:18554`, `:18561`, `:18576`, `:18585`), named arguments
(`:18627`, `:19266`, `:20456` — see §3.1, where the second arm's message is reachable and the
first's is not), `one generic at one type must have ONE witness across the whole program`
(`:18800`), `an index that cannot be READ cannot be written either` (`:31261`),
`while-condition must be boolean` (`:31941`), `for-range step must be i32` (`:32140`), and
three `internal:` invariant messages.

The instrument's own limit, stated because it changed the number once: matching a whole literal
including its interpolation seam reported 66 uncovered sites, of which several — `a \`flat\`
type cannot be generic — \`` among them — *are* covered by a fixture whose text stops before the
em dash. Splitting each literal at its seams and requiring an 18-character prose run brings it
to 52. A count over literals is not a count over messages.

## 9 · What I measured and how

Every command was run from a worktree at `e05d21131` (profiles at `facb9f610`) with
`VL_STD=<worktree>/std` on every native invocation, `node_modules` and
`scripts/vl-host/target` symlinked to the main checkout, after `scripts/refresh-compiler.sh`.
Box load is quoted where the number is a time.

**Profiles.** A `--names` seed, then three guest profiles:

```sh
vl build compiler/entry.vl -o names.wasm --names --compiler build/vl-compiler.wasm
VL_PROFILE_GUEST=p.json      vl build compiler/entry.vl -o o.wasm      --compiler names.wasm
VL_PROFILE_GUEST=pcalls.json vl build calls8000.vl      -o calls.wasm  --compiler names.wasm
VL_PROFILE_GUEST=pfn.json    vl build fn8000.vl         -o fn.wasm     --compiler names.wasm
python3 scripts/profile-rank.py p.json 45
```

7,151 / 1,027 / 1,785 samples. Self-time shares are load-insensitive, which is why every
performance claim above is a share and not a duration. Per-module and per-parent attribution
used two short readers over the same Firefox-profiler JSON: one bucketing self samples by the
`$mN` suffix (module ids mapped to files by matching declared function names), one ranking the
immediate caller of every sample whose leaf is a named function — the idiom
`profiling-the-compiler.md` describes.

**The node-kind histogram** was produced by a throwaway VL program that imports the compiler's
own `tokenize` and `parseProgram`, parses the six largest modules, and counts `P.nodes` by
kind — 271,002 nodes. The token counts (775,815 tokens, 207,876 `IDENT`,
12,848 `STRING`/`TEMPLATE`/`CHAR`) came from a second one importing only `tokenize`, over all
30 `compiler/*.vl`. Both were deleted after the run.

**The scaling A/B** generated `const vN = g(N, N)` at 1,000 / 2,000 / 4,000 / 8,000, once at
module scope and once inside a single function body, and timed `vl check` best-of-3 at load
1.69 → 1.83. Ratios, not absolute times, are the column.

**The disassembly** used `./node_modules/.bin/wasm-dis` on the `--names` seed; the 25 tag loads
in `nodeChildren` are `grep -c 'struct\.get \$60 0$'` over the extracted function body.

**Duplication** was measured by normalising every identifier to a positional placeholder and
running `difflib.SequenceMatcher` over the code lines of all 693 functions of 12 lines or more
in the ten files; pairs at ratio ≥ 0.80 were read by hand. The renderer pair's 0.832 is the
**raw** ratio (no normalisation), which is the honest number for two functions that share their
identifiers.

**Function lengths** are brace-matched with string and comment contents removed. The first
attempt counted declaration-to-next-declaration and reported `tpBoundOfName` at 447 lines when
its body is 8; the second attempt kept string contents and reported `nameNeedsCanon` at 22,503.
The numbers above are from the third, which agrees with the three lengths quoted in the survey
brief.

**Seams** were measured by taking every statement boundary at brace depth 1 inside a function
and counting the locals whose first declaration is above it and last textual use below it.

**Exports** were counted by matching `\bname\b` over every `.vl`, `.ts`, `.js`, `.mjs`, `.py`,
`.json` and `.md` under `compiler`, `std`, `tests`, `lsp`, `playground`, `scripts`, `bench` and
`reference`, then splitting own-file from cross-file occurrences.

**Diagnostic coverage** parsed each diagnostic call's balanced argument list, extracted its
string literals, split each at the characters that bound an interpolation seam, kept runs of 18
characters or more with two spaces, and asked whether any run appears in any file under
`tests/`.

**The three witnesses in §3.1** and the two in §4.3 are five two-to-five-line programs run
through `vl check` and `vl run` on the refreshed seed; the arms differ in exactly one token
each.

**Ratchet and scoreboard numbers** are quoted from `scripts/scan-budget.py --check`,
`scripts/ladder-budget.py --check`, `scripts/sentinel-budget.py --check`,
`scripts/ladder-budget.py --list kind-ladder-incomplete`,
`scripts/sentinel-budget.py --list sentinel-index-unguarded` and
`scripts/goal-scoreboard.py`, run once each on this checkout.
