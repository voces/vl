# Code-quality survey, second pass — the front end and the checker

Read-only survey of `compiler/lexer.vl`, `parser.vl`, `ast.vl`, `typecheck.vl`,
`check_query.vl`, `check_state.vl`, `json_walk.vl`, `tyname.vl`, `symbols.vl`,
`format.vl`, `fmt_util.vl`, `strutil.vl` and the checker-facing half of `driver.vl`
— **48,466 lines, 1,935 functions, 939 exports**. Everything below was measured on
**`a03a40784`**, the commit this worktree branched from, with a seed self-compiled from
that source (`build/vl-compiler.wasm`, 2,154,067 bytes) and a `--names` twin for the
profiles. Every native invocation carried `VL_STD=<worktree>/std`. §14 names the command
behind each number. Nothing was changed.

This is the second pass. The first (`front-end-and-checker.md`, `e05d21131`) has since
landed rows 4, 5, 8, 9, 10 and both giants; where a number here disagrees with that file
it is because the tree moved, and §11 says so explicitly.

Three things lead. **A soundness refusal the design owes is defeated by an unrelated
binding of the same name** — `srcIsUnannotatedObjBinding` resolves a name by scanning the
arena for the first `LetDecl` that spells it, so D938's witness passes `vl check` and
produces invalid wasm when any earlier function happens to declare a `w` (§2, with the
ablation). **Find-references, rename and document-highlight are quadratic in the
reference count**: `refAt(line, col, k)` re-runs a full occurrence scan for every `k`, so
a 2,002-reference binding costs 22.9 ms against 0.0 ms for a 1-reference binding in the
same file (§3). And **the definite-assignment set is still O(N) per function body** after
#2584 sid-keyed its lookup — the family is **2.75% of a self-compile**, and reordering
one generated file without changing a token moves it 1.82 s → 0.19 s (§4).

The recurring shape this pass is *a question answered by walking everything* — a token
stream scanned to its end after the answer is found, an occurrence table re-scanned once
per result, a live set copied whole at every function — where the first pass's shape was
*two implementations of one question*.

## 1 · Ranked

| # | finding | evidence | size | risk | proof a landing owes |
| --- | --- | --- | --- | --- | --- |
| 1 | `srcIsUnannotatedObjBinding` (`typecheck.vl:14593`) resolves a name by first arena match, so an unrelated earlier binding disables D938's soundness refusal (§2) | witness: `vl check` rc 1 → **rc 0 + invalid wasm** when a decoy moves above the const; decoy below it, refusal holds | S | low | the two-arm ablation flipping back to rc 1; `regress.py` 0 `runs → not-runs`; an inventory row and a `tests/cases` fixture |
| 2 | `symRefAt` re-runs `symOccAt` plus a second full `symOccTok` scan per `k`, and the LSP calls it once per result (§3) | same file, cursor moved only: 252 refs 0.5 ms, 2,002 refs **22.9 ms**; 1-ref control 0.0 ms at every size | S | low | the ladder flat in the reference count; `lsp_crossfile_refs_wasm_test.ts`, `lsp_rename_wasm_test.ts`, `lsp_document_highlight_wasm_test.ts` |
| 3 | `daSnapshot`/`daClear`/`daRestore` copy the whole live set at every function body; the set holds every module binding until pass 2 reaches it (§4) | **2.75% of a self-compile**; `daSnapshot` 91.4% reached from `checkFuncDeclNode`; same file reordered **1.82 s → 0.19 s** at N=8,000 F=800 | M | low | the order control at ratio ≤ 1.5; `regress.py`; `deno task test` + `--prove-fixpoint` (the seed changes) |
| 4 | `recordRedundantAnnot`'s `=`-token scan runs to the end of the token stream after it has the answer (`typecheck.vl:6140`–`:6156`) (§5) | **0.64% self**, 100% of its samples reached from `checkLetDeclNode`; the loop body is guarded by `if eqTok < 0` and the loop condition is not | XS | low | byte-identical seed; profile A/B |
| 5 | the deferred-constraint layer is **8 families, 37 hand-written columns, 37 push sites, 18 functions, 663 lines**, with nothing enforcing lockstep (§6) | `typecheck.vl:613`–`:754` declarations, `:15770`–`:17521` writers and readers | M | medium | byte-identical seed; a test that a family's columns are equal length after a check |
| 6 | 35 `nodeTyIs*` / `nodeArrayElemIs*` predicates; **7 of the 18 raw-ratio ≥ 0.70 duplicate pairs in the whole scope are inside this one family** (§7) | three of them at normalised ratio 1.000 with raw 0.846–0.941, and a fourth 1.000 pair at raw 0.467 | M | low | byte-identical seed |
| 7 | 33 comment sites name an identifier the tree no longer has — 22 of them a compiler name, 9 the frozen TypeScript host (§12) | derived from the tree, not read: candidate `\`ident\`` in a `//` comment, no declaration, no family prefix, no code mention anywhere | S | none | the detector at zero, as a fifth ratchet |
| 8 | one operator set is written three times in two spellings, and one of the three headers is wrong about the other two (§8) | `isBinOpFuncName` 10 names, `isStrFuncName` 14, `isOpFuncName` 12 token kinds; `isStrFuncName`'s header omits `==`/`!=` | S | low | byte-identical seed; the three derived from one list |
| 9 | every `check_query.vl` position query is a full table scan — **15 of its functions**, all on the per-request LSP path, and two are the same scan written twice (§9) | `symTypeAliasAt` / `sigIdentAt` at raw ratio 0.824; `symOccTok` scanned by four separate exports | M | low | the LSP wasm suites; a latency ladder on a large file |
| 10 | `tyTopIndexOf` (`tyname.vl:158`) is now the **largest single frame in the surveyed area at 3.28% self**, up from 2.42% in the first pass (§10.1) | six named parents, none over 34%; `nameIsFuncTypeAtom` 33.7%, `splitUnionAtoms` 18.7% | — | — | belongs to the destringify track; re-derived here, not re-prescribed |
| 11 | `blockHasBareReturn` is a whole-body walk asked from five sites with no memo (§10.2) | 0.53% self, 62.5% of its samples its own recursion, 16.7% `computeVoidFns`, 12.5% `checkFuncDeclNode` | S | low | byte-identical seed |
| 12 | `finishInferredReturn` (748 lines) is the new longest function, and its cheapest interior seam crosses **3** live locals (§10.3) | 18 functions of ≥ 200 lines hold 6,432 of 38,380 lines (16.8%) | M | low | byte-identical seed |
| 13 | **42 of 168** checker diagnostic sites carrying a prose run have none of it anywhere under `tests/` (§10.4) | 25.0%, against 34.9% in the first pass; the builtin-method family it named is now covered | S | none | one fixture per remaining family |
| 14 | `ErrExpr.errWhat` / `errAt` are written at four parser recovery sites and read nowhere (§10.5) | the only write-only fields in the scope besides `TyErr.errKind`, which is documented and load-bearing | XS | low | `deno task test`; parse-error fixtures |

Four measured NEGATIVES, in §11, because each is something this survey's own method would
otherwise flag: `splitUnionAtoms`/`unionMemberCount`, `modCacheClear`/`modReset`, the
write-only-global census, and `format.vl`'s absence from every profile.

## 2 · The soundness defect

### 2.1 · A name resolved by first arena match defeats D938's refusal

`srcIsUnannotatedObjBinding` (`typecheck.vl:14593`) decides whether a nested object width
pair is sound. Its contract, from its own header: an un-annotated binding "has no pinned
wasm type of its own, so the emitter can lay it out at the shape it flows into"; an
annotated source "has a type it must keep … and the pair is unsound (D938)". The body:

```vl
if e is Ident {
  let i = 0
  while i < P.nodes.length {
    const n = P.nodes[i]
    if n is LetDecl {
      if n.letName == e.identName {
        if n.letType >= 0 { return false }
        …
```

There is no scope walk. The first `LetDecl` in arena order that spells the name decides,
whatever function body it is in.

**The witness.** D938's own filed repro, verbatim, refuses:

```vl
type Wide = { a: i32, b: i32 }
type Narrow = { a: i32 }
type OW = { n: Wide }
type ON = { n: Narrow }
function take(o: ON): i32 { (o.n).a }
const w: OW = { n: { a: 1, b: 2 } }
print(take(w))
```

`vl check` **rc 1** — "an object of type OW cannot flow into ON: they agree on field names
but differ INSIDE a field …". Add a function *above* it that binds the same name without
an annotation, and never call it:

```vl
type Wide = { a: i32, b: i32 }
type Narrow = { a: i32 }
type OW = { n: Wide }
type ON = { n: Narrow }
function take(o: ON): i32 { (o.n).a }
function decoy(): i32 {
  const w = { n: { a: 9, b: 9 } }
  (w.n).a
}
const w: OW = { n: { a: 1, b: 2 } }
print(take(w))
```

`vl check` **rc 0**, and `vl run` is

```
Error: invalid module
…: the emitted module failed to validate inside the module's top-level code:
Invalid input WebAssembly code at offset 243: type mismatch: expected (ref $type), found (ref $type)
```

exit 70 — the exact symptom D938 was closed on. **Ablation**: move `decoy` *below* the
`const` and the refusal returns (rc 1). Calling `decoy` is not required. So the single
ingredient is arena order, which is the tell that a name is being resolved without a
scope.

**The fix is in the same file.** `cwBoundOnce` (`typecheck.vl:13914`) asks a
structurally identical whole-program question — "is `nm` bound exactly once in the whole
program and never assigned?" — and answers it by COUNTING and refusing on ambiguity
(`binds == 1`), which is sound for a scope-free scan. `srcIsUnannotatedObjBinding` takes
the first hit instead. Either give it `cwBoundOnce`'s discipline (unique binding, else
`false`) or route it through the checker's scope, which is where the answer actually
lives.

This is the first pass's §3.1 one function over: that one was `fnParamNamesOf` reading the
flat top-level `fnDeclIx` (filed D1604 and since fixed); this one is a raw arena scan, and
it lands in clause 1 rather than clause 2 because the refusal it defeats is a soundness
rule the design owes, not a capability gap.

Size S. Risk low. Proof: the two-arm ablation flipping to rc 1 on both, `regress.py` 0
`runs → not-runs`, an inventory row carrying the second program as its witness, and a
`tests/cases` fixture beside `error-nested-width-pair-mutable-field.vl`.

### 2.2 · The census that found it, and what else it holds

Four functions in the scope loop over `P.nodes` comparing a declaration's name field to a
string: `cwBoundOnce` (`:13914`), `cwProgramHasWrite` (`:14135`), `cwWrites` (`:14171`)
and `srcIsUnannotatedObjBinding` (`:14593`). None contains a scope test. Three of the four
are the covariant-write analysis, which is whole-program by design and conservative where
it is ambiguous; the fourth is §2.1. The census is cheap and worth keeping as a lint
candidate: *a name compared against a declaration field inside an arena loop, in a function
that never touches `T.scopes`.*

## 3 · Find-references is quadratic in the reference count

`symRefAt(line, col, k)` (`check_query.vl:246`) begins by calling `symOccAt(line, col)`
(`:200`), which scans the whole `symOccTok` table for the tightest covering span, and then
scans the whole table again to reach the `k`-th occurrence of that binding.
`symRefsCountAt` (`:234`) does the same for the count. The LSP calls it once per result
(`lsp/src/wasmChecker.ts:1014`):

```ts
const count = exp.refsCountAt(nativeLine, character);
for (let k = 0; k < count; k++) {
  const occ = exp.refAt(nativeLine, character, k);
```

so the loop is `N` results × `2` full scans of an `M`-row table.

**Measured** (the probe in §14; box load 11.6, best of 5). One generated file per
size: `const target = 1` plus `n` lines of `const u<i> = target + <i>`. Both columns use
**the same file**; only the cursor moves — one arm on `target` (n + 2 occurrences), the
control on `u0` (one occurrence), so the occurrence table `M` is identical in both.

| n | occurrences at the cursor | `referencesAt` | control (1 occurrence) |
| ---: | ---: | ---: | ---: |
| 250 | 252 | 0.5 ms | 0.0 ms |
| 500 | 502 | 1.5 ms | 0.0 ms |
| 1,000 | 1,002 | 6.5 ms | 0.0 ms |
| 2,000 | 2,002 | **22.9 ms** | 0.0 ms |

×8 in the reference count costs **×46** in time. The control is flat at the floor, which
places the whole cost in the per-`k` loop rather than in the check that precedes it. An
earlier run at box load 96 gave 1.8 / 3.5 / 12.0 / 80.3 ms — the same shape.

**It is not only find-references.** `referencesAt` also backs `rename.ts:386`,
`moduleGraph.ts:706` (the unused-export pass) and `server.ts:566` — **document highlight,
which fires on cursor rest**. So this is per-cursor-rest latency on any common name in a
large file, not a rare command.

Fix: one scan that fills a result column, read back by index — the idiom `symSigAt`
(`:958`) and `symUfcsScanAt` (`:752`) already use, filling `sigPar*` / `ufc*` in
`check_state.vl` and exposing `…CountAt` / `…At(i)` accessors. `refsCountAt` becomes the
fill, `refAt(k)` an array read. Size S. Risk low: the ABI shape is unchanged, and the
existing suites (`lsp_crossfile_refs_wasm_test.ts`, `lsp_rename_wasm_test.ts`,
`lsp_document_highlight_wasm_test.ts`) pin the answers. Proof: the ladder above flat in
`n`.

## 4 · Definite assignment still copies the whole live set per function

#2584 made membership and mark O(1) by sid-keying `daPos`. What it did not change is that
the set is still a **dense list copied in full at every fork**:

* `daSnapshot` (`typecheck.vl:1790`) — pushes every live id into a fresh array.
* `daClear` (`:1767`) — pops every entry, one `sidArrPut` each.
* `daRestore` (`:1801`) — `daClear` then `daAddSid` per snapshot entry.

and pass 1 puts **every module-level binding** into the set for the TDZ (`:23097`,
`daAdd(sm.letName)` for each hoisted global, initialiser or not). A function body saves,
clears and restores it (`:22129`–`:22320`), and so does every `if` (`:30393`, `:30452`,
`:30489`), `while` (`:31971`), `for`-range (`:32177`) and `for`-in (`:32219`).

**Profile.** Self-compile, 8,972 guest samples, `--names` seed:

| frame | self | note |
| --- | ---: | --- |
| `daSnapshot` | 0.65% | 91.4% of its samples reached from `checkFuncDeclNode` |
| `daRestore` | 0.52% | |
| `daClear` | 0.43% | |
| `daAddSid` | 0.20% | |
| `daCheckRead` + `daMarkAssigned` + `daBranchDiverges` | 0.08% | **the analysis itself** |
| `sidArrPut` under `daAddSid` / `daClear` | 0.80% | |
| `sidArrGet` under `daAddSid` | 0.07% | |
| | **2.75%** | of which 2.67 points is bookkeeping |

**The order control.** Two files with the same statements, the same tokens and the same
nodes; only the ORDER differs. Functions first, pass 2 checks every body while all N
module bindings are still in the dead zone; functions last, pass 2 has already marked them
assigned and the live set is empty at each body. Best of 5, box load 5.2–6.4, two
independent runs agreeing within 2%:

| N bindings | F functions | functions first | functions last | ratio |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 | 400 | 0.198 s | 0.160 s | 1.24× |
| 4,000 | 400 | 0.224 s | 0.077 s | 2.90× |
| 4,000 | 800 | 0.510 s | 0.332 s | 1.51× |
| 8,000 | 800 | **1.818 s** | 0.197 s | **9.23×** |

1.62 s of a 1.82 s check is definite-assignment bookkeeping over bindings none of those
bodies reads. (The control column is not monotone in N — 0.332 s at 4,000/800 against
0.197 s at 8,000/800. That is a second effect in the *control* arm and I did not chase it;
it does not touch the first column, which is the measurement.)

A product grid over the same generator agrees that the axis is N×F at three of four
products (400k / 800k / 1.6M / 3.2M: 0.193, 0.241, 0.225, 0.534 varying F at N=4,000
against 0.074, 0.203, 0.218, 0.687 varying N at F=400) and disagrees by 7× at 400k. The
order control above is the clean one; quote that.

**Fix.** A generation counter, exactly #2599's shape for `globalCellKind`: `daPos` keeps
`(gen, slot)` and a fork bumps the generation instead of rewriting the column, so
snapshot/clear/restore are O(1) and the column is allocated once per compile. The join
(`daJoinInto`, `:1815`) needs the ids, so the snapshot keeps its list — but a fork that
only saves and restores (the function-body case, which is 91% of the samples) never
materialises one. Size M. Risk low. Proof: the order control at ratio ≤ 1.5,
`regress.py` 0 `runs → not-runs`, `deno task test` plus ci-native plus `--prove-fixpoint`
(the seed changes, so byte-identity is not available).

## 5 · A loop that keeps going after it has the answer

`recordRedundantAnnot` (`typecheck.vl:6119`) finds the `=` that closes a redundant `let`
annotation by walking the token stream from the name:

```vl
let eqTok = -1
let depth = 0
let t = nameTok + 1
while t < P.toks.length {
  if eqTok < 0 {
    …
    } else if depth == 0 && kd == "EQUAL" {
      …
      if !isArrow { eqTok = t }
    }
  }
  t = t + 1
}
```

The *body* is guarded by `if eqTok < 0`; the *loop condition* is not. Once the `=` is
found the loop runs to the end of the stream doing nothing. On a self-compile
`P.toks.length` is the merged 30-module stream, so a declaration in the middle of the
program pays several hundred thousand empty iterations.

**Measured**: `recordRedundantAnnot` is **0.64% self** of a self-compile and **100% of its
57 leaf samples are reached from `checkLetDeclNode`**. The function's only inline work
after the `tyEq` gate is this loop; everything else is four pushes and two calls, which
land in their own frames.

The fix is the loop condition: `while eqTok < 0 && t < P.toks.length`. Its sibling
`recordRedundantRet` (`:6198`) already writes it that way
(`while bi < P.toks.length && braceTok < 0`). Size XS. Risk low. Proof: byte-identical
seed — the answer cannot change — and a profile A/B.

## 6 · The deferred-constraint layer

Eight families of parallel columns, declared at `typecheck.vl:613`–`:754`:

| family | columns | family | columns |
| --- | ---: | --- | ---: |
| `bmCstr*` | 7 | `memCstr*` | 5 |
| `letCstr*` | 5 | `retCstr*` | 5 |
| `ufcsCstr*` | 5 | `binCstr*` | 4 |
| `argCstr*` | 3 | `printCstr*` | 3 |

**37 columns, 37 `.push(` sites — exactly one per column**, so they are in lockstep today
and nothing enforces it. Nine `note*Cstr` writers push a row by hand; eight
`validate*Cstrs` readers index every column of their family by one loop variable, so a
column pushed on one path and not another silently misaligns the rest. Together they are
**663 lines across 18 functions**, the largest being `validateBinCstrs` (120),
`validateMemCstrs` (61), `validateBmCstrs` (51) and `validateUfcsCstrs` (51). The
`validate*` bodies share a spine — `cstrOwnedBy` gate, `substTyDeep` both sides, re-note
when either holds a hole, then the family's own check with the family's own message
builder.

This is the first pass's §2.5 (`symDecl`/`symDeclInOuter`/`symUse` over five columns) at
seven times the width. The same fix shape applies per family — one `…CstrPush(...)` that
owns every column — and the spine of `validate*Cstrs` is a candidate for one walker
parameterised by the check and the message. The reset is already centralised: every
`*Cstr*` column is cleared in `initChecker` and nowhere else.

Size M. Risk medium (a substitution loop that already re-notes into the table it is
reading). Proof: byte-identical seed, plus a test asserting every family's columns are
equal length after a check.

## 7 · Duplication, measured

**18 pairs at raw line-similarity ≥ 0.70** among the 805 functions of 12 or more code
lines; **65 pairs** once identifiers are normalised to positional placeholders. Both
numbers are over all 13 files. The families:

| family | pairs | note |
| --- | ---: | --- |
| `nodeTyIs*` / `nodeArrayElemIs*` | 7 | 35 exported predicates; first pass §2.4, not landed |
| `*ElemListRetName` (6 functions) | 3 | `nulClosure`, `nulStruct`, `nulMap`, `scalarLeaf`, `litUnion`, `struct` |
| `isStrFuncName` / `isBinOpFuncName` | 1 | the operator set, §8 |
| `isOpFuncName` / `isStmtKeyword` | 1 | two flat `\|\|` ladders over unrelated `TokKind` sets |
| `udTsRootAt` / `clearUdTs` | 1 | `ast.vl:872`, `:897` — one walk, one clear |
| `symTypeAliasAt` / `sigIdentAt` | 1 | §9 |
| `covarWriteThroughErr` / `covarTwoUnionsErr` | 1 | 0.966 normalised, 0.897 raw |
| `collectRetAtoms` / `collectRetAtomKinds` | 1 | the split/count pair, like §11.1 |
| `recordClonedNodeTyFb` / `recordClonedNodeTyKnown` | 1 | |
| `splitUnionAtoms` / `unionMemberCount` | 1 | a deliberate divergence — §11.1 |

Four `nodeTyIs*` pairs are at normalised ratio **1.000** — identical after identifier
normalisation. Three of them are also near-identical raw, at 0.846–0.941:
`nodeTyIsStructish`/`nodeTyIsArrayish` (`:26454`, `:26489`),
`nodeArrayElemIsNulBool`/`nodeArrayElemIsNulStr` (`:27430`, `:27487`) and
`nodeArrayElemIsStr`/`nodeArrayElemIsBareStrLit` (`:27452`, `:27470`). The fourth,
`nodeTyIsNulStruct`/`nodeTyIsStructArray` (`:26412`, `:26566`), is raw **0.467** — same
shape, different identifiers throughout — which is why the raw-ratio count is 7 and the
normalised one is higher. The first pass's prescription stands unchanged: one
`nodeArrayElemTy(ix): i32` and the leaf test delegated to the existing `tyIs*` sibling.

## 8 · One operator set, three spellings

| where | form | members |
| --- | --- | ---: |
| `ast.vl:1413 isBinOpFuncName` | lexemes | 10 — `+ - * / % ^ > >= < <=` |
| `parser.vl:2395 isStrFuncName` | lexemes | 14 — those 10 plus `[]`, `[]=`, `==`, `!=` |
| `parser.vl:2377 isOpFuncName` | `TokKind` atoms | 12 — `PLUS MINUS STAR SLASH PERCENT CARET GT GE LT LE EQ NE` |

Three hand-written ladders over one set, in two spellings, with no derivation between
them. `isBinOpFuncName`'s header is exact — it states that it is the quoted-function-name
set "minus the two bracket operators … and minus `==`/`!=`, which `parseFuncHead` refuses
by name (D46)". `isStrFuncName`'s header is not: it says it is "`isBinOpFuncName`'s
symbol-token set (`ast.vl`) plus the two bracket operators", and the body also adds `==`
and `!=`. A reader who trusts that sentence will get the set wrong by two members.

Nothing checks that `isOpFuncName`'s twelve token kinds map onto `isStrFuncName`'s twelve
non-bracket lexemes. Deriving all three from one list (the lexeme list, with a
`TokKind → lexeme` reader the parser already has in `kindTag`) removes the drift surface
and the wrong sentence with it. Size S. Risk low. Proof: byte-identical seed.

## 9 · Every position query is a full table scan

`check_query.vl` is the LSP's per-request surface: 1,003 lines, 83 exports, and **15 of
its functions walk a whole module-level table**, one query per request.

| table | scanned by |
| --- | --- |
| `symOccTok` | `symOccAt` `:200`, `symDefAt` `:218`, `symRefsCountAt` `:234`, `symRefAt` `:246` |
| `symBindNode` | `symBindKindOf` `:106`, `bindTypeOf` `:262`, `symBindTypeStr` `:486`, `sigSelfFnDeclOf` `:914`, `symUfcsScanAt` `:752` |
| `P.toks` | `symTypeAliasAt` `:408`, `sigIdentAt` `:938` |
| others | `symInlayScan` `:317`, `symMemIxAt` `:444`, `symScopeAt` `:531`, `ufcRecvTyAt` `:721` |

Two of them are the same scan written twice — "the `IDENT` token whose span covers
(line, col)" — at raw ratio **0.824**; `symTypeAliasAt` resolves the hit through
`cUserTypes` and `sigIdentAt` returns its text. One `identTokAt(line, col): i32` serves
both.

The composed cost is §3's quadratic; the standing cost is that a hover on a 30,000-line
file walks the occurrence table once per query, and a request that asks several questions
walks it several times. The general fix is a line-bucketed index built once per check
(the same move `lint()` took in #2588's shared line index), which turns every
position query into a bucket lookup plus a short scan. Size M. Risk low — the answers
are unchanged and the wasm LSP suites pin them.

Neither the tightest-span rule of `symOccAt` nor the end-inclusive containment convention
changes under an index; both are per-candidate tests, and an index only shrinks the
candidate set.

## 10 · Cost, re-derived

Self-compile guest profile, `--names` seed, **8,972 samples**. Self time by file:

| file | self | file | self |
| --- | ---: | --- | ---: |
| `emit_classify.vl` | 25.67% | `driver.vl` | 2.73% |
| `__str_eq__` (host) | 19.19% | `emit_rep.vl` | 2.21% |
| **`typecheck.vl`** | **12.55%** | `__map_probe__` (host) | 2.20% |
| `emit_base.vl` | 8.70% | `emit_query.vl` | 1.75% |
| **`ast.vl`** | **4.34%** | `wasmEmit.vl` | 1.60% |
| **`tyname.vl`** | **4.31%** | **`lexer.vl`** | **1.48%** |
| **`symbols.vl`** | **3.97%** | `emit_bytes.vl` | 1.46% |
| `emit_collect.vl` | 3.23% | **`parser.vl`** | **0.71%** |

The surveyed area is **30.10%** of self time. `check_query.vl`, `check_state.vl`,
`json_walk.vl`, `format.vl` and `fmt_util.vl` are **0.00%** — see §11.4.

`__str_eq__` at 19.19% is a broad tax, not a site: its parents are `__map_probe__` 15.9%,
`dsDestSlotAt` 8.8%, `exportSlotOfTarget` 8.5%, `scopeSlotOf` 8.1%, `declaredSlotOf` 8.1%,
`declaredSlotLive` 5.2%, and the checker's largest single contributor is
`litUnionAliasOfLitTexts` at 4.1% of it (0.78% of total). No front-end change moves it
much.

### 10.1 · `tyTopIndexOf` is now the area's largest frame

`tyname.vl:158`, **3.28% self**, against 2.42% in the first pass and 4.94% in the perf
survey's own profile — the same function, a different mix. Its parents:
`nameIsFuncTypeAtom` 33.7%, `splitUnionAtoms` 18.7%, `nullablePartOf` 17.4%,
`parenUnionArrElemName` 10.9%, `unionMemberCount` 9.5%, `nameIsRefArray` 8.5%. Six callers
and no dominant one, which is what a shared primitive looks like rather than a hot loop.
It belongs to the destringify track (`perf-opportunities-2026-09.md` item #12); this
survey re-derives the number and prescribes nothing.

### 10.2 · `blockHasBareReturn` — one walk, five askers

`typecheck.vl:21088`. A whole-body walk, recursing into `if`/`while`/`for` bodies, asked
from `checkFuncDeclNode` (`:21913`), `finishInferredReturn` (`:22388`), `emit_collect.vl:2733`
(`computeVoidFns`) and `emit_mono.vl:1603`/`:3512`. Pure over the arena for a given
`fnBody`. **0.53% self**; 62.5% of its samples are its own `ifChainHasBareReturn`
recursion, 16.7% `computeVoidFns`, 12.5% `checkFuncDeclNode`. A node-keyed memo dropped
with the arena is the whole fix; D1600's rule is that the checker and the functype must
agree on the answer, which a memo enforces rather than threatens. Size S. Risk low.
Proof: byte-identical seed.

### 10.3 · Function length after the split

1,935 functions hold 38,380 lines. **18 of ≥ 200 lines hold 6,432 (16.8%)**; 47 of ≥ 100
hold 10,520 (27.4%); 79 of ≥ 70 hold 13,198 (34.4%). The first pass's two giants are
gone — `checkFuncDeclNode` is 549 lines and `checkCallNode` no longer reaches the top 18.
The new top, with the cheapest interior seam (a statement boundary at brace depth 1
between a fifth and four fifths of the way in) and the live locals crossing it:

| lines | function | seam | crossing |
| ---: | --- | ---: | ---: |
| 748 | `typecheck.vl:21133 finishInferredReturn` | +382 | **3** |
| 586 | `:28850 checkBinExprNodeReal` | +308 | 3 |
| 549 | `:21886 checkFuncDeclNode` | +155 | 7 |
| 510 | `:19598 checkMemberCallNode` | +177 | 2 |
| 373 | `:3023 initChecker` | +74 | 0 |
| 373 | `:22772 checkProgramNode` | +108 | 1 |
| 367 | `parser.vl:1678 parseTypeDecl` | +83 | 6 |
| 324 | `driver.vl:2572 modScan` | +322 | 0 |
| 313 | `lexer.vl:751 tokenize` | — | one arm per lexeme class, already flat |
| 307 | `typecheck.vl:10239 tyToNameGo` | — | the merged renderer (#2585) |

`finishInferredReturn` is itself #2591's extraction, and it splits again at three live
locals. `checkMemberCallNode` (510) is #2591's other extraction and is where §10.4's
remaining diagnostic gap concentrates. Neither split buys performance; both buy a
function a reviewer can hold. Proof for either: byte-identical seed.

### 10.4 · Diagnostics with no fixture

Of the checker's diagnostic call sites carrying a prose run of 18 characters or more with
two spaces (`tErr`, `tErrAt`, `tErrCoded`, `tErrCodedAt`, `tHint`, `tHintAt`,
`tHintCoded`, `tWarn`), **42 of 168 (25.0%)** have no run appearing anywhere under
`tests/`. The first pass measured 52 of 149 (34.9%) and named the builtin-method arity
family as 31 of them; `tests/cases/methods/error-array-method-arity.vl` now covers it,
which is most of the fall.

What remains, by family: match patterns and union members 9 (`:30033`, `:30075`, `:30290`,
`:30295`, `:30306`, `:29230`, `:29247`, `:30941`, `:30952`), the flat-record rules 5
(`:11106`, `:11151`, `:11182`, `:11212`, `:11392`), default arguments 3 (`:18483`,
`:18493`, `:18500`), generic-parameter passing 3 (`:18739`, `:19244`, `:20438`),
`internal:` invariants 3 (`:1540`, `:23387`, `:25150` — the last is #2598's own
`checkProgram without initChecker`), named arguments 2 (`:18566`, `:18578`), index
assignment 2 (`:29040`, `:29072`), and 15 scattered.

The instrument counts literal RUNS, not messages, and only the `t*` channel: `parser.vl`
and `lexer.vl` push diagnostics as object literals and record zero sites here, so this is
a lower bound on the checker and says nothing about the parser.

### 10.5 · The only write-only fields left

`ErrExpr` (`ast.vl:67`) is `{ errWhat: string, errAt: i32, pos: i32 }`. `mkErr`
(`ast.vl:1555`) writes all three; `grep` finds **no `.errWhat` or `.errAt` read anywhere
in the tree**. The four producers each pass a recovery reason —
`mkErr("expr", P.pos, p0)` at `parser.vl:1006` and `:1052`,
`mkErr("interpolation hole", P.pos, holePos)` at `:1083`, `mkErr("pat", P.pos, pp)` at
`:2825` — and nothing reads it back. This is the first pass's `Tok.value` shape at four
nodes per parse error rather than 775,815 per parse, so the value is not cost: it is two
dead fields and a recovery reason that could be a diagnostic and is not.

`TyErr.errKind` (`typecheck.vl:267`) is also write-only and must stay: its own comment
says so, because `is` discriminates the arena union on field names and the variant needs
one field to be distinguishable.

Size XS. Risk low but not zero — the emitted parser changes, so byte-identity is
unavailable. Proof: `deno task test`, `regress.py`, `--prove-fixpoint`.

## 11 · Measured negatives

Four things this survey's own instruments flag and that should NOT be changed. They are
here because the method that finds §7 also finds these, and a reader handed the pair list
without them would file three wrong briefs.

### 11.1 · `splitUnionAtoms` / `unionMemberCount` is a chosen divergence

Raw ratio 0.733, the same loop over `tyTopIndexOf`. `unionMemberCount`'s header states the
reason: it "counts separators without materializing the atom strings", and
`splitUnionAtoms`'s says its atoms are "verbatim slices, never a per-code-point
accumulation". Merging them re-introduces the allocation the split exists to avoid. The
same reading applies to `collectRetAtoms` / `collectRetAtomKinds` (0.706), which is the
same split/count pair one layer up.

### 11.2 · `modCacheClear` / `modReset` is not duplication

Normalised ratio 0.914, **raw 0.049**. Two reset functions over two disjoint table
families (`modCache*`, 40 columns; `mod*`/`imp*`/`exp*`/`reExp*`, 33 columns), each a list
of `X = []`. The normaliser sees one shape; the identifiers share nothing. The gap between
the two ratios is the tell, and any pair whose raw ratio is under ~0.2 should be read that
way.

There is a real observation underneath, weaker than a finding: `modReset` leaves 19 of the
52 matching module-level tables untouched, and each is reset by a per-phase function
instead — `modCompile` (10), `modBuildRename` (4), `modCollectSelfFns` (4, one shared with
`modCompile`), `modScan` (2). **None is unreset**, so this is not the `initChecker` case
the first pass found; it is four reset surfaces with an unstated rule about which one a
new table joins. Naming the rule in `modReset`'s header is a comment, not a change.

### 11.3 · No module-level global in the scope is write-only

The `Tok.value` family is empty at the global level: of every module-level `let` in the
scope (`strutil.vl` declares none), **none** has zero read sites once declarations, `X = …`, `X.push(…)`, `X.pop()` and
`X[i] = …` are excluded as writes. The counters that look dead are not —
`modCacheClears`, `modCacheDeadTok` and `modCacheDeadSlots` (`driver.vl:474`–`:476`) are
read by `modCacheStat` (`:2199`), which exists for the test that grades the cache's
storage bound. The `export-budget.py` ratchet, which the first pass's row 9 earned, reads
**0 dead exports**.

### 11.4 · `format.vl` contributes nothing to any profile, and cannot be profiled

`format.vl` (2,331 lines, 102 functions) and `fmt_util.vl` (496, 34) are 0.00% of a
self-compile because only `vl fmt` reaches them — and `VL_PROFILE_GUEST` is honoured only
on the `compile_vl` path (`scripts/vl-host/src/main.rs:2247`), so `vl fmt` and `vl check`
produce no profile at all. That is why this pass has no cost claim about the formatter and
why one should not be inferred from its absence. Statically it is clean by the two
instruments that do reach it: one whole-table scan outside a pass (`fmt_util.vl:53
indentStr`, a lazily grown cache), 5 silent kind ladders, 0 unguarded sentinel reads, and
no duplicate pair at raw ratio ≥ 0.70. A cost claim about it needs either a host change or
a wall-clock ladder, and neither is this survey's.

The same caveat applies to `check_query.vl` and `json_walk.vl`: §9's finding is
structural and its one timing (§3) came from the LSP harness, not from a guest profile.

## 12 · Stale comments name identifiers that are gone

A comment is never re-graded. Deriving the check from the tree rather than reading it:
take every backticked token in a `//` comment that is identifier-shaped (camelCase,
`ALL_CAPS`, or `snake_case`, four characters or more), drop the ones that are a prefix of
a real declaration in `compiler/` or `std/` (so `tpEnv` is the `tpEnv*` family, not a
vanished name), and drop the ones any CODE line anywhere under `compiler/`, `std/`,
`lsp/`, `playground/`, `tests/`, `scripts/`, `bench/` or `reference/` mentions.

**33 sites, 32 distinct names**, over all 13 files:

| file | sites | file | sites |
| --- | ---: | --- | ---: |
| `typecheck.vl` | 22 | `lexer.vl` | 1 |
| `parser.vl` | 5 | `ast.vl` | 1 |
| `driver.vl` | 3 | `check_query.vl` | 1 |

Nine are a deliberate reference to the **frozen TypeScript host** and say so in their own
sentence (`parsePair`, `narrowedPaths`, `indexTrap`, `flattenType`, `defaultIntegerType`,
`conditionNarrowing`, `stringifyType`, `defaultScope`, `loadProgram`); two are the
`TEMPLATE_TAIL` token kind written as `TAIL`. That leaves **22 naming a compiler
identifier the tree no longer has** — among them `elaborateInferRets` (`:2203`),
`binOpType` (`:6655`), `splitGenArgs` (`:8091`), `holeAltIndex` (`:15336`),
`arrayUnionCallTy` (`:19597`), `atomFact` and `subtractType` (`:20985`, one sentence
naming two), `undeclaredIdentMsg` (`:20182`), `fnHasMapParam` (`:27911`),
`OPERATOR_FUNC_NAMES` (`parser.vl:2376`), `STATEMENT_KEYWORDS` (`:2982`),
`emitCodeSection` (`driver.vl:1863`) and `spanContains` (`check_query.vl:188`).

Over all of `compiler/*.vl` the same derivation yields 126 candidates. Across the scope the
raw detector offered 50 identifier-shaped candidates, so its precision here is 33 of 50
(66%), and every miss is one of the two classes above — so a rule that whitelists an
explicit "host" attribution and treats a `TokKind` suffix as a name would land near zero
false positives.

This is the fifth per-file ratchet's natural shape (`comment-budget`, `ladder-budget`,
`sentinel-budget`, `scan-budget`, `export-budget` already share `scripts/ratchet.py`), and
unlike the four comment-style codes it is not a matter of taste: the name either resolves
or it does not. Size S. Risk none — no code changes, and the fix for a hit is either the
current name or deleting the clause.

## 13 · What the ratchets hold here

Cited, not re-derived. `scan-budget.py --check`: **102** arena scans outside a pass, of
which `typecheck.vl` 15 (11 of them the `cw*` covariant-write family, `:13829`–`:14354`)
and `check_query.vl` 1. `ladder-budget.py --check`: **440** silent ladders and 8 split
walks, of which `typecheck.vl` 155, `json_walk.vl` 9, `parser.vl` 5, `format.vl` 5.
`sentinel-budget.py --check`: **379** unguarded reads, 0 untested strict reads, of which
`typecheck.vl` 44, `parser.vl` 1, `driver.vl` 1. `export-budget.py --check`: **0**.
`goal-scoreboard.py`: runs **4,630 / 7,564 (61.21%)**, 0 against the goal, 22 capability
literals reached by no corpus cell.

The `cw*` family is worth one sentence, because it is 11 of `typecheck.vl`'s 15 arena
scans and its memo is dropped whenever `P.nodes.length` moves (`:14404`). **It costs
nothing on the compiler's own source** — no `cw*` frame appears anywhere in the 8,972-sample
profile — so there is no cost row here, only the note that a program with covariant list
assignments pays a whole-arena rebuild per monomorphizer clone, and that measuring it needs
a witness this survey does not have.

## 14 · What I measured and how

Every command ran from this worktree at `a03a40784` with `VL_STD=<worktree>/std`,
`node_modules` and `scripts/vl-host/target` symlinked to the main checkout, after a
self-compile of current source into `build/vl-compiler.wasm` (verified by
`vl build compiler/entry.vl` reproducing the same 2,154,067 bytes). Homebrew's `python3`
was broken for part of the session (`GLIBC_2.38 not found`); every number quoted here was
produced by an interpreter that ran, and the two invocations that failed were re-run under
`/usr/bin/python3`.

**Profiles.** One `--names` seed, one guest profile:

```sh
vl build compiler/entry.vl -o build/names.wasm --names --compiler build/vl-compiler.wasm
VL_PROFILE_GUEST=p.json vl build compiler/entry.vl -o o.wasm --compiler build/names.wasm
python3 scripts/profile-rank.py p.json 45
```

8,972 samples. Self-time shares are load-insensitive, which is why every cost claim above
is a share. Per-file attribution maps each `$mN` suffix to a file by majority vote over
frames whose base name is declared in exactly one module; per-parent attribution ranks the
immediate caller of every sample whose leaf matches a name; family totals add the self
time of frames in the family to the self time of any frame whose immediate parent is in
it. `vl check` and `vl fmt` cannot be profiled this way (§11.4), which is why §3 and §4
use wall-clock ladders instead.

**The find-references ladder** drives `lsp/src/wasmCheckerNode.ts`'s `loadWasmChecker`
directly, calling `referencesAt` on one generated source at two cursor positions, best of
5 per cell. Both arms share the file, so the occurrence table is identical and only the
reference count at the cursor differs.

**The definite-assignment order control** generates `const v<i> = <i>` × N and
`function fn<i>(): i32 { <i> }` × F and writes them in both orders, then times
`vl check` best of 5. Same statements, same tokens, same nodes. Run twice at box load
5.2 and 6.4; the two runs agree within 2%.

**Duplication** normalises every identifier to a positional placeholder in first-seen
order and runs `difflib.SequenceMatcher` over the code lines of all 805 functions of 12 or
more code lines, with a Jaccard prefilter over the normalised line set. Both the
normalised and the raw ratio are reported for every pair; §11.2 is why.

**Function bodies** are brace-matched with string and comment contents removed. **Seams**
take every statement boundary at brace depth 1 and count the locals first declared above
it and last used below it.

**Whole-table scans** match `while <i> < <t>.length` and `for x in <t>` where `<t>` is
neither a local nor a parameter of the function; the parameter exclusion matters — without
it the census reports 28 hits in `ast.vl` instead of 18, every extra one a loop over an
argument. Lazy-grow loops (`while a.length <= n { a.push(…) }`) are still counted and were
excluded by hand.

**Write-only fields** parse each `type X = { … }` body for field names, then count `.f`
reads (not followed by `=`) against `f:` and `.f =` writes over `compiler/`, `std/`,
`lsp/src/`, `tests/` and `playground/`. **Write-only globals** do the same for module-level
`let`, treating `X =`, `X.push(…)`, `X.pop()` and `X[…] =` as writes and everything else
as a read.

**Stale comment names** are §12's derivation, run over all 13 scope files and again over
all of `compiler/*.vl`.

**Diagnostic coverage** parses each diagnostic call's balanced argument list, splits every
string literal at its interpolation seams, keeps runs of 18 characters or more carrying
two spaces, and asks whether any run appears in any file under `tests/`.

**The §1 witnesses** are D938's filed repro verbatim and two variants of it differing by
the position of one function; each was run through `vl check` and `vl run` on the
refreshed seed.

**Ratchet and scoreboard numbers** come from `scripts/scan-budget.py --check`,
`ladder-budget.py --check` and `--list`, `sentinel-budget.py --check` and `--list`,
`export-budget.py --check` and `goal-scoreboard.py`, each run once on this checkout.
