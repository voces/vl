# VL — Design Decisions

Decisions where the **rationale isn't recoverable from the code**.
Implementation detail lives in the code, git history, and `docs/`; this file is
the "why we chose X over Y." Keep entries terse (≈2–4 lines) — the decision and
rationale, not a code walkthrough. Append new entries under the relevant
section. Roadmap items reference these by their tag (e.g. A15, B14).

_(Consolidated from ROADMAP.md, 2026-06-05.)_

## Types & semantics

- **VOID CONTEXTS DISCARD IMPLICIT TAIL VALUES; AN EXPLICIT `return expr` STAYS AN ERROR,
  ANCHORED AT THE RETURN** (2026-08-31). VL is expression-oriented and effectively
  semicolon-less at line ends — `fmt` normalizes semicolons away — so there is no Rust-style
  statement/tail lever to silence a trailing value, and without discard every void callback
  ending in a value-bearing call (`g(() => { xs.pop() })`-shaped code) failed with no
  idiomatic fix. So a function literal checked against an expected `(…) => void`, and a
  declared-void body, both accept a value-bearing tail and DROP it. `return expr` stays
  strict because it states an intent the compiler should hold the author to, and its
  diagnostic anchors at the return (`return type mismatch: expected void, got T`), never at
  the call's closing token. The discard is keyed on the CONTEXT's return type being void —
  never on the tail's shape — so a bare-tail callee with a non-void return keeps returning
  its value (`tests/cases/functions/nonvoid-bare-tail-value-*.vl` pin the keying).
- **FUNCTION VALUES COERCE WHOLESALE INTO VOID SLOTS, AND THE LITERAL/VALUE ASYMMETRY IS
  CHOSEN** (2026-08-31). `(P…) => T` is assignable where `(P…) => void` is expected
  (TS/Kotlin-adapted-reference precedent) — otherwise extracting an inline lambda to a named
  function would break the call that worked. So a named `(): i32` function with explicit
  returns coerces as a VALUE while the same body written INLINE errors on its explicit
  return: deliberate, not accidental — the literal is being written against the void context
  and the compiler holds its author to the stated intent; the value already exists for its
  own callers and is merely being adapted. Wasm makes the adaptation real: a `>v` `$fnsig`
  call signature-checks a 0-result functype, so the emitter mints a capture-free VOID TWIN
  per coerced target (`synthVoidTwins`) rather than granting a rep-less variance. The grant
  is scoped to what a twin can stand in for — a paren-peeled Ident naming an unshadowed
  module-scope `function` with a concrete signature; params, locals, fields and generic
  templates keep the mismatch (no name a capture-free twin could call).
- **A SHAPE→ROW RESOLVER AND THE LITERAL→ROW MATCHER ARE ONE QUESTION, SO A WIDENING ONE
  SIDE ACCEPTS THE OTHER HAS TO NAME** (2026-08-31, silent-class-inventory D733 / D702's filed
  residue). `structIndexOfObjCtx` builds `{ r: 7 }` at a declared `type Circle = { r: i64 }` —
  an integer literal reaches the wider slot (`anonValueFitsField`) — while both field-set
  resolvers refused the same pair on the field CODE, so `shapeNominalOfTy` answered "" for a
  value that is already a `(ref $Circle)` and every container keyed on the recorded shape fell
  to its scalar default. Widening is added as a SECOND PASS behind the strict one, never as a
  looser first pass (D461's own measurement: one lenient pass hands a single-field render the
  first box row instead of the exact one and loses a corpus module), and `shapeNominalOfTy`
  orders strict-struct → strict-variant → widened-struct → widened-variant so a widening can
  never outrank a row identity.
- **THE WIDENED STRUCT PASS DEMANDS A UNIQUE CLAIMANT AND THE WIDENED VARIANT PASS KEEPS FIRST
  MATCH, AND THE ASYMMETRY IS THE POINT** (2026-08-31, D733). Two widened matches are two
  LAYOUTS, so on the struct side — where no single function decides which row a literal builds
  that the scan can be checked against — the scan has no evidence and declines. The variant
  side HAS that function: `objVariantName`, first match over `uVariants` by field-NAME set with
  no scalar tightening, is what `letObjLitVariantIdx` calls to decide the binding's arm. A
  first-match widened scan there answers the row the value already carries, and the widening is
  a strict subset of what `objVariantName` accepts, so it can only agree or decline. Demanding
  uniqueness there would refuse exactly the layout-twin programs the value resolved without
  difficulty.
- **A CAPABILITY FLOOR IS A CLAIM ABOUT THE EMITTED HEAP TYPE, SO ASK THE HEAPS AND NOT THE
  TWIN COLUMNS** (2026-08-31, D732). The value-call arm-parameter floor refused any argument
  that was not the arm, a box holding it, or a literal — and a declared LAYOUT TWIN of the arm
  is none of those while being, in the emitted module, the very same heap type (`uVarSTwin`,
  D280). `sHeapIdx[row] == uVarHeap[vi]` is the predicate, verbatim the one `emitUnionBoxArg`
  already applies at the box boundary: it asks the conjunction of `sTwin`, `uVarTwin` and
  `uVarSTwin` at once, and it is the type the `call_ref` functype actually declares, so the
  guard cannot disagree with the bytes.
- **CANON IS A ONE-WAY REWRITE OVER ANNOTATION NODES, SO ANY EMIT-TIME KEY BUILT FROM AN
  ARENA TYPE HAS TO CARRY CANON'S OWN EQUIVALENCES** (2026-08-30, silent-class-inventory
  D611 / #2024). `canonEmitTypeNames` rewrites `TypeRef` nodes in place and banks the
  rewritten spelling's type in `canonTyIxCol`; `cUserTypes` is populated during checking and
  canon never revisits it. So an INLINE shape row records a post-canon type and a DECLARED
  alias row records a pre-canon one, and `type Box1 = {r: N}` beside `{r: N}` reached
  `buildStructTwins` as two layout-identical rows with two `repCanonId`s — two heap types for
  one shape, check-clean invalid wasm. The fix is to restate canon's rule on the arena side
  (`repCanonFieldTy`: a numeric literal union is its base scalar), not to chase the mint
  sites; there are four of them and only three are named anywhere.
- **A REP-KEY SOFTENING IS SCOPED BY THE POSITION WHERE THE REP IS ACTUALLY THE SAME, AND
  THAT SCOPE IS MEASURED** (2026-08-30, D611 / #2024). A numeric literal union is its base
  scalar in a struct FIELD slot; in the list / map-value / union-member layers it is not the
  same interned row as its base. Softening at the top of `repCanonId`/`repCanonKey` — every
  position — buys the same 227 census cells as the field-only rung and LOSES 21 that run
  today (`d362*_numlitun_*`: `type Z = 0 | 1` under `type L = Z[]`, a map value, a union
  member, all going `runs` → "expected (ref $type), found i32"). Refused on `runs` lost. The
  softening also stays out of the STRING base by construction: a `"a" | "b"` alias NAME is
  its interned-atom identity, so fusing it onto `string` would store an atom id in a
  `(ref $array)` cell.
- **A KEY AND ITS SHADOW ARE ONE CHANGE** (2026-08-30, D611 / #2024). `repCanonId` and
  `repCanonKey` are two recursions over one partition and `hcCheckKey` asserts one key per
  id. Softening only the id fixes the defect and makes the oracle report every merge it buys
  as drift (`merge=4 len=9` under `VL_REP_SHADOW=1`); softening only the string fixes nothing
  (`slotCanonId` consumes the id) and reports `split=4`. Either alone is a worse tree than
  the base.

- **A RUNG THAT CLAIMS "THE SOLE DESTINATION" MUST BE CHECKED AGAINST THE COERCION, NOT
  AGAINST THE ONE DESTINATION SOMEBODY HAD IN HAND** (2026-08-29, silent-class-inventory
  D601 / #2022). `listElemIsBool` lets a DECLARED element name outvote the answer derived
  from the binding's initializer, because the boolean→number coercion adapts an array
  literal element-wise and the annotation is what every `e[i]` read is typed as. The rung
  claimed `i32` and said in its own comment that `i32` was the only spelling that needed
  claiming, "the sole destination the coercion has". `assignableExpr` has TWO: the A7 arm
  (`i32`) and the `u8` arm above it, whose source set is `i32 | u8 | boolean`. So
  `const c: u8[] = [b]` printed `true` for a byte holding 1, while `let d: u8[] = []; d =
  [b]` printed `1` — not because the second consulted anything better, but because its
  initializer was the EMPTY literal and the fall-through has nothing to read there. **The
  set is CLOSED at two, and that is a property of `assignableExpr`, not of this file**:
  every other element name either is `boolean` or is not a destination a boolean can reach,
  so the initializer can never hand it a boolean to outvote.

- **A CHECK THAT ACCEPTS A LITERAL ELEMENT-WISE MUST SAY SO ON THE LITERAL, BECAUSE THE
  EMITTER CLASSIFIES A LIST FROM THE CHECKER'S COLUMN AND NOT FROM THE REP SIDECAR**
  (2026-08-29, silent-class-inventory D591 / #2021). `assignableExpr`'s array-literal
  recursion accepts `[0, b]` into `i32[]` element by element while the literal's own type
  stays the join `(i32 | boolean)[]`. The row proposed `recordRepTyAdopt` on the accepted
  path; it was ALREADY there and already recorded `i32[]`. **`nodeRepTyIx` and `nodeTyIx` are
  two columns and the list classifier reads the second one** — `nodeArrayElemName` says so in
  its own header — so a rep sidecar cannot answer a question the name path asks. The rung is
  therefore a `nodeTyIx` re-stamp beside the litunion and niche arms that were already there
  for the same reason, keyed on the mismatch rather than on the destination: the JOIN
  produced a union and the destination has none. A destination that IS a union is excluded,
  so the union-arm adoption below it keeps deciding for itself.

- **AN UN-ANNOTATED RETURN IS ONE QUESTION, NOT A WHITELIST OF SHAPES** (2026-08-29,
  silent-class-inventory D592 / #2021). `monoMakeInstance` substituted the type argument into
  the return only when an annotation existed, and matched return-expression SHAPES otherwise
  — a `Call` through a closure-pinned param, an `Index` over a param pinned to `f64[]`, an
  `Ident` naming a local. Four spellings the grid found silent are four node kinds and one
  question, and the next spelling nobody has written down is the same question again. The
  ladder now falls through to a re-check that asks the return EXPRESSION its own type.
  **Binding the TYPE parameters is what makes that re-check answer at all**: `checkFuncDecl`
  keeps a generic's type parameters in scope bound to an opaque `mkTyVar`, so `const xs: T[]`
  resolves to a hole however concretely the VALUE parameters are pinned — the first cut
  returned "" everywhere and the probe read `nret` unchanged. It is FILTERED to the reps the
  i32 default gets wrong, so an i32/boolean/u8 return still mints nothing and stays
  byte-identical.

- **THE STRUCT ARM OF THAT FALL-THROUGH IS REFUSED, AND THE PRICE IS MODULES RATHER THAN
  CELLS** (2026-08-29, silent-class-inventory D592 / #2021). Extending the re-check to a
  STRUCT return buys six more cells and kills FOUR corpus modules: it mints an annotation
  naming an inline shape nothing registered, and the emitter answers `emitProgram: ref
  valtype with no interned shape`. Every grid column stayed flat under it — 22 cells
  `invalid -> runs`, 0 lost, 0 wrong value — so the veto term was one no cell grade could
  report. `joingrid.py --refused <seed>` keeps the refusal executable against the four
  modules; the candidate re-derives from `scratch-int/d591/mkvariant.py R1R0R2R3`.

- **AN "INERT" REFACTOR OF AN ISOLATED RE-CHECK IS A BEHAVIOURAL CLAIM, AND THE READ HAS TO
  STAY INSIDE THE ISOLATION** (2026-08-29, #2021). `monoInferListElem` and
  `monoInferLocalScalar` were two copies of one 90-line isolated body re-check differing only
  in what they read back, and D592 needed a third reader. A first extraction returned the
  arena ROW and let each wrapper render it afterwards — with the scope popped and
  `inferQuiet` / `symEnabled` restored — and THREE corpus modules stopped building
  ("type mismatch: expected f64, found i32"), while every grid column, every histogram and
  every `runs`/`not-runs` grade stayed flat. Split into `monoRecheckBegin` /
  `monoRecheckEnd` around each caller's own read, it measures 1,967 identical · 0 DIFFER ·
  0 LOST. **The saved state is an ARRAY both halves index in one order**, because the two
  halves have to agree on the SET of eighteen tables and a forgotten one leaks emit-time
  speculation into the column the emitter still reads.

- **A PIN THAT RE-ASKS A BODY'S QUESTION MUST BE HANDED THE SUBSTITUTED TYPE, NOT ONLY THE
  SUBSTITUTED PAIR** (2026-08-29, silent-class-inventory D581 / #2020). D551's rule was "call
  the function the body called"; this is its other half. `validateLetCstrs` handed
  `assignableExpr` a correctly substituted `(i32[], string[])` and got TRUE, because that
  function's array-literal recursion re-derives each element's type from the element NODE
  (`nodeTyIxOf`) — which at the pin still carries the UN-SUBSTITUTED hole. **A predicate that
  reads anything off the AST is only as substituted as the thing it reads.** Its ObjLit
  sibling reads the field type off `srcTy` and was correct all along, which is why the object
  literal was loud and the array literal was not; the fix is to make the array arm read the
  container the same way, gated on the element's own record being hole-bearing so the
  per-element adaptation rules are untouched everywhere else.

- **A MUTUAL-ASSIGNABILITY JOIN SILENTLY DELETES A HOLE, SO A GATE THAT ASKS "DOES THIS TYPE
  CARRY A HOLE" CAN BE ASKING ABOUT A TYPE THE HOLE WAS ALREADY REMOVED FROM** (2026-08-29,
  silent-class-inventory D581 / #2020). `checkArrayLitNode` joins its element types with
  `joinTys`; a hole is permissively assignable BOTH ways, so `[true, self]` collapses to
  `boolean` and the hole is gone before `noteLetCstr` ever sees it. `joinRetTys` carries this
  exact note for the return accumulator ("a HOLE must not collapse HERE") and nobody had
  asked it at the element join. **Two repairs are available and they are not equivalent.**
  Reconstructing the dropped union and recording it as the CONTAINER's type reproduces the
  direct spelling's sentence VERBATIM — and then the pin hands every element the JOIN of all
  of them, so `const xs: i32[] = [0, self]` at `g(true)`, which runs and prints `1` through
  the A7 coercion, becomes a false reject. Asking per SLOT keeps the coercion and pays a
  vaguer message. **When a reconstruction is coarser than what it reconstructs, prefer the
  finer ask and accept the weaker sentence**; the refused candidate is kept buildable and its
  two-cell price is in `named/`.

- **A DEFERRED-CONSTRAINT TABLE IS DEFINED BY WHAT ITS PIN CAN ASK, NOT BY WHAT IT RECORDS —
  WHICH IS WHY THE BUILTIN ARGUMENTS COULD NOT JOIN `argCstr`** (2026-08-29,
  silent-class-inventory D582 / #2020). `argCstr` looks like the right home for "an argument
  the body could not judge", and it is not: it is owned by a callee it can NAME (a builtin
  has no `FuncDecl`), and its pin asks plain `assignable` with no argument NODE in hand.
  Three of the fourteen builtin arms ask `assignableExpr`, so that pin would refuse
  `xs.push(self)` over an `i32[]` at `g(true)` — D551's first cut, one callee kind over — and
  asking the expression predicate for all fourteen leaks the other way, waving
  `"abc".charCodeAt(self)` at `g(true)` past a check its direct spelling fails. The seventh
  table therefore carries the argument node and a FORM, and `bmArgPred` keys the predicate
  off the form. **Mirror the arm, arm for arm; one predicate for a heterogeneous surface is
  wrong in both directions at once.**

- **THE ONE INSTRUMENT THAT CAN SEE A COMPILER TRAP IS THE ONE THAT BUILDS REAL MODULES**
  (2026-08-29, silent-class-inventory D582 / #2020). The slot walk's destination peel read
  `T.tys[dtix]` before testing the index; `let x = null` binds `mkNullableTy(-1)`, whose inner
  is not yet a type and which `tyHasHole` answers FALSE for, so one peel reaches `-1` and the
  second read traps. 33 corpus modules died. **Every grid column stayed flat** — the grid's
  own cells do not write `null` into an un-annotated binding — and so did every histogram and
  every `runs`/`not-runs` count. Only `corpuscmp.py`'s LOST column saw it, which is why it is
  the FIRST instrument a landing runs and not a formality after the grid is green.

- **A PIN THAT RE-ASKS A BODY'S QUESTION MUST CALL THE FUNCTION THE BODY CALLED, NOT AN
  EQUIVALENT ONE** (2026-08-29, silent-class-inventory D551 / #2017). `validateRetCstrs` asks
  `assignableExpr` on the substituted pair, not `assignable`. The two differ: the A7
  boolean-to-`i32` coercion, the f32-literal adoption, the literal-type member rule and the
  nominal-literal brand waiver all live at the EXPRESSION seam and are deliberately absent
  from the plain predicate. Asking `assignable` made the generic spelling REFUSE
  `function g<T>(self: T): i32 { return self }` at `g(true)` while the direct spelling runs —
  a false reject invented by the fix. **The identity is the soundness argument**: parity with
  the direct spelling is structural, not a second rule that can drift the way `checkBinary`
  and `binOpDefinedFor` did (D492/D493). The recorded column is therefore the returned
  EXPRESSION's node, not a position for the diagnostic.

- **A REJECT IS NOT AVAILABLE WHEN THE PROGRAM IT WOULD DEMAND CANNOT BE WRITTEN — SO DRAW
  THE RULE AROUND THAT PROGRAM RATHER THAN DROPPING IT** (2026-08-29, silent-class-inventory
  D561 / #2017, revised by D561's close). D551's rule generalises one column over — a
  concrete body under a type-parameter RETURN is the same silent module beside the same loud
  direct twin — and the widening ALONE was refused, because it costs
  `tests/cases/memory/flat-generic-rows-branded.vl`, where a generic hands back an `i32`
  address as a `new i32` brand: the direct spelling is a loud `return type mismatch`, so the
  pin would be RIGHT, but `(self.base + i * 4) as A` is `` `as` supports numeric conversions
  only ``. **"Make it loud" is only an answer when the author has a spelling for what they
  meant** — and the converse also holds: **the absence of a spelling bounds ONE mismatch, not
  the whole rule.** What ships is the widening minus `retNomOnlyAtHole`, which defers exactly
  the mismatch with no writable repair (a want-side-only constraint whose destination is a
  newtype BRAND over a base the body's type already fits). Four cells close and the corpus is
  byte-identical. The residue is D571; the day `as A` exists it goes with the exemption.

- **THE HOLE'S SIDE DECIDES WHICH RULE ADJUDICATES IT, AND ONE PREDICATE FOR BOTH RE-OPENS
  THE ROW BELOW IT** (2026-08-29, silent-class-inventory D561 / #2017). `retCstr` now records
  which side carried the hole. A hole on the BODY side sits under a declaration the author
  SPELLED, so the repair is writable and D551 holds them to it; a hole on the DECLARED side
  is a destination named `A`, and there is no cast to hold anyone to. Asking the newtype
  exemption of both took `function g<T>(self: T): A1 { return self }` from D551's positioned
  reject to `runs` printing `6`. **A candidate that INVENTS a passing program is invisible to
  a price ledger, which counts lost `runs`** — so the grid grew a second ledger (`refute`)
  and the tree a must-reject fixture.

- **A GRID THAT DROPS THE VALUE CANNOT SEE A REP-COMPATIBLE TYPE ERROR, AND WILL SCORE ITS
  FIX AS A REGRESSION** (2026-08-29, silent-class-inventory D561 / #2017). The `wanthole`
  block printed `1` at every cell, so `d551w_bool_typar` — `function g<T>(self: T, n: i32): T
  { return n + 1 }` at a `boolean` — read as a healthy `runs`, and the standing gate blocked
  the fix that closed it. Printed, it is `false` for an argument that was `true`: i32 and
  boolean share a rep, so there was no invalid wasm to trip over and only the VALUE says
  anything. Second time in one week (`pingrid2` could not see wrong values at all).
  **Where a row is a type mismatch, print the result.**

- **A DEFERRED TYPE IS A TYPE NOTHING IN THE BODY CHECKS, SO THE DEFERRAL HAS TO STOP WHERE
  A CHECK WOULD HAVE RUN — AND THE CHECK IS BUILDABLE** (2026-08-29, silent-class-inventory
  D532 / #2016; RESOLVED by D551 / #2017: the bound named its own successor and is now gone,
  and restoring it costs two corpus modules). `HD_BINOP`
  hands a generic body's `a op b` a hole instead of an answer, which is right precisely
  because the body cannot decide it. But an ANNOTATED return is a check the body *can* run,
  and a hole is permissively `assignable` to anything: with the deferral inside one,
  `function g<T>(a: T, b: T): V { return a < b }` stops being a loud `return type mismatch`
  and becomes check-clean invalid wasm at an `i32` pin. Both readings are defensible and only
  one was measured — 4 cells — so the rung is bounded to un-annotated bodies and the
  remainder is filed as D551 rather than argued about. **Deferring an answer is not free; it
  costs every check that would have consumed the answer, and those are enumerable.**

- **THE ADJUDICATOR A ROW NAMES IS NOT NECESSARILY THE ADJUDICATOR** (2026-08-29, D532 /
  #2016). The row filed a stated obstacle — "no positioned reject is available at either
  layer as the code stands", because "the pin's adjudicator (`binOpDefinedFor`) returns a
  BOOLEAN with no channel to correct a recorded type". The sentence is TRUE of
  `binOpDefinedFor` and the conclusion is still false: the pin's adjudicator is
  `validateBinCstrs`, which emits positioned diagnostics at the call, and the layer that
  decides a hole's answer per pin is `substHoleTy`, which returns TYPES and has had a
  four-kind derivation table since W6. The obstacle was a fact about one function read as a
  fact about a layer. **Re-derive an inherited obstacle against the code, not against the
  sentence** — the capability the row called "strictly more work than either gate this row's
  parent built" was one derivation kind wide.


- **A ROW'S HEADLINE IS A HYPOTHESIS ABOUT THE CAUSE; THE GRID NEEDS AN AXIS THAT CAN
  REFUTE IT** (2026-08-29, silent-class-inventory D511 / #2015). The row said an operator
  overload lowers "only when the call's LEFT argument is SPELLED like the parameter", and
  the witness it shipped was consistent with that: rename the two constants and the program
  breaks. It was still the wrong cause — the constants in that witness are BOTH the call's
  arguments and the module's bindings, so the witness cannot separate them. The separating
  cell adds an unused `const a: V` beside `p`/`q` and passes `p`/`q`: it RUNS, so what is
  consulted is `structIndexOfExpr`'s bare `declaredStructIndex(name)` — a module-scope
  lookup with no scope test — and the call never enters it. **When a row's witness varies
  two things at once, the axis that holds one of them fixed is the whole instrument**, and
  it belongs in the grid rather than in the prose.

- **A GRID CAN BE STRUCTURALLY BLIND TO A DEFECT BECAUSE OF WHAT ITS CELLS ARE NAMED**
  (2026-08-29, D511 / #2015). `d492/pingrid.py` names every module constant `a`/`b`, which
  are the generic's own parameter names — so every one of its `objop` cells dispatches
  through the name leak, and the leak is invisible in all 894 of them. The grid was not
  wrong; a naming convention chosen for readability pinned an axis nobody knew existed.
  **A new defect found in a grid's residue deserves a new population, not a re-grade of the
  old one** — the residue is exactly where the old grid's fixed choices show.

- **ONE MECHANISM AND ONE HOME IS NOT THE SAME CLAIM AS ONE EDIT, AND THE ABLATION IS WHAT
  SEPARATES THEM** (2026-08-29, D511/D512 / #2015). #2010 asked whether one edit closed its
  pair and measured YES: stripping a single arm restored all 168 cells. The same question
  here measures NO. D511 and D512 are one mechanism (a question asked of a hole instead of a
  pin), share one home (a per-instance body rung), and share a traversal that is worth ZERO
  cells and zero corpus bytes on its own — but each row needs its OWN arm, and stripping
  either leaves the other open. Reporting "one edit" would have been the natural summary and
  it would have been false. **Ask the question of each row separately; the shared rung's own
  score is a third measurement, not an average of the two.**

- **A `--price` CHECK THAT CANNOT RUN IS THE RIGHT OUTCOME WHEN THERE IS NO PRICE**
  (2026-08-29, #2015). `pingrid2.py --price` exits 1 with "EMPTY POPULATION … This is a
  FAILURE, not a pass" on this landing, and that is correct rather than a defect: the
  landing lost 0 `runs` cells, so there is no override to validate. #2011 made an empty
  population a failure because a missing ledger printed three `0 fail` lines and "override
  holds"; the same rule read the other way says **a landing with no price should never
  produce a green `--price` line**, and a reviewer who sees one should ask which ledger was
  read.

- **THE PREDICATE A NEW SITE NEEDS IS OFTEN ALREADY EXPORTED, WITH ITS HEADER SAYING WHY**
  (2026-08-29, D512 / #2015). `tyExcludesNull` was already split out of
  `nodeTyExcludesNull` and exported, its header stating it is "shared so the CHECKER (which
  holds a type, not a node) and the emit-time fold (which holds a node) cannot disagree".
  The pin is a third holder of a TYPE, and it reads the same predicate rather than a fourth
  copy of the rule. Grep for the type-taking twin before writing one — the reason it exists
  is usually the reason you need it.
- **A PRICE LEDGER'S OWN CELLS CAN BE BLIND, AND A `--price` CHECK MUST SAY SO RATHER
  THAN COUNT THEM AS PASSES** (2026-08-29, silent-class-inventory D521 / #2014). The
  runs-lost override turns on term (c): the lost cell printed a value its own source
  CONTRADICTS. Four of D521's twenty could not answer it — `>` and `>=` at `1, 2` are
  natively `false` and their bodies also return `false`, so stdout cannot separate dispatch
  from inert. They passed (c) silently, because `output != declaration answer` is false in
  exactly the same way for a blind cell as for a correct one. **The do-nothing rule applies
  to the cells a check READS, not only to the ones a grid GENERATES** — an older ledger's
  axes are not re-derivable and cannot be fixed in place. The fix is a distinguishing TWIN
  the check runs (the same program returning the other constant) and its own reported
  column, never a fold into the pass count.

- **WHEN EVERY GATE IN A FAMILY IS RAISED FROM ONE PASS, THAT PASS'S POPULATION IS AN
  UNEXAMINED AXIS** (2026-08-29, silent-class-inventory D541 / #2014). Five separate
  declaration-site rules — D444, D445, D471, D425, D491/D521 — were each argued on the
  right predicate and each raised from `checkProgram`'s pass-1 hoist, which walks
  `gRootStmts`. Nothing was wrong with any of the predicates; the shared blind spot was
  that a `function "+"` one level down is not in that list, so all five missed it at once
  and the class stayed silent through six landings. **The question that finds this is not
  "is the predicate right" but "over what population is it evaluated" — and it is cheap:
  the answer was one grep for an indented operator declaration and one four-line program.**
  The same question fired again one level down: writing the POSITION as a grid axis rather than
  assuming it meant "inside a function" is what showed a top-level `if` BLOCK is equally
  outside `gRootStmts` — and that the fix's own first message was false of half the
  population it catches.

- **A REACH PROBE ON ONE SITE MEASURES A NUMBER; IT DOES NOT MEASURE A CAUSE — PUT THE
  SAME PROBE ON THE CALLERS** (2026-08-29, silent-class-inventory D501 / #2012). D411's
  close probed `letRefListDestSlot`, got `reach=0` on exactly the 28 cells that did not
  move, and filed a row whose whole content was that partition. The number reproduced
  EXACTLY on an independent rebuild — and the cause the row inferred from it
  (*"something upstream claims the literal's element row … `scanArrLitCommit` is the first
  place to probe"*) was **wrong**. Probing the three CALLERS as well showed all three
  entered for the binding in all 28 cells, each returning early because the binding already
  had an ANNOTATION: the arm pin, four passes out, not the row's guess. `reach=0` at a
  callee is compatible with "nobody asks", "the caller declines" and "the caller's earlier
  arm answered", and only a probe that spans the call can tell them apart. **Cost of the
  wider probe: one extra tag per call site in the same build.**

- **A SAFETY PROPERTY IS ONLY AS COMPLETE AS THE THINGS ITS SCAN CAN SEE** (2026-08-29,
  D501 / #2012). The arm pin's rule is *"every destination must agree"*, and it is right.
  Its holes are not in the rule: `dstPinMapValue` **skips** a map whose value spelling names
  no arm instead of pushing the `""` that every other leg pushes, there is no leg for a
  struct FIELD (measured as a loud floor for an OBJECT literal, which a LIST field is not),
  and `synthRetPinAnn` has no agreement gate at all and runs after the one that does. So a
  destination that disagreed was simply never counted. **When a pass's correctness rests on
  a scan, the audit is over the scan's legs, not over the rule** — and a leg that *gates its
  push* is a hole, where a leg that *pushes a decline* is not.

- **A REFUSAL THAT NAMES TWO LAYERS HAS NOT NAMED EVERY LAYER** (2026-08-29,
  silent-class-inventory D491 / #2012). #2007 refuted a declaration-site rule (the same
  generic operator dispatches at an object receiver) and a call-site rule (an unconstrained
  `T` is assignable from everything, so the reject spreads to `40 + 2` in another function)
  and concluded *"no positioned reject is available at either layer today"*. Both
  refutations hold and the conclusion does not follow: the missing input is the **conjunction
  of the two ends**, and the checker holds both before `checkProgram` returns. Banking
  `checkBinary`'s own per-site `if odsp is TyObj` decision by operator NAME, and reading it
  back once at the end of the pass, refuses a hole-`self` declaration no site dispatched to
  while at least one took the built-in — positioned at the declaration, at `vl check`.
  **When two layers are each refuted for lacking half the information, the next question is
  where the two halves MEET, not whether a third layer has both.**

- **A ROW'S PROPOSED MECHANISM IS THE PART TO RE-MEASURE, EVEN WHEN THE ROW IS RIGHT TO
  REFUSE** (2026-08-29, D491 / #2012). The row's remaining candidate was the monomorphizer,
  *"where a `<T>` pinned at `i32` becomes a concrete signature while the struct instantiation
  still has to dispatch"*. There is no `i32` instantiation: `dispatchRewrite` never rewrites
  `a + b` into a call, so `monoInstantiate` is not entered and the declaration is replaced by
  a `() -> void` prune stub — `wasm-dis` shows the empty stub beside the object twin's real
  `(ref $1),(ref $1) -> i32`. The layer's real discriminator is "instantiated at all", a
  whole-program fact, not "pinned at i32 versus at V"; and it fires after `vl check` has
  passed, which is a different silent class. **Two refusals in a row were correct with a
  false reason attached, and the false reason is what the next person builds against.**

- **NARROW A GATE BY THE POPULATION THAT BLOCKS, AND FILE THE POPULATION** (2026-08-29,
  D491 / D521 / #2012). D491's first cut keyed on "the `self` type carries a hole", which is
  true of an UN-annotated `self` too — a parameter with no annotation is a fresh type
  variable. Measured, that costs 20 `runs` cells (`d425c001`..`d425c039` odd) whose recorded
  expectation is the BUILT-IN's `10`: the corpus calls them correct programs, so the gate
  blocks. The 19 cells the row actually names were recorded by its parent with the
  DECLARATION's answer as their expectation, so they never scored `runs` and cost nothing.
  **The same transition is a price or a veto depending on which answer the named set wrote
  down** — which is the strongest argument yet for recording the declaration's answer rather
  than a quiet `runs`. The wider population is filed as D521 with its 20 cells named.

- **A ROW'S OWN ARITHMETIC IS EVIDENCE, AND IT CONTRADICTED ITS OWN PROSE** (2026-08-28,
  silent-class-inventory-2 D451 / #2007). The row named "the SIX reps whose nullable is a BOX
  rather than a niche", then listed **seven** and computed `6 × 4 × 2 = 48 + 8` for a 56-cell
  family that is `7 × 4 × 2`. Re-grading per rep took one command and found all seven 8/8
  silent — **and that only four of them are boxes at all**. `new string` is a nullable-STRING
  niche and the two three-deep arrays are nullable-REF-ARRAY niches; the three families give
  three different wasm errors and needed three different rungs, so a fix built to the row's
  stated mechanism would have closed 32 of 56 and left 24 looking like a second defect. **The
  rule: when a row's count and its list disagree, the list is usually right and the mechanism
  sentence is usually the thing that was never re-measured.** Re-grade the population by rep
  before believing a family is one family — a per-rep histogram of a named set costs ~10
  invocations and is what separated three mechanisms here.

- **A SILENT DEFECT'S OWN GRID CANNOT GRADE ITS SOUNDNESS RUNGS, AND WHICH REP HIDES THEM IS
  PREDICTABLE** (2026-08-28, D451 / #2007). The candidate that closed all 56 of D451's cells,
  minus its two write-retirement rungs, scores **0 silent and 150 runs on all 184 grid cells**
  and loses **three `runs` programs to `wasm trap: null reference`**. The grid is a READ grid:
  guard, then read. Every rung that lives in the *statement between them* is invisible to it,
  and no derived corpus can find them either, because on the landed compiler those programs
  behave exactly like their class-mates. **What is generalisable is which rep exposes them.**
  A cell whose declared rep the CHECKER refuses to read hides the emit half completely — for a
  boxed `NtI32 | null` there is no `print` lowering, so a read after a retiring write is a
  check reject whether or not the emitter retired anything. Only a NICHE cell (`string | null`
  prints as `null`) is check-clean at the declared rep and so reaches the emitter at all. The
  checker's own four `index-place-narrowing-*` soundness fixtures are all box-ish and were
  blind to this. **When adding an emit-side twin of a checker rule, build the soundness
  witness on the rep whose UN-narrowed read the checker ACCEPTS — that is the only rep where
  the two sides can disagree out loud.**

- **A REFUSED REFINEMENT'S PRICE CAN BE NEGATIVE FOR A REASON NOBODY FILED, AND ANOTHER ROW'S
  CLOSE FLIPS IT** (2026-08-28, silent-class-inventory-2 D452 / #2007). D452 was filed as "a
  refinement, not a defect: the blunt rule is SOUND and the precise one is not yet written" —
  a cost stated purely as work-not-done. Measured by lifting `callInvalidatesReal`'s blunt `[`
  leg on both compilers, the box and `arr3` spellings it would newly admit were **check-clean
  INVALID WASM on the base** and run on the D451 landing. So refining it before D451 would
  have converted loud rejects into silent cells for exactly the reps D451 covered: **D451 was
  D452's precondition and neither row said so.** This is the D207 lesson in a second shape —
  a refusal is a measurement with a timestamp — with the twist that the staleness was not in
  the number but in a dependency that was never written down. **When filing a refinement,
  measure what it would ADMIT, not only what it costs to write; and name the rows whose state
  that measurement depends on.**

- **A REFUSAL IS A CLAIM ABOUT AN ANSWER SET, AND THE SET IS USUALLY "WAYS TO MAKE IT RUN"**
  (2026-08-28, silent-class-inventory D411 / #2008). D411 was filed as "a REFUSAL, not a gap"
  and enumerated three fixes — a checker variance rule, a store-side coercion, a binding
  split. All three were re-tested and all three still stand refused, one of them now with a
  price attached (the variance rule reddens D381's own subject, 7 measured control cells).
  **What the enumeration left out is that a program the compiler cannot lower is a LOUD
  REJECT.** Turning 68 check-clean invalid modules into 68 positioned emit errors costs
  nothing that runs and is strictly better, which is the same move `Root A` describes for the
  86-cell union-box family. So the rule for this inventory: when a row's refusal enumerates
  only ways to make the witness RUN, it has not yet been asked whether the class can be made
  loud — and closing it as a SILENT class is a real close even when the defect stays.

- **A LENIENCY THAT MAKES A RESOLVER AGREE WITH ITS TWIN MUST BE A SECOND PASS, NOT A WIDER
  FIRST ONE** (2026-08-28, silent-class-inventory D461 / #2008). `structIndexOfObjCtx` (node
  input) and `structIndexOfTypeName` (name input) answer the same question — which struct row
  a literal builds at — and differed by exactly one arm: a union-BOX field accepts every atom
  on the node side and was a proven mismatch on the name side. Adding that arm to the name
  side in ONE pass is a regression, measured: first-match-wins then hands every single-field
  render the first BOX row rather than the exact row later in the table, and
  `tests/cases/maps/inferred-map-destination-shape.vl` stops building. Running the strict scan
  first and the lenient scan only for a render that placed NOWHERE keeps every existing answer
  byte-identical and adds an answer only where the caller had none. **Generalise it: a
  leniency added to reconcile two resolvers belongs strictly below the answers that already
  exist, because what makes the twin's answer right is the adoption that already happened, not
  a rule about the types.**

- **AN ARITY TEST OVER SPELLINGS IS A DISTINCTNESS TEST, AND WRITING IT AS `length == 1` HIDES
  A WHOLE DECLARATION FORM** (2026-08-28, silent-class-inventory D446 / #2008).
  `unionStructAliasShape` gated the struct-alias path on `variants.length == 1`, which is right
  for the intersection spelling it was written for (`&` concatenates into one variant string)
  and wrong for `type AB = {a,b} | {a,b}`, which denotes exactly one struct and reads 2 because
  nothing on the declaration route dedups. The declaration was therefore invisible to the
  entire struct-alias path including #2004's R2/R3. **The arity of a variant list is a proxy;
  the question is how many DISTINCT arms there are.** Kept spelling-distinct rather than
  type-distinct on purpose: two arms of one type may be spelled two ways, and collapsing those
  is a nominal question (#1942) this predicate has no standing to settle.

- **THE GATE'S CRITERION AND THE SHIPPING CRITERION ARE ONE CRITERION, and letting them drift
  cost this repo a large net win for a day** (2026-08-28, silent-class-inventory-2 D11 /
  #1993 → #2003). `scripts/silent-sweep/distilled/regress.py` blocks on `runs → not-runs` and
  on nothing else, for a reason it states: *a program that did not work before and does not
  work now has not regressed in the sense a gate should stop the world for*. The shipping bar
  drifted stricter than that without anyone deciding it should, and #1993 refused a candidate
  that bought **72 cells `loud check reject` → `runs`** and lost **zero** running programs,
  because it also moved 48 cells loud→silent. Re-measured and landed at #2003 the same
  candidate buys 86 and 40 and still loses zero. **The rule now written down: refuse on a
  `runs` cell lost, on a new COMPILER trap, or on a corpus module that stops building.
  Loud→silent is a PRICE to measure and to keep whole in `distilled/named/` — that is what
  `named/` is for — never a veto.** The asymmetry is not a preference, it is what the two
  outcomes cost a user: a loud reject that becomes a silent one costs a person who was
  already blocked a worse diagnostic, while a working program that stops working costs a
  person who was not blocked at all.

- **A CONSTANT-INDEX ELEMENT IS A PLACE, and the retirement side is what makes that true —
  keying one without it is a check-clean run-time trap** (2026-08-28,
  silent-class-inventory-2 D11/D341). `writeRetiresNarrowing`'s header used to record the old
  symmetry as a proof: *"An unkeyable target (`xs[i] = …`) names no place and retires nothing
  — and no narrowing can key one either, so both sides stay consistent."* That is true and it
  is not free: the moment `placeKeyOf` keys `xs[0]`, three writes stop retiring anything (a
  VARIABLE-index write keys `""`, a ROOT rebind matches only `tgtKey + "."`, and an aliasing
  call has no index sub-path in its write-effect summary) and each becomes a program that
  type-checks and dies `wasm trap: null reference` — a column the census records as ZERO
  across 250,238 cells. So the key arm and the three retirement arms are ONE landing, and
  #1993 was right to refuse the key on its own; what it got wrong was pricing the traps as
  unavoidable rather than building the three rungs, each of which is a few lines.
  **The general form, which is the part worth keeping**: a comment that says two sides stay
  consistent *because* one of them cannot answer is a dependency, not an invariant. Teaching
  the silent side to answer is what breaks it, and the grep for the next instance is the word
  "either" in a header.

- **An index cell's aliasing-call retirement is deliberately UNREFINED, and the bluntness is a
  measured position rather than an omission** (2026-08-28, silent-class-inventory-2 D452).
  Everywhere else `callInvalidatesReal` refines by write effect — a callee that only READS
  keeps every narrowing, which is what makes the rule usable rather than merely sound. It
  cannot refine an index cell, because `fnWriteEffects`' summaries are `,`-terminated FIELD
  sub-paths and `placeSubPath` answers `""` for `ys[0] = …`: a callee that nulls the cell and
  a callee that touches nothing record the identical summary, so consulting it would fail
  OPEN on exactly the construct the rule exists for. Matching `ak + "["` and returning true is
  the same choice the `key == ak` leg beside it already makes about a write to the argument
  place itself. The refinement — a distinguished `[]` component in the summary vocabulary that
  `pathHitsAny` can never match against a field path — is filed as D452 and is a refinement,
  not a repair; the cost of not having it is bounded and local (`const t = xs[0]` before the
  call).

- **A REFUSAL IS A MEASUREMENT WITH A DATE ON IT, AND THE ROW THAT NAMES ITS OWN UNBLOCKER
  IS THE ONE TO RE-RUN FIRST** (2026-08-28, silent-class-inventory D207). D207 was refused on
  2026-08-27 for a measured 889-cell loud→silent price and the row wrote down exactly what
  would retire it: *"Closing D181 is what unblocks this row, and the bound is the one line to
  delete."* **D181 closed the next day**, and for a further day D207 kept reading as a live
  refusal because the inventory is not the file the fixer edits. Re-graded unchanged, the same
  one-line lift now costs **zero** — 6,037 census cells loud→`runs`, no `runs` lost, nothing
  into silence. The rule this earns: a refusal that cites a *specific open row* as its cause
  is not a standing decision, it is a subscription, and the cheapest thing to re-run when that
  row closes is every refusal that named it. Grading a citation is also how D461 was found —
  D207 said its other half was "filed as D209", and D209 had closed under a *different*
  witness, so the map spelling had been standing behind another row's ID with no row of its own.

- **A LENIENT MATCH THAT REFUTES ONLY ON FULLY-KNOWN EVIDENCE MUST NOT BE FED IN DEPENDENCY
  ORDER — THE FIX IS A PRE-PASS, NOT A NEW RULE** (2026-08-28, silent-class-inventory D391;
  D-ANONORDER). `anonValueFitsField`'s code-15 arm already refuses to merge two same-fieldset
  literals whose nested field points at different targets, and it was correct and unreachable:
  it can only refute when BOTH target names are known, a name is
  `sNames[structIndexOfObj(inner)]`, and the second literal's nested value was skipped by
  `anonNestNeedsRow` *precisely because* it had no name yet — which is what kept it nameless.
  A circularity, not a missing discriminator. The row's own parked question asked for a new
  one (promote `structIndexOfObjCtxGo`'s `strict` to a real discriminator); that was built and
  refuted — `strict` stays true on both sides here, so promoting it changes nothing. The tell
  that named the real cause was a CONTROL, not a reading: **delete the union declaration and
  the same pair already worked on every compiler**, with separate owner rows in the
  disassembly. The union case differed in one respect only — its arm-claimed nested literals
  are minted late. So when a resolver looks right and fires wrong, vary what it is allowed to
  KNOW before adding to what it is allowed to say.

- **A binding's CELL and its initializer's BUILD are ONE landing, so a destination-driven
  element rep has to reach both rungs or it is a new invalid module** (2026-08-28,
  silent-class-inventory D381). An un-annotated `const lv1 = [{ r: 7 }]` types its list from
  its own elements; `letRefListDestSlot` corrects that from the declared destination the
  binding flows into (`letMapDestShape`'s D203 shape, one container over), and the row that
  filed it prescribed exactly that. What the row did not say is that `collectLocals` picks the
  local's valtype through `letRefListSlot` while `emitLetDeclStmt` seeds the literal's
  construction through `pendingListKind`/`pendingListSlot`: give the destination to one and
  not the other and the binding stores an arm list into a box cell, which is the same
  check-clean invalid wasm at a new offset. `letListBuildKind`/`letListBuildSlot` is the pair,
  and it is one function precisely so the two halves cannot drift. The same rule chose the map
  arm's input: reading the destination map's INTERNED shape (`mvRlSlot[mapShapeOfExpr(…)]`,
  the obvious route and the one `letMapDestShape` uses) answers only after the map's value
  slot exists, so with the literal declared BEFORE the map the CELL half got -1 and the BUILD
  half got the slot — measured, not feared. The shipped arm reads the map's ANNOTATION, which
  the annotation walk interns ahead of both. The rung is a FIND: every slot it returns was
  already interned by the destination's own annotation, so it can move a binding onto an
  existing slot and can never mint one or skip a mint.

- **A loud floor whose whole justification is refuted comes OFF, and the price it was kept for
  is re-measured on every block that ever priced it** (2026-08-28, silent-class-inventory
  D223). Reverses the entry above: `armRecvHoldsBareArm`'s ref-list-element decline is deleted.
  Its stated reason — "the module is already invalid before the read" — is refuted in the type
  section (the inner list is `array.new_fixed` of the `Circle` STRUCT and the outer of that
  list's own wrapper; the construction was well-typed and the decline was stopping emission
  first), and the 24 cells it was kept for were D361's silence rather than its own price. Held
  to the standard the refusal set: D219 priced the decline on blocks B and E, #1995 re-graded
  only E, and the close re-graded **B, C, D and E — 100,014 cells, cell-matched** — for
  **1,329 cells moved, all `loud emit reject` → `runs`, `runs` LOST 0, → silent 0**. Block A is
  not re-graded and the gap is stated rather than implied: no loud→silent move was ever priced
  there. The named set `d223-lift-price` is kept, with its baseline flipped from `loud emit
  reject` to `runs` — a tripwire that fired is worth more as a landed set than as a deleted one.

- **PARENTHESES ARE NOT PART OF A PLACE, and the peel goes at the HEAD of the key rather
  than at its callers** (2026-08-28, silent-class-inventory D352). `placeKeyOf` is the
  checker's narrowing key and has fifteen callers — the member read, the fact collector, the
  assignment retirement, the write barrier, the dead-`??` hint. Teaching each caller to
  `unwrapParen` its own argument was the alternative and is rejected for the reason D222's
  emitter half already paid for: three callers were taught there and the SIXTH read, in the
  key itself, kept the defect alive. `Member` and `OptMember` reach their receivers through
  `placeKeyOf` itself, so one arm at the head covers the node, its receiver and every link.
  **The third arm is a DECLINE and it must land with the other two**: `placeHasOptionalHop`
  is what stops an else-branch refining a place behind a `?.`, and with the key peeling and
  that predicate raw it answers FALSE for `(x?.y)` — a soundness rule sold for 28 cells. It
  moves 0 cells on every derived population; its two witnesses are kept whole.

- **The fifth `arrSpineIs*` twin asks the leaf's DECLARATION, and repeats none of the
  renderer's exceptions** (2026-08-28, silent-class-inventory D362). A declared alias at an
  array leaf is a one-member `TyUnion` in the arena, never its own constructor, so all four
  declared-alias leaf kinds decline all four existing predicates at once.
  `arrSpineIsUnionAlias` gates on `unionAliasDeclNameOfTy` being non-empty and stops there.
  The alternative considered — repeating the numeric-litunion exception the sibling
  predicates' headers warn about (`type Z = 0 | 1` must render `i32[]`, never `Z[]`) — is
  rejected because `tyToNominalNameGo` already short-circuits such an alias to its base
  scalar, so a copy here would be a second home for one rule and the two could drift. The
  claim and the render leg are ONE landing: the leg moves 0 of 322 grid cells, 0 of 1,477
  derived classes and 0 corpus bytes on its own, and without it the intersection leaf the
  claim buys goes straight back to a loud emit reject.

- **`.length` on an unbounded type parameter is ADMITTED, and the disagreement it resolves is
  with `x[i]` rather than with anything about `T`** (2026-08-28, silent-class-inventory-2
  D14). VL has no bounds, so neither operation can be justified from the type alone; what
  decides it is that `checkIndexNode` already admits `x[i]` for every type variable while
  `checkMemberNode` admitted `.length` only for the `?`-prefixed inference hole, and nothing
  wrote down that they should differ. Resolving toward the STRICT side was the other option
  and is rejected because it would refuse `x[i]`, which D3 and the corpus depend on. The
  price is named and paid in MESSAGES, not in silence: seven of fifteen argument reps move
  from a positioned check reject to a positioned emit reject, and `memFloorMsg` makes that
  message say `.length` instead of naming a struct field. **The permissive side is not
  copied wholesale** — `print(x[0])` through an unbounded `T` over a list-of-list is
  check-clean invalid wasm on three reps and is filed as D401 rather than matched.

- **A compiler probe reports through `tErr`, never `print`** (2026-08-28, learned twice in
  one session). A compiler run under `--compiler` has no `__print_*` imports wired, so a
  `print`-based probe build dies with `unknown import: imports::__print_i32__` before it
  compiles anything — and the harness reads that as **reach=0 at every site**, which is
  indistinguishable from "the arm is never reached". Two probe builds were thrown away to it
  while measuring D362. The diagnostic channel is always live, accumulates rather than
  throwing, and prints positioned.

- **`x is T` asks a TAG question, so `assignable` is the wrong predicate for it — a numeric
  WIDENING is not a variant** (2026-08-28, silent-class-inventory D228). The soundness gate on
  `is` asks whether the check type can flow into the receiver's non-null part, which is the
  right question for a STORE and the wrong one for a runtime tag test: the widening lattice
  (i32→i64, i32→f64, f32→f64) is a set of CONVERSIONS, and codegen emits a real instruction at
  each boundary, so the value in the slot is not of the source type and no tag says it is. The
  alternative considered was leaving it to the emitter's `vbHeapIdxOfKind` guards, which is what
  the tree did: the test was admitted, the then-branch narrowed the binding VERBATIM, and the
  emitter either lowered a value-box read for a box the module never minted (a loud reject since
  #1972, a `ref.cast (ref 0)` on dead code before it) or let a dead branch through. Rejected
  because a second error channel doing the checker's job is the shape this gate's own header
  names as a LAUNDER, and because the outcome depended on what ELSE the module declared — one
  unrelated `const h: i32 | null = 3` mints the box and the same line builds. **The price is 44
  programs that ran**, all with an always-false test and a dead `then`; it is a named set
  (`d228-is-widen`) rather than a reason to keep the hole. Same-primitive pairs are never a
  widening, stated in NAMES rather than arena indices so a newtype brand cannot slip through
  identity.

- **A `{`-leading type-declaration body owns its `[]` SUFFIX, at the declaration fork rather
  than at any later reader** (2026-08-28, silent-class-inventory D188). `parseTypeDecl` sends a
  `{`-leading body to the struct path and tested only for `&` and `|` after the closing brace; a
  `[` matched nothing, so `type L = {n: i32}[]` declared the struct `{n: i32}` and the two
  brackets became the next STATEMENT — an empty array literal, accepted silently. The suffix is
  consumed at the fork, ahead of the `&`/`|` continuation, because it binds tighter than both:
  `{a: i32}[] | null` is a nullable ARRAY and the union loop must see `{a:i32}[]` as its first
  member. `atTypeCont` is `parseTypeAtom`'s own suffix test, so the two grammars cannot disagree
  about what a `[]` suffix is, and no newline is skipped ahead of it — a `[` on the next line
  opens a statement, exactly as after any other annotation. The rung MUST NOT land alone: with
  the parser producing an array alias the transparency rule has no arm for, nine programs of
  this family go from a loud check reject to check-clean invalid wasm (`d188-rung-price`).

- **A loud floor over a defect that is silent at the neighbouring spelling is still worth
  keeping, until the defect closes** (2026-08-28, silent-class-inventory D223/D361).
  `armRecvHoldsBareArm` declines a ref-list ELEMENT receiver, and both it and D223 justified the
  decline as "the module is already invalid before the read". That is refuted — lift the decline
  and D223's own witness RUNS and prints the right answer, and the decline costs **828** census
  block-E cells that go loud → `runs` with 0 `runs` lost. It is kept anyway, for the **24** cells
  the lift takes loud → check-clean invalid wasm. The argument for lifting is that those 24 are
  already silent on master one binding away (`const e0 = g1[0]` instead of `(g1[0]).r`), so the
  loudness belongs to a spelling rather than to the class; the argument against, which wins, is
  this programme's own standing rule that loud → silent is a blocker in its own right. The 24
  coordinates are committed so the trade can be re-made in one command the day D361 closes.
  **D361 is now closed, and the re-grade says the trade is free**: the BARE lift still costs
  exactly those 24 (re-measured on `1e598e2b`, set-identical to the committed coordinates),
  and on top of D361's landing the same lift moves 852 block-E cells, all 852 loud → `runs`,
  0 → silent, with all 24 among them. The 24 were D361's silence, not the lift's price.
  **SUPERSEDED 2026-08-28** — the decline is off; see the D223 entry at the top of this
  section for the four-block re-grade that took it.

- **The recorded UNION of a list literal's elements is a JOIN of their SHAPES; the box
  decision is about their ROWS, and the two are not the same question** (2026-08-28,
  silent-class-inventory D361). `arrLitObjElemBoxVariant` — the one home of the
  object-literal widening rule, asked by all three element classifiers — fired whenever the
  arena said the array's element was a non-literal union of two or more members, and then
  widened element 0's variant to that variant's union. Its own header already argued the
  narrower version of this point (a structural field-name scan must not answer a question
  the checker answered) and stopped one step short. `[{ r: {c2:1} }, { r: {s2:1} }]` over
  `type Circle = { r: Shape2 }` joins to `{r:Cir2}|{r:Sq2}` because the two `r` VALUES have
  different shapes, while both literals are the one arm `Circle` by field-name set — so the
  literal minted a box list, a declared `Circle[]` destination wanted the arm's struct, and
  the module was `vl check` rc 0 and refused by the engine. The rung asks the arm's own
  predicate of EVERY element instead of element 0, and declines the widening when they all
  answer one name. It never looks at the destination: **the literal was wrong standing
  alone**, which is what the row's own filed diagnosis ("the fix has to reach the
  destination") had backwards. Its bounds are two or more elements, all object literals, all
  naming the same row — and the last two are load-bearing, measured: dropping "all object
  literals" takes `[{ r: 7 }, c]` from `runs` to a loud emit reject, dropping "the same row"
  stops a corpus fixture compiling at all. **The grid the landing was priced on separates
  none of the three**; only the corpus and two hand-built witnesses do.

- **A narrowing's retirement is split by CAUSE, not by SPELLING — a direct write reads at the
  declared type, an aliased write through a call still refuses** (2026-08-28,
  silent-class-inventory-2 D8). A retired BARE-NAME narrowing has always left the name readable
  at its declared type; the property-PATH spelling refused outright, and the reason on record
  was "a path narrowing also dies to an ALIASED write through a call, which the emitter has no
  relation to detect". That is a true statement about ONE of the two things `npInvBy` records.
  A direct `w.f = e` is a statement the emit walk passes over exactly as it passes over
  `f = e`, so the emit side can retire it and does; the call cause cannot be seen and keeps the
  refusal. Splitting by cause rather than by spelling is what makes the two sides agree — and
  the emitter's Member write-retirement arm is not optional: without it eight scalar-newtype
  cells emit `bare null needs a struct-typed context`, because the checker widened the read
  while the emit stack still held the narrowed rep. **A general rule this instance is worth
  keeping for**: when a refusal is justified by what the emitter cannot see, check whether the
  refusal is wider than the blindness. Here it was exactly twice as wide.

- **What a place ACCEPTS is its storage type even after the narrowing has been retired, and
  asking otherwise made a write-effect summary look like a rep axis** (2026-08-28,
  silent-class-inventory-2 D8). `writeStorageTy` declined for a slot whose `npInvBy` was
  already set. Inside one assignment statement that is an ordering bug: `lt` is read off the
  target BEFORE the right-hand side is checked, so it is the narrowed type; the RHS is then
  checked and an opaque callee retires the path; and the storage question, asked afterwards,
  sees the retirement and declines — leaving the write checked against a type the storage never
  had. The observable was `cannot assign {[string]: i32} | null to {[string]: i32}` when the
  RHS callee's body used a METHOD call and clean when it used an index write, which inventory-2
  filed as a property of the SET rep. Answering for a retired narrowing is also right on its
  own terms: a retired narrowing means the place reads at its declared type from there on.

- **An INDEX place is deliberately not narrowable, and the retirement machinery is written
  against that** (2026-08-28, silent-class-inventory-2 D11/D341). Making `xs[0] != null` narrow
  `xs[0]` takes four checker rungs and buys 72 of 184 cells. It is REFUSED because the rest of
  the system states the invariant it breaks: `writeRetiresNarrowing`'s header reads "An
  unkeyable target (`xs[i] = …`) names no place and retires nothing — and no narrowing can key
  one either, so both sides stay consistent". Keying one breaks all three retirement paths — a
  variable-index write keys `""`, a root rebind misses because the prefix leg matches
  `tgtKey + "."` and never `tgtKey + "["`, and an aliasing call misses because the write-effect
  summaries have no index sub-path vocabulary — and the emitter has no index-place narrowing
  channel at all, so 48 loud rejects become check-clean invalid wasm. Measured price:
  `scripts/silent-sweep/census/d341-index-place-price.json`. **Closing it is a whole landing of
  its own, and a PARTIAL one is strictly worse than today**: every missing part converts a loud
  reject into a silent class.

- **A read that stops being a BOX must stop being one in every classifier that answers for it,
  and "how many consumers would have to learn it" is a count, not an argument** (2026-08-28,
  silent-class-inventory D311). D209 made an un-narrowed code-16 read DELIVER a bare atom where
  its channel predicate fires, and taught `exprUnion` — the classifier every box consumer asks —
  to stop calling such a read a union value. Two functions that answer the same question were
  left behind: `memberUnionReadKind` (the member dual of `unionIdentReadKind`, whose documented
  contract is "the atom KIND this read currently reads as") kept answering `-2` for "a box", and
  `unionNameOfExpr`'s Member arm kept NAMING the union, so a binding over such a read was
  registered as a union binding. Both are now gated on the same `memReadUnboxAtomKind` the read
  site and `exprUnion` ask. `memberUnionFieldNameRead`'s header already stated the rule for the
  WIDENING direction — *the three read classifiers are one decision and must widen together* —
  and this is the same rule in the other direction, which nothing had written down.

  **The entry above this one estimated the cost of that as "every consumer classifier (`print`
  alone reads four) would then have to learn the predicate, and the un-taught ones fail
  SILENTLY". The count was right and the inference was wrong, and the correction is worth
  keeping**: four of the five classifiers `print` dispatches on — `exprIsF32` / `exprIsF64` /
  `exprIsI64` / `exprIsBool` — open with a typed-IR FAST PATH reading the CHECKER's recorded type
  for the node, and the atom this channel delivers IS the checker's type for the node, so they
  were already correct and a Member arm on each measured `ans=0` at 31,062 corpus reaches.
  `exprString` is the exception and it is a principled one: canon SOFTENS a literal union to the
  spelling `string` while its rep is an interned i32 atom, so a fast path there would mis-claim
  it (`letIsString`'s own header refuses the same substitution for the same reason). **The
  number of consumers a contract change touches is measurable before it is argued about — build
  the arm on each, count `reach` and `ans`, and let the ones that score zero stay unwritten.**

- **A UNION BOX's WIDENING is a function, and both ends of the box ask it** (2026-08-28,
  silent-class-inventory D291). `emitUnionCoerce` widens an i32 value into a union whose only
  numeric arm is `i64` / `f64` / `f32`, and an f64 into an `f32`-only one — the STORE's own
  promotion ladder. That ladder is now `unionStoreAtomKind(unionName, kind)` and the
  un-narrowed code-16 READ asks the same function to learn which value box the payload it is
  looking at was put in. **The alternative considered and rejected was to let the read DELIVER
  the atom the box holds** rather than the atom the checker typed the consumers against: that
  is the larger change, because every consumer classifier (`print` alone reads four) would then
  have to learn the predicate, and the un-taught ones fail SILENTLY. Keeping the delivered atom
  as the contract means the conversion is confined to the read, and it is exact — the payload
  can only have been widened FROM the checker's atom, which is what the ladder answering a
  different kind means.

- **A promotion ladder that two sites re-derive is a defect waiting for its second half**
  (2026-08-28, D291). Before this, three places decided which arm of a union a scalar is stored
  under: `emitUnionCoerce` (the full ladder, i64 then f64 then f32), `unionEqAtomOf` (the i64
  branch only) and `memReadUnboxAtomKind`'s condition 3 (plain membership, no promotion at all).
  The i32→f64 half of `unionEqAtomOf` had been missing since the coerce ladder was taught it, and
  the symptom was `runs but wrong value`: `const v: C = { r: 7 }` over `{ r: f64 | null }` made
  `(v).r == 7` silently false. **The rule is not "share the code because duplication is bad" —
  it is that a store and a read of the same box are one decision, and a copy is a place for them
  to disagree that no test names.**

- **Structural identity ignores FIELD ORDER — except for flat types** (owner ruling
  2026-08-19). `{a: i32, b: i32}` and `{b: i32, a: i32}` are the same type, and the
  emitter's shape dedup keys on a sid-SORTED `(field name, field code, element, map-key
  bit, atom bit)` multiset so that order cannot change the identity. Until this ruling the
  property was EMERGENT — it fell out of matching each queried field by name — rather than
  stated, which is why the sort is now deliberate and commented as the rule it enforces.
  **The exception is FLAT types, where field order IS the byte layout**, so a permuted twin
  is a different layout and must not dedup. *(Open: confirm "flat" means the buffer/view
  family, and pin a fixture proving a flat type does not dedup with a field-permuted twin —
  nothing enforces the exception today.)*

- **A declared alias and its inline spelling are the SAME TYPE; the DIAGNOSTIC shows the
  LOCAL spelling** (owner ruling 2026-08-19). `type A = {v: i32}` and a bare `{v: i32}`
  denote one type, and the compiler may merge their rows freely — this is what licenses the
  emitter's arena-keyed row lookups, where two structurally identical rows interned under
  different spellings resolve to whichever comes first. **But a message must render the
  spelling the user WROTE at that position**, not whichever spelling the merged row happens
  to carry: being told about `A` when you wrote `{v: i32}` is confusing, and the merge is an
  implementation fact the reader has no way to know. Owner direction is additionally that a
  reader should be able to DIVE into a spelling's depth — `A` by default, expanded to
  `{v: i32}` on demand — rather than the compiler choosing one level for them. *(The
  local-spelling renderer and the depth affordance are both unbuilt; the merge itself is
  live.)*

- **Fully typed, no `dynamic`.** Types are hidden by aggressive inference, but
  `Unknown`/`Infer` are inference _holes that resolve_ to concrete types — there
  is no gradual/untyped escape hatch. Blueprint: Elixir v1.20 set-theoretic
  types. (A0)
- **`==`/`!=` are structural (by value), and DATA-ONLY.** `{x:1} == {x:1}` is `true`
  — consistent with numerics and strings and VL's value semantics. A function value
  has no structural equality (extensional equality is undecidable; comparing captured
  VALUES would be a third relation nobody has), so `==` on two functions is a CHECK
  ERROR pointing at `===`, and a struct with a function field refuses `==` by field
  name (Go's rule). There is no custom `==` — `function "=="` is a parse error (D46).
  (A15; functions RE-RULED 2026-09-01 — they had compared "by reference" under `==`,
  which was identity wearing the structural operator.)
- **Referential identity is `===`/`!==` — one `ref.eq`, reference reps only.** Owner
  ruling 2026-09-01, ten decisions taken one at a time over `docs/identity-design.md`
  (§0 carries them) and its three-lens critique
  (`docs/internals/identity-critique-synthesis.md`). Operands: struct, list/array, map,
  function value, or a nullable of one. A union of struct arms compares the PAYLOAD,
  never the per-widening-site box (`u === u` must be `true` outside an `is` guard). A
  function is the same iff same table index AND the same captured-environment object:
  `mk(1) === mk(1)` is `false` with equal captures, `const a = f; const b = f; a === b`
  is `true` — the closure struct is per-binding and is NOT what is compared.
  `null === null` is `true`, statically; `x === null` gets a hint pointing at `== null`.
  Scalars, `string` (a value in VL) and any union with a scalar/string arm are check
  errors — one template, three arms, rendered at the user's spelling (`Id`, never the
  erased `string`). Kotlin kept `===` and retrofitted these diagnostics; Dart removed
  it; the choice is made knowing both. Generics: a body's `===` is an inferred
  constraint on `T`, reported at the call on the offending argument like every
  operator. A newtype has exactly its base's identity (the brand is erased);
  cross-brand `===` rejects like every mixed-brand operator. A list's identity is its
  `{backing, len, cap}` header's — §VL.7's header-less rep inherits that as a
  constraint. (A15)
- **Keys: `Map`/`Set` keys are STRUCTURAL, and key-eligible = `==`-comparable.** Every
  field kind `==` accepts keys — `f64`, lists, nested structs included; the key hash and
  `==` share ONE lowering (D1017 is why). Consequences recorded rather than
  special-cased, all three in the `Map` header: a struct key holding a NaN is inserted
  and never found (IEEE — Go's behaviour; JS `Map` and Java special-case it, VL keeps
  one relation); the hash folds `-0.0` into `0.0` so `0.0 == -0.0` finds its entry; a
  key mutated after insertion is lost (Java's rule). **`IdentityMap<K, V>` /
  `IdentitySet<K>` are the identity-keyed containers** — separate concrete types with
  `Map`/`Set`'s whole surface, `K` = anything `===` accepts, and BOTH satisfy the
  index-signature interface: `{[K]: V}` is the CAPABILITY, not the implementation, and
  a signature names `Map<K, V>` or `IdentityMap<K, V>` when it wants the specific one
  (the concrete names become annotation-legal and `Map<string, i32>()` parses
  TS-style as part of this — neither exists today). Rep: the existing 7-field map
  struct with `ref.eq` as the probe compare; v1 is a flat scan, and the lazy `i64`
  per-class serial is the optimisation that follows ONLY WHEN MEASURED NECESSARY — the
  API is identical, so nothing waits on it. Identity keys keep their objects alive;
  there are no weak references. (A15)
- **Bare literals default to their base type.** `let x = 0` is `i32`, not the
  singleton `0`; the literal type survives only via an explicit annotation
  (`let x: 0 | 1`). (A16)
- **A literal in an f32 context is admitted when f32 holds the best
  representation of what was WRITTEN** — which means the two literal kinds take
  different rules, by force rather than for symmetry. A `.` literal is
  *context-typed*: it is f32 from birth and rounds ONCE at 24 bits (never
  decimal→f64→f32; the two differ, and
  `tests/cases/numerics/f32-literal-single-round.vl` is the witness). Gating it on
  exactness instead would reject `0.1`/`3.14` and leave nothing to admit. An
  INTEGER literal is *exactness-gated*: it denotes an exact integer, so admitting
  one f32 cannot hold would be the silent lossy conversion the lossless-only rule
  exists to forbid. Escape hatches stay one token (`16777217.0`, or `as f32`), so
  the gate removes silence, not reach. Chosen over C/Rust's uniform
  context-typing, which loses the digit without a word. (webcraft P2)
- **`let x = null` is a nullable hole, not the `null` type.** `null` is
  hole-bearing like `[]` (it inhabits every `T | null`), so its `T` is inferred
  from later usage and the initializer contributes the `| null`: `let x = null;
  x = 5` ⇒ `x: i32 | null`. This fills an open hole — NOT a pin violation: VL
  pins _complete_ types (`let x = 7; x = "foo"` errors, no `i32 | string`
  widening), but `null` isn't complete, so assigning into it selects its `T`
  rather than conflicting. Flow-narrowing strips the `| null` on paths where `x`
  is definitely assigned (no null tax on the straight-line case); an
  unconstrained `let x = null` resolves to `null`. Chosen over the
  consistent-but-annotation-heavy alternative (exact `null` type, write
  `let x: T | null = null`) so the conditional-assign idiom
  (`let x = null; if c { x = f() }`) works annotation-free. `null` is the one
  scalar literal treated as hole-bearing. (A-infer-null)
- **Uninitialized `let x` / `let x: T` is non-null + definite-assignment-checked,
  not implicitly null.** A read where `x` is not provably written on every
  preceding path is an error ("used before assigned"); the declaration itself is
  fine — the _reads_ are gated. Chosen over implicit-null (which would tax every
  declare-then-assign binding with a sticky `| null` and null-check noise) and
  over mandatory initializers (a dummy `= 0` masks the forgot-to-assign bug that
  definite assignment catches). Closes a live soundness gap: today
  `let x: i32; return x` compiles and returns a silent `0`. Reuses the
  CFG/narrowing machinery the `is`-guards already need. So the three let-forms
  are distinct: `let x = null` (nullable, initialized), `let x` / `let x: T`
  (non-null, must-write-before-read), `let x = expr` (type from `expr`).
  (A-definite-assign)
- **Literal unions are the enum idiom — no separate `enum` construct.**
  `0 | 1 | 2`, `"expense" | "reimbursement"`. (A16)
- **`?.` is null-only.** Optional chaining guards `null`, not a union variant —
  a value-union arm (`foo: i32 | {x}`) is discriminated with `is`. So a `null`
  result always means "the receiver was null," never "wrong variant." (A5)
- **Bodyless `type Point` is a clean error.** A bodyless `type` decl is a
  diagnostic, not a silent self-referential alias. (A14)
- **A nominal type is `type N = new B`, and it is ERASED.** `new` is a
  CONTEXTUAL keyword (only after a `type` declaration's `=`), so it stays a legal
  identifier everywhere else. The brand is a checker-side arena-index sidecar —
  the arena stays structural — and the emitter never learns the name, because
  canon's alias-transparency arm has already rewritten the annotation to its base
  by the time it runs. So a newtype has NO wrapper, NO private heap type, and no
  emitter file knows it exists. A syntactic LITERAL is brand-polymorphic (it has
  no prior identity to confuse); a VARIABLE needs `as` in either direction;
  same-brand arithmetic keeps the brand and a mixed pair rejects. This
  deliberately does NOT take the forward-compat seam below: injecting nominal
  identity into `repCanonKey` would cost a wasm type per declaration and break
  the byte-identity that IS the zero-cost claim. That seam stays right for a
  future OPAQUE type that needs runtime identity.
  (A14 / webcraft P1.5 → `docs/internals/newtype-design.md`)
- **Object-literal field-value mismatches are errors, except behind an alias
  leaf.** `ensureType`'s `Object` case raises on a wrong-typed field value
  (`{ value: i32 }` given `"x"`). It stays lenient _only_ when the
  expected/actual field type resolves to a user-`type` alias leaf (a `Type`
  wrapper) or `Never`: an object literal is a bare `Object`, so checking it
  against a recursive alias arm (`left: Tree | null`) hits the
  `Type`-vs-bare-`Object` false-negative the A11 traversal depends on, and
  `Never` is an upstream-error placeholder. Tightening only the non-alias-leaf
  case closes the soundness gap without re-introducing infinite recursion on
  self-references. (A12)
- **Type negation is `!A`, not `not A`; the negated guard is `x !is T`.**
  Surface syntax for the intersection/negation algebra: `A & B` (intersection,
  binds tighter than `|`), `!A` (negation, prefix, binds tighter than `&`), and
  `x !is T` (negated type-guard). Rationale: VL already chose `!` over the `not`
  keyword for boolean negation (B10), so a single negation token across values,
  types, and guards keeps the surface consistent and reintroduces no `not`
  keyword. `x !is T` follows Kotlin's `!is` (negate the operator) over C#'s
  `is not` / `is !T` — it reads cleanly and stays `!`-consistent; it desugars to
  the existing `is` node with a `negated` flag and mirrors `is` narrowing
  (then-branch subtracts `T`, else-branch narrows to `T`). Surface type negation
  is rare across languages (TS has only the named `Exclude<A,B>`; set-theoretic
  systems write `¬t`/difference internally) — Whiley is the main precedent for a
  `!`-style negation type. (A3/A4)
- **`const` = immutable binding, `let` = reassignable (JS/TS semantics),
  enforced.** `const x` cannot be rebound (`x = …`, `x++`/`x--` are errors);
  `let x` can. This corrects an earlier inverted state where `const` was the
  reassignable form and immutability wasn't enforced at all. Rationale: match
  the overwhelmingly familiar JS/TS meaning rather than surprise every newcomer.
  **Binding mutability is a distinct axis from data mutability:** `const`
  governs only whether the _name_ may be rebound — the data behind it may still
  mutate (`const o = {…}; o.x = 2` and `a[i] = …` stay legal). Read-only data
  and deep immutability ride a separate axis (A9 `readonly` + immutable value
  types like strings), not the binding keyword. Follow-up: the `prefer-const`
  lint (PR #75) must be re-pointed to flag an unmutated `let` (suggest `const`)
  once both land.

- **`void` is a real type in the lattice — a unit type wearing the `void`
  spelling — and it is NOT `null`.** The keyword stays (no churn, and it reads
  as every C-family author expects), but the checker treats it as a type with a
  single value rather than a marker for "no type". Four consequences, ruled
  together because they are one root: (a) `return <void expr>` is legal in a
  void function and lowers to `expr; return`; (b) a function value is
  **covariant in a void return** — `() => i32` is assignable to `() => void`,
  i.e. a caller may discard a result; (c) a type parameter may instantiate at
  void, and the monomorphizer emits an empty result for that instance; (d) void
  stays **non-storable** — no `void[]`, no `void | i32`, no void map value.
  Chosen because languages that make void a keyword instead of a type (Java,
  C#, C++) all grow the same hole at generics and then need a `Void`/`Unit`
  patch, while the ones that made it a real unit type (Rust `()`, Kotlin/Scala
  `Unit`, Swift `Void`) need no special case anywhere — and VL had already hit
  the Java hole (`function call<T>(f: () => T): T { return f() }` at `T = void`
  was `vl check`-clean invalid wasm). Explicitly NOT unified with `null`:
  `T | null` is the absence idiom in the errors-as-values design, so a void
  function returning `null` would make `if writeFile(p) == null` look like a
  failure check that is unconditionally true. (d) is what #1435's `void | i32`
  join gate was already enforcing; it stays, and its justification becomes
  "unit has no representation" rather than an ad-hoc refusal. Point (b)
  retires the `done()` wart — `beforeEach(() => { hits = hits + 1 })` failing
  with `expected () => void, got () => i32` — without disturbing the
  assignment-is-an-expression rule below, which is what produces the `i32`.
  (#1435, ROADMAP `:746`)

- **Variance and exactness: inferred, with no annotation surface in v1.**
  Parameters are Inexact by default and values Exact (A8); `Readable`/
  `Writable` are applied automatically during parameter inference (A9), with no
  spelling an author writes. The defaults are the owner's own, from
  `docs/guide/language-todo.md:15-20`; what is decided here is the **surface**
  (none) and the **migration** (nothing to migrate). The migration half was
  settled by measurement rather than preference: the population of programs an
  A9 tightening could break is empty of *working* programs. Every container
  subtype→supertype passing shape is already in a failing column — the struct
  width family (`Cat[]` → `Animal[]`, writing body, read-only body, or an
  un-annotated source) is a loud reject behind #1456's width gate, and the
  union-widening family (`i32[]` → `(i32|null)[]`, `K[]` → `string[]`) is
  `vl check`-clean invalid wasm in BOTH directions. So A9's Writable half only
  moves cells up a column (check-clean invalid wasm → loud reject) and harms
  nothing, while its Readable half is blocked on **representation**, not on
  this ruling: `peek(xs)` reading an `i32[]` as `(i32|null)[]` is sound, the
  checker already agrees, and the emitter cannot express it (different WasmGC
  array types, no conversion). An annotation is wanted later, for one reason
  worth recording so it survives: with inference alone, variance is a property
  of a function's BODY, so adding a `.push` to a body silently breaks every
  caller and the error lands at the call site rather than at the change. That
  is an API-stability argument that only bites once there are cross-module
  consumers, and the annotation is additive, so it waits. (A8, A9)

  **WHICH HALF IS THE WORK, MEASURED 2026-08-31 (silent-class-inventory D773 /
  D774).** The migration sentence above is right and has been read as though it
  made `Writable` the half worth building first. It is not. Of the 80 corpus
  cells `goal-scoreboard.py` attributed to array covariance on `b7d5e593`,
  **exactly 2 contain a store or a `.push` anywhere in the program**; the other
  78 are read-only, and adding a store to one of them changes neither the
  message nor its position (`d774_k1k2_{nostore,store,param_store}` are the
  identical positioned emit reject). So `Writable` reaches 2 of 80 — both of
  them clause-1 traps, which is exactly why it is still worth building — and
  **`Readable` is the other 78.** The Readable half's blocker is unchanged and
  now has a witness rather than a description: `const a: Circle[] = […]` then
  `const b: Shape[] = a`, reading only, is `vl check` rc 0 and an invalid
  module. And the copy this ruling calls unavailable is unavailable only on the
  WRITABLE side: for a read-only destination an element-converting copy is
  indistinguishable from the alias, because no write through either handle can
  observe the difference. D661B's refusal of a converting copy — "gives one
  destination a private list, which no other list assignment in the language
  does" — is a statement about a writable destination and does not reach a
  readable one.

  **BUILT 2026-08-31 (silent-class-inventory D791), AND THE SURFACE IS STILL NONE.**
  The `Readable` half above is no longer blocked: an element-CONVERTING COPY landed
  in the emitter and a whole-program write scan licenses it, closing **63 of the
  family's 76 corpus cells** — `runs` 4,250 -> 4,313 of 7,262, `goal-scoreboard.py`
  79 -> 16 against the goal, 0 `runs` lost, 0 cells into any silent class. Nothing
  an author writes changed: there is no new syntax, no migration, and no annotation,
  exactly as this ruling requires. Three corrections it earns:

  * **The blocker was REPRESENTATION and it was not WasmGC's to remove.** The
    sentence above says the emitter "cannot express it (different WasmGC array
    types, no conversion)", and the reason no `(sub …)` edge can be built is worth
    stating rather than leaving as a fact about today's emitter: a **mutable array
    is INVARIANT in WasmGC**, so #2040's structural width subtyping cannot relate a
    `Circle[]` backing to a `Shape[]` one no matter how the element types are
    declared — and a union BOX is not a width supertype of its arm in any case. A
    copy is not one lowering among several; it is the only one.

  * **The LICENCE is what a copy needs, and it is a whole-program property.** The
    copy is sound exactly where nothing writes through either handle, so the
    inference is not per-binding: a write in ANY function, through ANY alias, is the
    write that observes the divergence. What shipped is rep-scoped and whole-program
    ("does anything in this program store into, push to, or clear a list whose
    element rep is this row"), which is conservative — it declines a legal program
    whose write is to an unrelated list of the same element rep. That is a residual
    clause-2 gap, filed as D791/D793 rather than described as the ruling's intent.

  * **`Writable` is still unbuilt, and it now has a predicate rather than only a
    name.** The four cells it would reach are D793. What that row adds to the
    migration argument above: the write scan computes the right question at the
    wrong granularity — declining a LOWERING on a rep-scoped answer costs nothing,
    but REFUSING a program on one is a false reject, so the `Writable` rule needs a
    per-value analysis this landing did not build.

  **`Writable` BUILT 2026-08-31 (silent-class-inventory D821/D822), AND THE SURFACE IS
  STILL NONE.** Both halves of A9 are now real. A covariant list assignment whose value
  is WRITTEN THROUGH is a positioned CHECK reject naming the write; a read-only one takes
  the converting copy. Nothing an author writes changed: no syntax, no migration, no
  annotation. `goal-scoreboard.py` **14 -> 5** against the goal on the 7,279-cell corpus
  (clause 1 **10 -> 3**), `runs` 4,332 -> 4,335, **0 `runs` lost, 0 cells into any silent
  class**. Four things this half earns:

  * **The per-value analysis the bullet above asked for is a NAME-BASED ALIAS CLOSURE
    with a WHITELIST accounting pass, and it is three-valued.** 0 = nothing writes this
    value, 1 = something does, 2 = it escapes through a form the closure does not model.
    Only 1 refuses; 2 keeps the rep-scoped decline, i.e. master's behaviour. **A false
    reject is the one outcome clause 2 rules out, so an unknown is never a refusal.**
    Name-based is a sound over-approximation here — merging two same-named bindings only
    ENLARGES the set — which is why it needs no scope stack, unlike D661's destination
    scan where merging produced a wrong answer.

  * **THE RULE IS NOT `assignable`'s COVARIANCE, AND THE GRID SAYS WHY.** A written-through
    covariant assignment whose every declared handle demands the SAME element storage is
    SOUND and runs today: the literal is built at the box and all the handles alias it, so
    the store is visible through every one. `d741_w4_same_union` and `d741_w5_no_narrow`
    are those programs. `Writable` therefore fires only where the value has to be stored
    TWO ways — a boxed union element and a plain struct row — which is co-extensive with
    "a converting copy is needed". Dropping that gate is array invariance in miniature: it
    buys two clause-1 traps and costs those two running cells, measured, and is refused
    (D824).

  * **`Readable`'s SEVEN delivery forms were seven `let`s.** A module GLOBAL is an eighth:
    its cell is `globalRefListSlot` and its initializer is lowered by the synthetic start
    function, so D773's own read-only witness at MODULE scope was `vl check` rc 0 and an
    invalid module while the function-scope original ran (D822). A const global's init is
    a wasm constexpr and cannot carry the copy loop, but a global whose init reads another
    global is non-constexpr by construction and always runs in the start function.

  * **THE CLAUSE-1 WITNESS D661B FILED IS CLOSED BY THIS HALF.** That row's `poison(a)` —
    a `Circle[]` passed to a `Shape[]` parameter whose body stores — was the live soundness
    violation no corpus cell reached, and it is now refused at the call. The row's own
    conclusion stands unchanged: for a written-through pair no lowering is correct, and the
    rule belongs in the checker. What it could not price was a rule that says so without
    also rejecting the read-only pass.


- **BOUNDS ARE ANNOTATIONS, AND THE CHECKER'S OWN COLUMN WAS REFUSED ON A MEASUREMENT**
  (2026-09-01, constraints phase 1). A `<T: Showable>` bound is stored as a `TypeRef` NODE
  index on two sparse side tables in `ast.vl`, not as a checker-recorded shape — because
  `silent-class-inventory` D976 measured that the column the checker writes for an inferred
  parameter shape does NOT survive into emit, and a bound must (the monomorphizer re-resolves
  each instance's member calls). An annotation survives, and three existing mechanisms then
  carry the feature for free: the module merge renames it through `modRwType`, its spelling
  tree writes back through `tsToName`, and `vl fmt` recovers it verbatim from source.
- **SATISFACTION IS THE EXISTING CALL RESOLUTION, ASKED AT BOUND-CHECK TIME** (2026-09-01).
  `{ m(A): R }` means "`x.m(a)` type-checks with result R" — field first, then a UFCS free
  function — so no second satisfaction judgment exists to disagree with the first. A method
  member is stored as the plain function type of the CALL (`(A) => R`, no receiver slot),
  which is why a zero-ary closure field satisfies a method bound by ordinary assignability
  and a UFCS-satisfied value does not satisfy a field bound: the directionality falls out of
  the representation instead of being enforced anywhere. Measured on the pre-change seed:
  `x.toString()` inside a generic body already checked, monomorphized and RAN — the emitter
  needed nothing, and the whole feature is the judgement the emitter never asked for.
- **A BOUND IS NOT A TYPE, AND THAT IS A DESIGN RULE WITH A SENTENCE** (2026-09-01). A bound
  alias registers in its own table, never in `cUserTypes`, so it has no arena entry to be
  spelled with in value position; `{ m(): R }` there would be an existential needing dynamic
  dispatch, which monomorphized VL has deliberately not built. Both annotation routes (the
  rendered-name arm and the spelling-tree arm) raise the identical refusal, because a design
  rule enforced on one route only is one a re-render walks around.
- **COHERENCE KEYS ON `tyToStr`, BECAUSE THE TYPE ARENA HAS NO IDENTITY TO KEY ON**
  (2026-09-01). The plan said "key by interned identity, never by rendered spelling". `addTy`
  appends unconditionally — `mkArrayTy(TY_I32)` twice gives two indices for one type, and the
  only dedupe is `annotNameMemo`, keyed on SPELLING and bypassed whenever a type-param
  environment is live. So the key is `tyToStr`, the CHECKER's renderer, whose contract is that
  `tyEq` is exactly its string equality and which folds nominality in. It is not `canon`, the
  emit-side spelling-dependent renderer that warning was about.
- **BOUNDS CHAIN BY SUBSUMPTION, NOT BY DEFERRAL** (2026-09-01). Every other generic-body
  constraint in the checker defers to the call-site pin; a bound must not. When the argument
  is another generic's type parameter there is no instantiation type, but the demand is still
  decidable — does the caller's bound grant what the callee's needs — and deferring instead
  left `describe<T: Showable>` relayed through an unbounded `twice<U>` as check-clean invalid
  wasm. Deciding it statically also puts the error on the declaration that is wrong.
- **A BOUND HAS NO `Self`; IT NAMES THE TYPE PARAMETER IN SCOPE** (2026-09-01). A bound's
  member types are ordinary annotations resolved where the bound is USED, with the function's
  type parameters live, so `{ eq(T): boolean }` already means "takes another one of me". The
  consequence is accepted rather than papered over: a bound ALIAS body resolves in its own
  scope, so an alias naming `T` fits `<T: …>` and not `<U: …>`, and the refusal hands over the
  inline spelling. F-bounded generic bound aliases are not in phase 1.

## An object literal a union arm's field-name set MATCHES is not thereby a union BOX — and the row it gets is gated on the OWNER, not on the literal

`collectAnonShapes` mints an anonymous struct row for every object literal that names no
declared struct. It skips one that `objVariantName` claims, on the reading "this literal
will be boxed into the union, and a row would make `emitObjLitNode`'s `structIndexOfObj` arm
build a bare struct where a `{tag, value}` box was expected". That reading is right about
the literals it was written for and wrong about the question it asks: `objVariantName` is a
GLOBAL scan over every declared variant with no context at all — its own header says so, and
`unionArmVariantForObj` exists because of it. It answers *some union arm somewhere in this
program has this field-name set*.

The gap that opens is a nested literal. In `const c = [{ r: { c2: 1 } }]` beside
`type Shape2 = Cir2 | i32`, the checker types the inner `{ c2: 1 }` as the inline shape
`{c2: i32}` — measured, not assumed — and nothing boxes it: it is the field value of an
anonymous literal whose field type IS that shape. Denied a row, it leaves
`anonFieldElemName` with `""` for the owner's code-15 field, so the OWNER declines too, and
a program whose only ref-array-shaped type is that list interns nothing at all. That is
silent-class-inventory D179 and D227.

**The rule taken: rescue the literal when its OWNER is itself getting an anonymous row, and
only when the owner's row would be MONOMORPHIC at that field.** Both halves are load-bearing
and the second was found by measurement, not by review.

- The owner test is what keeps a genuinely boxed literal on the box path. A literal the
  context adopts into a union (`const x: U = { r: { c2: 1 } }`) has an owner that
  `objVariantName` claims, or one that matches a declared row, and neither is an
  anonymous-row candidate.
- The monomorphism test is what keeps a LOUD REJECT from becoming a SILENT CLASS.
  `structIndexOfObj` matches a literal to a row by field-NAME set, so two owner literals
  that share a set and disagree about the nested layout cannot both have an anonymous row:
  the second matches the first's and builds a union box into a field typed as the first's
  nested struct. Without the test, census block D moved **16 cells from `loud emit reject`
  to `check-clean invalid wasm`**. That is the worst trade this project makes, and the
  reason the condition is not an optimisation.

**Why the fix is not in `collectS`.** The state D179 is missing really is the `sNames` row
`collectS` withholds from a union arm — declare a non-variant twin of the arm's layout, even
unused, and the whole program runs on master. But interning the arm as a standalone struct
re-shapes every union program (the arm's variant struct and the standalone struct are
distinct heap types by design, and `structIdxMatchesVariantIdx` exists to bridge them).
`collectAnonShapes` is the pass whose job is exactly *supply a shape when no declaration
does*, so that is where the missing row belongs.

**What is deliberately NOT done.** Making the polymorphic pair work needs
`structIndexOfObj` to discriminate a code-15 field by its TARGET rather than by the field
name alone. The bookkeeping is already there — `structIndexOfObjCtxGo` computes a `strict`
count beside its lenient one — and it is used only as an ambiguity tiebreak, deliberately,
to keep the lenient resolution byte-identical. Promoting it is a separate landing with its
own price. `docs/internals/silent-class-inventory.md` D391 is the pin that will say whether
it worked.


## Memory, runtime & object model

- **A `string` is UTF-8 BYTES behind a slice header, and the surface is
  BYTE-INDEXED.** `s[i]` is a byte (0–255, O(1)), `.length` is the byte count
  (O(1)), `slice(a, b)` takes byte offsets and returns an O(1) view; code points
  come from `for cp in s` (a UTF-8 decode with a variable stride), `s.cpAt(i)`
  (O(1), at a BYTE offset) and `s.cpLen()` (O(n), named so the cost is visible).
  `s.bytes()` is the storage as a `u8[]`, `s.isCharBoundary(i)` an O(1) bit test.
  This puts VL in the Go/Rust camp and was taken on measurement, not taste: a
  census of `compiler/*.vl` found **zero** true random-access indexed string
  reads (63% sequential, 29% length-relative, 8% constant), so code-point
  indexing's whole purpose — O(1) access by character — had no demand, while its
  price was an ASCII fast-path flag and an **O(n²) indexed-loop cliff** that
  triggered on exactly the input an English-speaking developer never tests.
  Validity is **Go-lean**: no boundary validation, slicing off a character
  boundary is legal, and a malformed sequence decodes leniently to U+FFFD —
  never a trap, never a rejection. `fromCodePoints` SUBSTITUTES U+FFFD for a
  value with no UTF-8 encoding (a lone surrogate, out of range, negative),
  because the storage cannot hold one and dropping it would change `.length`
  undetectably; `print` agrees with it rather than dropping. Measured: 40 M live
  ASCII characters cost 161 MB of backing before and 44.6 MB after (3.6×, 4× on
  the character payload alone). (`docs/guide/strings-design.md`, Stage 2c)
- **Allocation = WasmGC.** Heap values (closures, objects, arrays, strings) are
  WasmGC structs/arrays; linear memory is an opt-in escape hatch;
  escape-analysis stack allocation is a later optimization. Lean on binaryen's
  Heap2Local rather than hand-rolling SROA. (B1)
- **No second, self-managed object model — linear memory stays ONE scoped tier.**
  A linear-memory heap would unlock what WasmGC structurally forbids (SIMD over
  bytes, inline aggregates, slices-as-views, explicit free), but it costs a
  hand-written tracing collector plus a shadow stack on every call (wasm cannot
  scan a frame's locals for roots) and it retires the wasm validator as VL's
  memory-safety proof — today an emitter type confusion is a loud invalid module.
  A whole-program "own memory" mode would also double the corpus/fuzz/fixpoint
  surface for a mode almost nobody would pick. The scoped alternative (a `Buffer`
  escape for FFI/SIMD/bulk-I/O inside a GC program) gets most of the win for one
  type. The one argument that WOULD justify a real second backend is running on
  non-GC engines (WAMR/wazero/wasm2c) — a distribution call, not a perf one.
  (`docs/internals/memory-gc-design.md`)
- **The collector is a RUNTIME knob, never language surface.** `vl run` defaults to
  the engine's tracing collector; `$VL_GC` (`auto|tracing|refcount|none`) overrides
  it. Deferred reference counting — the previous default — is ~21× slower on
  allocation-heavy code and, because it cannot reclaim cycles, holds ~175× the
  memory on cyclic garbage. An env var rather than a `--gc` flag because the engine
  is built before any guest code runs and all `vl` flag parsing lives in the guest.
  Nothing in a `.vl` file may depend on the choice: a module shipped to a browser
  gets whatever that engine provides. The compiler's own null collector (one-shot
  batch work) stays internal and is NOT routed through the knob.
- **Keep binaryen (unlike antlr4).** Pure WASM/JS, does the IR/validate/optimize
  heavy lifting, and is a library binding that does _not_ block self-hosting —
  it stays for the TS compiler. (Track B)
- **Struct heap-type identity is STRUCTURAL: structural twins share one WasmGC
  heap type.** VL is structurally typed — `type A = {v:i32}` and `type B = {v:i32}`
  are THE SAME type (the checker accepts a `B` wherever an `A` is expected), so they
  MUST share one heap type. Minting a distinct heap type per declared alias was an
  active soundness bug: a `B`-value flowing into an `A`-typed slot emitted an
  un-instantiable module (`expected (ref $A), found (ref $B)` — the checker accepted
  it, codegen produced invalid wasm). The emitter now dedups struct slots by the
  cycle-terminating canonical key `repCanonKey` (full traversal; de Bruijn back-edge
  tokens make recursive twins `type L1={n:L1|null}` / `type L2={n:L2|null}` share a
  key), guarded by an emitter field-CODE match so a key collision whose emitted
  LAYOUT would differ (an atom-backed litunion field vs a string one) never merges.
  Each alias keeps its own `sNames` entry and field table (so diagnostics still read
  the declared name); only `sHeapIdx` collapses — twins get one heap-type index
  (`sTwin`, built in `buildStructTwins`). Non-twins (`{f:i32}` vs `{f:i64}`) keep
  distinct keys and slots. This SUPERSEDES the earlier nominal-slot framing: nominal
  names are a WasmGC implementation detail (heap types need names), not semantics.
  A14 forward-compat: a future nominal/opaque type opts OUT of dedup by injecting
  its nominal identity into `repCanonKey`, giving it a unique key and a private heap
  type — no other change needed. (structural slot dedup, roadmap Next#1)
  The same dedup extends to the REF-LIST table: a ref-list's (backing, wrapper) pair
  is structurally uniform across element kinds, so two slots resolving to the same
  element heap (`A[]` and `B[]` after struct dedup) emit identical pairs and share
  one wrapper (`rlTwin` → shared `rlBackIdx`/`rlWrapIdx`) — fixing the same
  invalid-wasm crossing one list level up (a `B[]` passed where an `A[]` is
  expected). The map-array element and any unresolved element stay unique (the
  map-struct index interlock); non-twins (`i32[]` vs `i64[]`) keep distinct element
  heaps and wrappers. (structural slot dedup, ref-list layer)
  The dedup is CANONICAL, not just nominal: an INLINE-SHAPE slot (a `{v:i32}` field
  shape `collectNestedFieldShapes` interned BEFORE its declared twin existed) keys
  into `buildStructTwins` by resolving its spelling through the checker's name
  grammar to the same `repCanonKey` vocabulary, and a shape SPELLING with no
  `sNames` entry of its own (deduped onto the declared struct at intern time)
  resolves through the layout-guarded structural bridge (`structIndexOfTypeName`,
  tightened with the field-TYPE compat check) at the ref-array classification /
  element-heap / twin-sig sites. Lookup follows the same nominal-fast-path,
  canonical-fallback pattern: `rlSlotByName` falls back to the slot whose element
  is a canonical-key + field-code layout twin (`repStructSlotsTwin`) with matching
  `| null` niche parity. The bridge is GATED on a DECLARED twin (`nameIsStructDecl`):
  a spelling matching only an anonymous-literal shape keeps its loud reject — the
  union-arm narrow machinery it would newly enter still mis-lowers an inferred
  closure-call binding's read (roadmap repOf item (d)). (structural slot dedup,
  ref-list canonical layer)
  The MAP-VALUE table joins the same discipline. A map-value slot's 7-field map
  struct varies ONLY in its vals-list wrapper, so slots whose VALUE types are
  layout twins share one `mvMapTypeIdx` (`mvTwin` — `repMapValSlotsTwin`: the
  canonical value key via `repNameCanonKey`, guarded per value KIND by the layer
  that owns the rep — `repStructSlotsTwin` for struct values, `rlSlotsLayoutTwin`
  for list/nested-map values, kind identity for the singleton scalar/string/box/
  closure vals lists). The vals ref-list's map-element sig keys on the canonical
  mv representative (`mvCanonRepOf`), so a twin propagates through nested maps
  and lists of maps; and the union-box tag (`mapSlotTag`) + arm-slot guard
  (`unionHasMapArmSlot`) canonicalize through the SAME representative — keying
  the tag on the nominal slot would make a twin-spelled `is {[string]: {v:i32}}`
  silently miss its `{[string]: A}` carrier once the heaps merged, so tag
  identity and heap identity move together. (structural slot dedup, map-value
  layer)
  **The map-value layer's canonical key is now a FALL-THROUGH, not a precondition,
  and the representative is a CLOSURE rather than a first hit** (D300, 2026-08-28).
  A map struct's identity is exactly `(keys wrapper, vals wrapper)` — its other five
  fields are constant — so ref-list slot EQUALITY already proves two slots are one
  heap type, whatever the checker says about their value TYPES. `{r: null}` (what an
  un-annotated `Map()` infers at its first key write) and a declared `{r: i32|null}`
  resolve one struct row and one vals slot and are two different `repCanonId`s, so the
  key-first order minted two identical map structs and the store between them was
  invalid wasm. The layout question is therefore asked FIRST for the two rl-backed
  kinds, and the key survives as the fall-through for pairs the layout cannot see
  (D48's arm twins, whose ref-list rows are distinct). **The consequence worth
  recording is the one that is not local:** a layout rung is sound but NOT transitive
  — the union of two equivalences is not one — and `mvCanonRepOf` returned the FIRST
  twin on a stated premise of transitivity while `mAssignTypeIndices`'s mint already
  CHAINED. Any layout-only rung therefore makes those two disagree, which trips the
  "twins resolved different vals wrappers" interlock; and because `emitFail` does not
  halt, the interlock's -1 becomes `typeOffset` and the emit walks off a parallel
  table — a compiler trap rather than a diagnostic. **The rule: a chokepoint that
  picks a representative must compute the transitive closure whenever the underlying
  relation is a union of guards, not the first hit.** Chaining is inert until such a
  rung exists (byte-identical on 1,945 of 1,945 corpus modules alone) and is the
  difference between a landing and a dead compiler once one does.
  **And the layout question is about the WRAPPER, not the slot** (D301, 2026-08-28).
  Slot equality is the tightest evidence of one wrapper and it is not the widest true
  statement of it: two DECLARED names of one layout intern two `rlInternName` rows, which
  `rlTwin` then gives one wrapper because a struct element's signature is
  `"h:" + sHeapIdx[rlElemStructRow(row)]`. Slot equality is blind to exactly that, so
  `type Circle` beside `type CircleN` of the same shape kept two map structs over one vals
  wrapper and the nested store between them was invalid wasm. The rung asks
  `repStructSlotsTwin` over the two rows' element struct rows — the `sTwin` equivalence the
  ref-list signature is itself built from. **It is asked as that LEG and not through
  `rlSlotsLayoutTwin`**, whose cross-table arm merges a registered arm with a plain-struct
  row and carries `mvValStructIdxOf`/`mvValVariantOf` with it: measured twice now, at D300
  and again here, that costs 21 census cells of `bare null needs a struct-typed context`
  and closes nothing the leg does not. **The constraint that picks the spelling is TIMING**:
  `rlSig`'s own map-element arm calls `mvCanonRepOf` while `rlTwin` is being built and
  before `rlWrapIdx` exists, so the wrapper cannot be read from the table that holds it —
  only from the pairwise, memoized relation the table's signature is derived from. A
  chokepoint consulted DURING the construction of the table it describes must be answerable
  from that table's inputs, never from the table.
  VARIANT structs complete the slot layers, deduping by the same two layers
  (`buildVariantTwins` → `uVarTwin`/`uVarHeap`: the canonical variant key via
  `repNameCanonKey` + a per-field storage guard whose ref-bearing field codes
  delegate to their layer's twin equivalence — ref-list fields to
  `rlSlotsLayoutTwin`, nested-struct fields to `repStructSlotsTwin`, map fields
  to the canonical mv representative); the arithmetic `uVarIdx + vi` heap
  identity is retired for the table (`uVarIdx` deleted). Twin keys are computed
  ONCE per slot (`buildStructTwins` discipline) — the compiler's own unions
  carry hundreds of variants, so a per-pair key recomputation is the audit's
  hot-path anti-pattern. This closed a REAL trap: a `Cat` boxed into
  `Kot | Bird` (a structural-twin arm) already PASSED the tag compare
  (`variantSig` keys on field names, so twins share a tag by construction) but
  the narrowed read's cast targeted the twin's distinct heap type — with one
  shared heap type, tag and cast agree. The SAME variant name declared in two
  unions (each push minted its own heap type) is the degenerate twin and now
  emits once. The variant⇄struct-TABLE seam (a declared struct twin in a
  variant-arm position) stays nominal — chartered as repOf item (e), wanting
  the #911 declared-twin gate at the variant resolvers. **That gate is now taken
  at two resolvers and the pair is worth reading together, because it is ONE
  predicate in two spellings.** `rlElemStructRow` declines for an element NAME the
  variant table claims and the struct table does not (D32); `shapeNominalOfTy`
  asks the variant table by ARENA IDENTITY (`variantRowOfTy`) where it already
  asked the struct table that way (D33). Same rule, one keyed on the name and one
  on the arena index, each placed AFTER its struct-table twin so struct-row
  identity still wins where it exists. **What both are for is the same thing: a
  NOMINAL question must not be settled by whichever STRUCTURAL rung happens to
  fire first.** A layout twin is claimed by every structural rung by construction,
  so rung ORDER was the whole answer in both — which is why neither fix is a
  tightening of the structural matcher. No tightening could work: `repRowOfTyStruct`
  and the field-set scans cannot tell `Circle` from `Dot`, and that is the point of
  keeping the seam nominal rather than a shortcoming of theirs. The declines this
  buys are exactly the ones the `tySame`-membership refusal below asks for.
  **The residue is where NEITHER table owns the name**: an ANONYMOUS shape has no
  declaration identity, both arena rungs correctly decline, and the structural
  scans decide it with nothing to break the tie (D36). That is a real remaining
  cell of the class and it is not reachable by a third rung of this shape — it
  needs the seam to answer a question about a value with no nominal identity at
  all.
  **HALF OF THAT RESIDUE IS NOW CLOSED, AND SPLITTING IT IS THE POINT** (D280 then
  D282, 2026-08-28). The paragraph above is about RESOLVERS — *which nominal name
  does this value take* — and that half is still open and still correctly declined
  (D209 is its filed witness). The other half is not a resolver question at all: it is
  *do the two nominal answers land on ONE WasmGC heap type*, and by the very rule the
  struct layer is built on they must, because the checker accepts either wherever the
  other is expected. `uVarSTwin` (`variantStructHeapTwinAt`) is that merge across the
  variant⇄struct seam; its first key, `repSlotOfTy(uVarTyIx[vi])`, sees DECLARED rows
  only, so it was extended with the arena-keyed whole-table scan `repRowOfTyStruct`,
  which reaches an interned `#anonN` row through `slotCanonId`'s `sTyIx` rung. Both
  resolvers above are UNTOUCHED and stay nominal; what changes is that when they
  disagree, the disagreement no longer produces two heap types. Measured over
  `tests/cases`: the declared key answers 73 times, the anonymous one 304. **The
  charter's sentence — "the variant⇄struct-TABLE seam stays nominal" — was read for a
  year as licensing two HEAP TYPES, and those are different claims.**
  **AND THERE IS A THIRD PLACE FOR THE SAME RULE THAT IS NOT A RESOLVER RUNG AT ALL:
  a layer whose ONLY view of the value is a RENDER.** The map-VALUE layer holds
  `tyToEmitName(t.mVal)`, and that render spells a declared arm `{r:i32}` — the same
  characters an anonymous shape produces — so BOTH gates above are unreachable there:
  the name one because the name is gone, and the arena one because re-resolving the
  render mints a fresh index rather than recovering the declaration's (D34, measured:
  `vTy=61` where the declaration is `40`). **The rule for such a layer is to CARRY the
  nominal channel from the node that still has it, not to add a structural tiebreak** —
  the annotation node the collect walk already holds. It enters as an ARM-ONLY hint
  used after the mint is decided, which is what keeps it compatible with D-MAPNODETY's
  refusal to front the slot FIND with a better answer. The direction generalises: where
  a nominal question reaches a layer that only has a render, the fix is upstream of the
  layer, and adding a rung to the layer is guaranteed not to work — a render of `Circle`
  and a render of `{r:i32}` are the same string.
  **Slot IDENTITY is now closed at that seam too, and the arm is its THIRD component**
  (D48, 2026-08-26). The pair (key rep, value type) left an arm-valued and a twin-struct-
  valued map sharing ONE mv slot, because both components read the render. The arm is
  carried the way this entry prescribes — from the node that still has it — but as a
  TRI-STATE, and the third state is the whole of why a two-value parity was not enough:
  `MV_ARM_NOHINT` (no type to ask; matches any slot, which is what every un-hinted entry
  point passes and why none of them moved), `-1` (a RESOLVED type that is not an arm; the
  state that stops the twin's mint from finding the arm's slot), and the arm's own row. A
  hint FILTERS the two find rungs and never creates a match, so it sits under a MINT without
  violating D-MAPNODETY: the mint runs in strictly more cases and is skipped in none.
  **The dedup gate below it was arm-gated for this day and its test was wrong in one
  direction.** Its zero is no longer a reachability zero: over a 1,070-cell grid the kind-1
  arm's cross rung (one arm, one struct → refuse) fires 22 times and the both-arms rung 10,
  while the corpus's 46 pre-existing entries over 25 files take the STRUCT rung on every one
  (re-measured on the post-#1951 base, which moved variant index resolution; the grid
  counters are identical call for call, and the two live rungs now have a corpus witness in
  `tests/cases/maps/arm-valued-map-beside-layout-twin.vl`). And the branch shipped as an IDENTITY test where the question is a HEAP one: two arms
  of two DIFFERENT unions over one field set are `uVarTwin` layout twins and therefore one
  variant heap, so their maps DO share a map struct — refusing that merge cost 2 grid cells
  `runs` → check-clean invalid wasm. It now asks `repVariantSlotsTwin`, the variant layer's
  pairwise twin relation (the `repStructSlotsTwin` sibling); cross-table is a flat 0 because
  a variant struct and a struct row are never one heap. The `both arms, NOT heap twins` rung
  reads 0 on grid, corpus and a hand attempt — reported, not deleted, on the standing rule
  that an unreached rung is not a wrong one.
  (structural slot dedup, variant layer)
- **The shape-INTERN table keys on field CODES (layout), not `repCanonKey`
  (structure); the two are deliberately separate layers.** `annShapeIndexOf` is a
  LAYOUT table — two structurally-identical checker types can lower to DIFFERENT
  layouts (an atom-backed litunion field `type K="a"|"b"` vs an inline `"a"|"b"`
  string field), and the emitter must keep them apart. `repCanonKey` equates them,
  so it is confined to the heap-dedup layer, where `structFieldCodesEq` re-imposes
  the layout guard before any merge. "Recursive structural interning" is this
  two-layer split (field-code intern + structural heap dedup, with the per-field
  recursive element-text comparison in `annShapeIndexOf` separating nested reps) —
  NOT a single `repCanonKey`-keyed intern, which would over-merge distinct layouts.
  Verified complete: `{f:i32}`/`{f:i64}`, deep same-shape, union-of-shape, and
  generic `Pair<i32,i64>`/`Pair<i32,i32>` all stay distinct and lower correctly. The
  remaining rep-fuzz families are genuine MISSING reps in composition (typed-value
  maps, 2-D arrays, nullable-list-in-field, struct-through-list, composite closure
  results), not intern losses — see `docs/internals/rep-fuzz-findings.md`.
  (structural interning, roadmap Next#1)
- **No `this` keyword.** A method is a function whose first parameter is `self`
  (Rust-style); `o.f(a)` is sugar for `f(o, a)` (UFCS). `self` is an _explicit,
  optional_ marker: first param `self` → a method reachable as `o.f()`; no
  `self` → a plain function, not reachable through an instance (no namespace
  pollution, crisp errors, the method-vs-static split for free). `o.f()`
  resolution: a callable _field_ wins (container/data, no receiver), else a free
  `self`-function, else error. Receiver is any expression (incl. literals).
  Mutation is free (objects are refs); "may a method mutate its receiver?" is an
  A9 variance question, not a receiver one. (B14)
- **One lambda form: `function(params) body`.** No bare `(params) body` (arrow
  ambiguity); an explicit `=>` arrow is deprioritized (purely cosmetic — no
  `this` to rebind). Declaration-vs-value: a top-level `function` monomorphizes
  per call site (polymorphic across shapes); a `let`-bound lambda is a
  single-signature closure value (monomorphic, pinned by use). (B15)
- **Only `!`, not `not`.** Logical operators are symbolic (`&&`/`||`/`!=`); the
  lone word operator was dropped. (B10)
- **One binding per name per scope** (no ad-hoc overloading for now); nested
  shadowing is allowed. (B16)
- **Operator / call / index dispatch via well-known methods**, resolved
  statically (no runtime `Proxy`): `"+"`, `"()"`, `"[]"`/`"[]="` are typed
  methods in a shape's contract. (B13)
- **Index operators are FREE functions dispatched by receiver type, and are the
  one place ad-hoc overloading is allowed.** `function "[]"(self: T, i: I)` beats
  a closure FIELD because it is a direct call rather than an indirect one through
  a per-value allocation. Several may share an operator — one per receiver — which
  the general no-overloading rule above forbids for named functions; the exception
  is bounded by there being no name to overload (a bracket names nothing, so the
  receiver type is the only possible key) and it is what lets two nominal newtypes
  over one structure carry different operators. The `self` annotation is required:
  it IS the dispatch key. (B14)
- **Size members follow the uniform-access principle.** `length` is a contract
  member via property syntax, dispatched to a native lowering (not a structural
  field — that broke index-sig subtyping). Property syntax (no parens) is
  reserved for O(1) members (`length`/`count`); computing ops
  (`push`/`map`/`slice`) are methods (parens). `length` is read-only; sparse
  collections use distinct `count`/`extent`, never an overloaded
  `length`. (B6)
- **No public `.capacity`.** Capacity exposes the growth strategy — a leaky
  detail scripting languages (Python/JS/Ruby/Lua) hide and only systems
  languages surface; VL is scripting-feel. The `cap` field stays internal (push
  needs it). Removing it also lets build-loop fusion pick any representation
  without an observable contract. (B6)
- **Build-loop fusion: pre-sized indexed fill, not per-element push.**
  A loop building a fresh local list by one push per iteration — `for i in A to B
  [step S] { a.push(e) }` or the counter-`while` `while i <cmp> N { a.push(e);
  i = i ± C }` — lowers to one pre-sized backing + an in-range fill loop. A
  frontier `array.set` at the moving `len` carries a bounds check the engine
  can't elide (~3.8x a sequential in-range write it can); fusion turns the former
  into the latter. A counter-while IS a for-range (`i < N` ⇔ `i ≤ N-1` for
  integers), so both feed one (from, inclusive-to, const-step) descriptor → one
  fill core, rather than per-shape matchers. Sound because the result is
  bit-identical to the push build and the guards forbid any mid-build observation
  (fresh array-literal local, untouched until the loop; body exactly one push;
  `e`/bounds free of `a`); anything unproven falls back to push. The list is
  rebound at the loop (the tiny initial backing is discarded) so the recognizer
  can sit at the loop and tolerate an intervening counter declaration.
  Field-target lists, multi-loop builds, and `for…in` are not yet covered. (B6b)
- **String-accumulation fusion: buffer-and-materialize, not per-`+` concat.**
  > **REGRESSED — THIS DOES NOT SHIP. Read this note before relying on the entry
  > below.** B7b was implemented in `compiler/toWasm.ts` (#168) and **deleted with the
  > TS core (#466); it was never ported to the self-hosted `compiler/*.vl`.** There is
  > no recognizer in the VL compiler — `grep -rn "accumulat" compiler/*.vl` finds only
  > unrelated comments — and `s = s + piece` in a loop measures **quadratic** today
  > (0.31 s / 1.44 s / 9.47 s at 20k / 40k / 80k appends). The `tests/cases/strings/
  > accum-*.vl` fixtures still pass because they assert only the RESULT, which
  > per-append concat also produces — **they are blind to the cost class they were
  > written to pin.** Until it is re-ported, build strings by filling an `i32[]` and
  > calling `fromCodePoints` once (`compiler/format.vl`); that is 28 ms vs 12,475 ms on
  > a 40,000-piece join. Tracked as the live half of `strings-design.md` OQ-2.
  >
  > *A DECISIONS entry records what was decided and shipped; nothing sweeps it when a
  > later refactor deletes the implementation. A shipped-then-deleted feature reads as
  > still-shipped forever. Re-derive before citing one as precedent.*
  >
  > The original entry follows, describing the TS implementation.
  `let s = ""` built purely by `s = s + e` appends in a loop (any number, incl.
  conditional and multi-piece `+`-chains) lowers to a growable char buffer with
  amortized appends, materialized to one new immutable string after the loop —
  O(n²)→O(n). This is the sanctioned in-place/builder optimization of
  `docs/guide/strings-design.md` (§Mutability: in-place when the value is provably
  unaliased/dead; OQ-A's perf half), and it does NOT change string storage (still
  `array i32` of code points — frozen until self-hosting), only how a recognized
  accumulation loop lowers. Sound because the accumulator is fresh, never read
  mid-loop, and only appended (so its old value is dead), and the result is a new
  string identical to the concat build; the guards (statement-position appends
  reconciled against every `name` occurrence, pieces free of the accumulator,
  freshness) fall back to per-`+` concat on anything unproven. The piece is
  lowered with a string desired type so a value-returning call isn't dropped (the
  normal assignment sets that; the early interception bypasses it). A builder
  type + interpolation sugar remain OQ-A's open ergonomic halves. (B7b)
- **String methods follow JS semantics.** `slice(start, end)` is the half-open
  `[start, end)` range with JS clamping (negative counts from the end, bounds
  clamp to `[0, len]`, `start >= end` → empty); `indexOf("")` returns 0. Chosen
  for least-surprise over Python-style slicing; method types live in
  defaultScope (no typecheck changes), toWasm lowers each by name. (A7)
- **Maps are a separate hash type, not every-object-as-table.** Three
  representations under one `[]`/`.field` surface: static-string-key structs
  (fastest), `i32`-key arrays (native, contiguous), arbitrary-key maps (hashed,
  heap) — you pay hashing only when you use a `Map`. (B6a)
- **`Map`/`Set` are ordered open-addressing hash maps (Python-dict shape).** A
  `{keys,vals,live,index,
  count,size}` struct: insertion-ordered entry
  arrays + a hash index → entry; iteration walks entries in order
  (deterministic, for multiplayer/replay). **Delete tombstones + compacts**
  (rebuild from live entries, index sized to the live count, not unconditionally
  doubled) — the first cut doubled on every delete and OOM-trapped under
  add/delete churn. Spelled with the index-sig syntax (`{[string]:V}` map,
  `{[T]:boolean}` set). (B6a)
- **An i32 KEY re-types one field, it does not fork the map.** `{[i32]: V}` is the
  same 7-field rep with `keys` re-typed to the i32 list, a different hash (an
  integer mix, not FNV over code points) and an `i32.eq` compare — everything else,
  including the ordered entry arrays, the tombstones and `__map_resize__`, is
  literally shared. Chosen over hashing i32 keys as formatted strings (the ask is
  fourCC tables — formatting them is the thing the ask exists to avoid) and over an
  identity hash (fourCCs share their high bytes, so an identity hash clusters an
  open-addressing table into a linear scan). Insertion-ordered iteration is the
  contract for BOTH keys — replay depends on it, so no scheme that reorders on
  rehash is admissible. (B6a)
- **A map-value SLOT is keyed on the (KEY, VALUE) PAIR, and the slot is what the
  emitter threads.** The map struct's only key-varying field is field 0 (`keys`:
  the string-ref list wrapper, or the i32 list wrapper), so two slots agreeing on
  the value and differing on the key are two LAYOUTS — `mvKeyI32` is the second
  identity column and `repMapValSlotsTwin` refuses to merge across it. Chosen over
  the alternative of threading the key as a second parameter beside every shape:
  downstream of the intern the slot is SELF-DESCRIBING, one integer answering both
  halves, so `mapTypeIdxOf`, the `cm*` emit accessors and the typed per-slot
  scratch frames took no new argument. A value on the shared i32 `vals` list interns
  no slot on either key, so "mono" is still a SENTINEL — but a PAIR of them
  (`-1` string-keyed, `-4` i32-keyed), named once at `mapMonoShapeOfKey`, because a
  resolver landing on mono must still say which of the two structs it means. (B6b)
- **Every boundary that can CONSTRUCT a map is seeded with the shape it must
  build, and the boundaries are enumerated, not discovered.** `Map()` builds
  whatever `pendingMapSlot` says; unseeded it builds the MONO struct, which is
  correct for exactly the values that have no struct of their own (`i32`,
  `boolean`, a literal-union atom) and invalid wasm — `vl check` clean — for every
  other. Three boundaries were taught the seed one bug at a time (a let / return /
  global init, then struct + variant fields, then the map VALUE in #1286, then the
  ARRAY ELEMENT here), and each time the tell was the same: the MONO values worked.
  So the rule is now stated positively — a position that can hold a map is a
  position that must name its shape — and the answer per position lives in ONE
  named function (`letMapShapeOf`, `mvInnerMapShape`, `rlElemMapShape`) rather than
  at the seed site, so a second consumer of the same position cannot re-derive it
  differently. (B6b)
- **A typed-value map has ONE struct heap type per value type, resolved
  position-independently.** `{[string]:f32}` mints its own `mvMapTypeIdx` struct
  (its `vals` field differs from the mono `$mStructIdx`); a map in COMPOSITION (a
  list element, a nested-map value, a struct field) resolves that SAME struct — the
  ref-list element heap picks `mvMapTypeIdx`, not the mono struct, and a
  composition read binds the yielded map with its typed mv slot. Distinct value
  types keep distinct layouts (no over-merge); an atom/mono value keeps the shared
  mono struct. (B6a)
- **Generics infer through collections, not just scalars.** A generic element
  type is pinned from the argument's element type (the checker unifies
  index-signature _value_ types, not just keys), so `first<T>(xs: T[])` resolves
  `T` per call. Read-side only for now — building a new array of an inferred
  element type (`map`/`filter`) waits on growable lists (B6 tier-2). (A10)
- **Generic type aliases are substitution, not a new nominal kind.**
  `type Box<T>` stores the body plus its param holes; applying `Box<i32>` clones
  the body, mapping each hole directly to its argument — so a concrete
  application is a concrete object and `Box<T>` in a generic fn keeps `T` linked
  to the function's hole (correlation flows through the existing
  monomorphization). (A10)
- **Growable `T[]` ships as compiler-emitted helpers, not a `.vl` std module
  (yet).** The design's end-state is to write the collection in `.vl` over an
  intrinsic floor (ports for free under self-hosting), but that needs a module
  system VL doesn't have. So v1 lowers `T[]` to a `{backing,len,cap}` WasmGC
  struct with lazily-emitted **per-element-wasm-type helpers** (in the self-hosted
  `compiler/wasmEmit.vl`; this was `compiler/builtins/lists.ts` in the retired TS
  compiler) — exactly how strings already work (`__string_eq__`). Migrate to
  `.vl`-std when modules land. The _type_
  representation stays `{[i32]:T}` (so generic inference/equality/`.length` are
  untouched — it is purely a codegen change); `string` is excluded from the
  struct rep via `isListType = arrayElementType(t) && t.name===undefined`. (B6)
- **Sequence indexing traps; `.get`/map-lookup return `T|null`.**
  `a[i]`/`a[i]=v` trap on out-of-bounds (a bug, bound = `len`), matching the
  raw-array MVP; the safe checked accessor is `.get(i): T|null`, and `pop()` on
  empty is `T|null` (normal absence). A sentinel-encoded scalar nullable
  (`boolean|null`) builds its `null` from the i32 sentinel, not `ref.null`. (B6,
  §VL.6)
- **Single-instruction numeric operations are compiler intrinsics, spelled as
  bare free functions, and shadowable.** A std function needs a body; these have
  only an opcode, so `std/` cannot hold them. Bare over dunder because the rule
  the builtin surface actually follows is *raw-floor machinery is dunder, safe
  total functions are bare* (`print`/`fromCodePoint` vs
  `__trap__`/`__store_i32__`; `toString` was in that list until 2026-09-01, when
  it left the builtin surface entirely for `std:fmt` — see the entry below). Shadowable because `min`/`max`/`abs` are the names
  programs most often define themselves, and an intrinsic that captured such a
  call would silently kill the user's function. Width comes from the operands
  under the binary operators' rule, not from a second declaration — VL has no
  overload resolution and gains none.
- **Unsigned integer ops are operations, not a `u32` type.** `divU`/`ltU` read
  the same bit pattern under a different interpretation; VL's `i32` is signed
  (`/` is `div_s`) and already exposed one unsigned instruction as an operator
  (`>>>`). A `u32` would touch the type arena, every rep table, every widening
  rule and every emitter kind code to express something the operand need not
  carry.
- **No transcendentals, ever, as a language or std primitive.** No wasm opcode
  computes `sin`/`pow`/`exp`, so any implementation is a library whose last bit
  is a policy choice. A program that must match another implementation exactly
  has to own that choice; shipping one would give it a trap to avoid rather than
  work to save. (`docs/internals/numeric-intrinsics.md`)

- **A classifier's "no answer" sentinel is NOT neutral when the caller has a
  default — so a DECLINE LIST is a set of testable claims, and each entry must be
  measured by lifting it ALONE.** `fnAssignKindGuard` returned `null` for five
  cell kinds under a header that called `null` "no answer, leave every classifier
  exactly as it was". Its caller's default was `i32`, so every decline was really
  a claim that an `i32` result valtype beats the named one — and under a body
  pushing a ref that is check-clean invalid wasm, not a no-op. Four of the five
  recorded reasons were false once each was lifted on its own and the grid
  re-graded; the fifth named a real mechanism but a false premise about it. The
  transferable rule: state a decline against the DEFAULT the caller will fall back
  to, never against "whatever the code did before", and measure entries one at a
  time — a list measured as a block cannot tell you which entry is carrying it.
  The corollary is that a decline is worth keeping only when it is LOUDER than the
  default: `nulreflist` and `variant` are NOT declined precisely because naming
  them reaches `fbValtype`'s out-of-bounds guard and a loud reject. (#1938, D27 /
  D28 / D29; `docs/internals/silent-class-inventory.md`)

## A `$fnsig` KEY must render the row whose HEAP TYPE the functype carries — and the token CHAR is a second contract

`$fnsig` interning gives two closures one functype exactly when their keys match. The keys
are minted by five producers (`cloParamTok`, `cloRetKeySuffix`, `annParamKind`,
`paramTokOfTy`, `retTokOfTy`) and the BYTES are streamed from the key's representative
through `fbValtype`, which reads `sHeapIdx[slot]` / `uVarHeap[slot]`. So the KEY and the
BYTES are two functions of the same slot, and the ruling is: **the key renders the row the
byte writer will land on, never the row the resolver happened to name.**

`repSigSlotTokOfKind` has always done this for a STRUCT slot (`repStructSlotRep`, the
`sTwin`-canonical representative, computed timing-independently so the intern-time and
emit-time renders agree). It did NOT for a VARIANT slot, and that asymmetry is
silent-class-inventory **D199**: two layout-twin arms share one `uVarHeap` heap type and
keyed `V0;>V0;` and `V1;>V1;`. Two structurally identical functypes at two indices of one rec
group are DISTINCT types in WasmGC, so a closure value crossing between them validates and
traps at run time — `indirect call type mismatch`, after the program has already printed.
`repVariantSlotRep` closes it, and `repSigVariantTok` is the one place the digit is minted so
the five producers cannot drift apart again.

### The token CHAR is NOT free to change, so cross-table identity is the POOL's question

The obvious next step is to fold across the two tables: a union arm whose layout a DECLARED
struct also claims already shares that struct's heap type (D280), so rendering the arm's slot
as `s<row>;` would make the two sides key one functype and close 12 live `trap_loads` cells.

**It was built and refused, on a measurement.** `sigParamKindAt` reports the token CHARACTER,
and `emitCallRef` reads that character to decide how to coerce an argument: `"variant"`
selects the arm coercion (unbox the box, build the literal as the arm), `"struct"` selects
none. An arm parameter spelled `s…;` therefore stops being an arm parameter at the coercion
ladder, and six programs that D269's landing makes RUN go check-clean invalid wasm. Buying 12
silent cells with 6 new ones is not a trade this family takes.

The rule the refusal establishes: **a slot token's CHARACTER is a coercion contract, not
merely a namespace tag.** Two kinds may share a heap type and still need distinct tokens,
because a consumer reads the token to decide what to do with the VALUE, not only where the
type lives. Both halves of the trade are kept as a named set
(`scripts/silent-sweep/census/d351-crossfold-price.json`) so the next candidate re-grades them
instead of re-discovering them.

### D351's close: the pool folds on RENDERED BYTES, and the row's own prescription named the wrong MOMENT

The paragraph above ends by saying the fold belongs to the `$fnsig` POOL, and that is right.
The D351 row then said where: *"dedup at the INTERN level — `internCloSigKey` sharing one slot
between two keys whose rendered functypes are byte-identical."* **That cannot be built, and
the reason is the whole shape of the fix.** At intern time there are no rendered functypes:
`collectCloSigs` runs before `mAssignTypeIndices`, which is where `sHeapIdx` / `uVarHeap` /
`rlWrapIdx` are minted, and the entire content of the question "are these two functypes
byte-identical" is which heap INDEX each slot resolves to. An intern-time comparison would
have to re-derive the whole index assignment, which is the thing whose answer it needs.

So the fold happens where the bytes exist: **as `emitTypeSection` writes the pool.** Each
entry is rendered exactly once (`emitCloSigFunctype`), straight into the section buffer, and
compared against the entries already written (`wRangeEq` over ranges of that same buffer —
no scratch copy, no second render). The smallest byte-identical position goes in `cloSigTwin`,
and `cloSigTypeIdxAt` becomes the one place a pool position turns into a type index.

Three consequences worth stating, because each is a choice:

- **The emission does not collapse, only the references.** Skipping a twin's bytes would mean
  skipping its ALLOCATION in `mAssignTypeIndices`, and the pool's size would then depend on
  the typed-map value structs that pass mints AFTER the pool — circular. A duplicate functype
  nobody references costs a handful of bytes and keeps the type section byte-identical, which
  is also what makes the corpus diff for this landing legible: nine modules changed, every
  one of them a functype index and nothing else, all nine the same SIZE as before.
- **This is the general rule the per-table folds were approximating.** `repStructSlotRep`,
  `repVariantSlotRep` and `rlTwin` each canonicalise ONE table's slots inside the key. Byte
  identity is the union of all of them plus the cross-table merges, in one comparison — and
  read off the disassembly, NOT ONE of the seven pre-existing corpus modules it moves is the
  arm⇄struct case D351 names. Six merge functypes over a LIST WRAPPER (`{(ref array), i32,
  i32}` — two `>rN;` keys whose wrappers `rlTwin` had already collapsed) and the seventh over
  the 7-field MAP struct. Each of those is a table with its own key-level fold, and none of
  those folds reaches across to the others.
- **All four consumers move together or the landing is worse than nothing.** Route the
  declaration and not the call (or the reverse) and twelve `hof2_decl`/`hofret_decl` programs
  that run on every compiler start trapping. Under the first of those the grid's histogram is
  IDENTICAL to the base while 24 cells have moved, so only a cell-matched grade sees it. Those
  12 are `scripts/silent-sweep/census/d351-halfroute-price.json`.

One consumer, `.map`/`.filter`'s closure-VALUE callback, scores **zero on every population the
repo had** — the 210-cell grid never reaches it, the distilled corpus never reaches it, and
over the whole `tests/cases` tree its answer changed on nothing. It is load-bearing regardless,
and `tests/cases/closures/map-callback-value-fnsig-pool-twin.vl` is the program that says so:
it runs on master, traps with that one site unrouted, and is now the single module in the tree
whose `.map` site sees a duplicate. The fourth,
the all-i32 arity fallback, **cannot be witnessed at all** — `i*ar>i` is the only key the token
alphabet can spell that renders `(structref, i32*ar) -> i32`, so it is always its own
representative. It is routed for the invariant, and the difference between those two cases is
recorded rather than smoothed over.

### The corresponding rule on the read side: unwrap the node, not only its receiver

`memberPathKeyOf` is the narrowing stack's member-path KEY, and three emitter readers ask it
about a receiver. It peeled a `Paren` off its receiver and not off its own node, so
`(t.v).r` keyed `""` while `(t).v` keyed `t.v` — the same function, two behaviours, one
paren apart. **D222** is that, plus the three readers' own raw `is Ident` tests. The rule is
the one the rest of the emitter already follows and this key did not: **a syntactic
classifier peels parens at its ENTRY, so no caller has to remember to.** Fixing it at the
three callers instead would have been three more places to forget.

## Parser, distribution & bootstrapping

- **Hand-written parser over a generator.** Dropped antlr4 (Java/Gradle build
  step; can't be part of a self-hosted compiler). Chose hand-written (Pratt)
  over peggy/parser-combinators for error quality and bootstrappability. (Track
  G)
- **Newlines are SOFT statement boundaries.** Never force-required — statements
  abut freely on one line (`let a = 1 let b = 2`, `return 1 print(9)`). A newline
  is load-bearing only where omitting it is genuinely ambiguous (a leading
  `+`/`-` that would otherwise continue the previous expression: `a` ⏎ `-b` is
  two statements, `a - b` is subtraction) or carries a real perf cost. Applies to
  both the TS parser and the self-hosted `parser.vl` being built for the
  bootstrap. (G8)
- **Self-hosted WASM emission: emit bytes directly + optional `wasm-opt`.**
  binaryen's npm build is JS-bound (Emscripten glue, not a standalone WASI
  module), so the self-hosted compiler emits the wasm binary encoding itself and
  treats `wasm-opt` (native CLI) as an _optional_ optimizer rather than
  embedding binaryen. Caveat: loses Heap2Local scalarization until `wasm-opt`
  runs. (binaryen stays for the TS compiler.) (H4)
- **Off-V8: binaryen's role collapses from IR builder to optional optimizer.**
  The TS backend (`compiler/toWasm.ts`) uses binaryen as its codegen data
  structure — ~640 `m.<op>(…)` IR-builder calls. The self-hosted backend
  (`compiler/wasmEmit.vl`) emits the wasm binary encoding _directly_, so that
  builder role — and all ~640 calls — simply doesn't exist to port; only an
  _optional optimizer over bytes_ remains. Reaching it needs no JS engine:
  default to the `wasm-opt` subprocess (zero bindings, H4), with an in-process
  **libbinaryen FFI** slice (~5–6 C calls: read → set GC features → optimize →
  write → dispose, vs. the 640 builder calls) as an upgrade when subprocess
  latency/`PATH` bites. Self-hosting removes the reason V8 ships (the TS
  compiler); direct emission removes the reason binaryen ships as a builder.
  Full analysis: `docs/internals/binaryen-transition.md`. (H4.1)
- **B-validwasm is the gate that makes optimization optional.** Today some
  constructs only _validate_ after `optimize()` runs (binaryen's passes quietly
  fix up naive emission), so the "unoptimized" path isn't actually optional.
  Emitting wasm that validates _as emitted_ (B-validwasm) is the highest-value
  transition work, independent of optimizer choice — it's what lets
  `wasm-opt`/libbinaryen be skipped at all and unblocks leaning on wasmtime's
  own JIT. The libbinaryen route additionally needs a WasmGC-array ↔
  linear-memory ↔ libbinaryen byte handoff (**H4.5**); the `wasm-opt` subprocess
  sidesteps it (bytes go out a pipe, not across FFI). Target runtime:
  **wasmtime** (stable WasmGC, ≈v27+). (H4.5)
- **`-O3` stays the named release profile, and the emitter is the long-term
  route.** A three-rung sweep over all 46 benchmarks
  (`bench/findings/three-rung-sweep.tsv`) settles the per-program split as the
  answer rather than leaving it open: at a 5% materiality floor `-O3` beats
  `-O` on **12 rows** (`lambda-hot` 2.23x, `dispatch-table` 1.43x, `mandelbrot`
  1.28x) and loses on **4** (`sort-heap` 1.37x, then three at ~1.05x) — it wins
  materially three times as often as it loses, and its largest win exceeds its
  largest loss. The nominal 23/23 split is noise. `sort-heap`'s shape is
  written down as the named exception instead of flipping the rung for it.
  Costs accepted: ~50% more wall time and ~1.3 KB on the 1.1 MB compiler
  (19.5 s / 919,547 B vs 13.1 s / 918,258 B). Reversal stays one line
  (`RELEASE_PASSES`, `scripts/vl-host/src/main.rs:1493`) and the melt/loop
  goldens already carry all three columns, so a later flip re-labels rather
  than re-measures. **Direction:** optimization should eventually be
  internalized so it can be applied selectively — keeping the wins where they
  are and avoiding the regressions where they are not — but that work is gated
  on whether it meaningfully improves OVERALL self-compile time; individual
  function wins do not qualify. (P1.3, `O-release-rung-default`)
- **The binaryen inline budget is a build flag, never a default.**
  `--always-inline-max-function-size=60` melts the view descriptor outright
  (`axpy-view` 1.736 -> 0.636 ns/elem, in a kernel module 113 B smaller), but on
  the 1.16 MB compiler module it costs **+82% bytes** (955,265 -> 1,740,871) and
  **+127% `wasm-opt` time** (22 s -> 50 s) for no self-compile speedup at all.
  `--flexible-inline-max-function-size=60` is the shippable half: 1.45x for
  +28% compiler size. Same shape and same answer as the names section (C10) —
  a large fixed tax on every module to buy a win only some modules want, so the
  consumer passes the flag. Note the hand-written spelling needs no flag and is
  faster than either (hoist `byteAddrF32(0)` and `.length`, then bare
  `__load_f32__`/`__store_f32__`: 0.296-0.500 ns at all three rungs), so the
  flag is a convenience over an existing route, not the only one. (P1.3, C3)
- **Versioning (when needed): rustup/Volta model, not nvm.** A launcher that
  resolves a committed project pin and auto-installs the right toolchain — not
  manual `use`/shims. Deferred until multiple releases warrant it. (H5)
- **Modules: whole-program merge to ONE wasm module, not separate
  compilation/linking.** N `.vl` files resolve into a single `VLProgramNode` the
  existing `toWasm` compiles unchanged — the natural fit for VL's
  monomorphization + single-wasm output and the H-M2 end-state (one module).
  Rejected wasm-linking (cross-module ABI + linker, fights monomorphization).
  Syntax: explicit `export` modifier on `function`/`let`/`const`/`type`
  (greppable public surface, not Go capitalization or Python export-all); named
  `import { a, b as c } from "./util"` only, relative specifiers with the `.vl`
  extension OMITTED (resolution appends it, no index guessing). Per-module name
  isolation by **mangling** every module's top-level value names (`name$mN`) and
  rewriting references — so two files' private `helper`/`Tok` coexist (self-host
  gap #1) and an `import` rewrites to the exporter's mangled target; user
  `type`s are already structural at codegen so only value names need it. The
  single-string `compile(source)` is untouched (back-compat); the graph driver
  is `compileProgram`/`checkProgram` over an injected file reader
  (runtime-agnostic, like the rest of the core). Phase 1 = relative user-file
  imports only; the `std:` scheme + embedded std (phase 2) and cross-file LSP
  (phase 3) are deferred, as are import maps / namespace+default imports /
  re-exports. Design + full rationale: `docs/internals/modules-design.md`. (H0)
  - _Sub-questions resolved at implementation:_ (a) the entry module is mangled
    uniformly like every other (simpler rule, debuggable names) rather than kept
    verbatim; (b) modules merge in dependency-first (import topological) order
    so a dependency's top-level initializers run before its dependents' — the
    design's open cross-module `let`-init-order question is answered as "import
    order, cycle = error" for phase 1; (c) a file compiled single-string with a
    stray `import` is harmless (the names just don't bind) rather than a hard
    error — imports are only meaningful through the graph driver; (d) `export`
    keyword spelling chosen over `pub` (matches the `import`/ES family).

- **Host-callable wasm exports: entry-module only, thin scalar wrapper.**
  Entry-module only because binaryen treats exports as DCE roots — non-entry
  exports would pin otherwise tree-shakeable functions. Thin wrapper because
  every VL function carries a leading `structref` closure-env param; the wrapper
  drops that param and forwards a null env, giving hosts a clean scalar ABI
  (scalar params/returns only for v1). (H6, PR #141)

- **Integer divide-by-zero stays a trap.** The universal wasm/hardware
  convention; no checked division by default. A `divChecked: i32|null` dual is a
  possible future opt-in but not planned for v1. (B-debug)

## Editor / LSP

- **D2 symbol table reuses the parser's scope walk, not a second resolver.**
  Go-to-definition / find-references resolve use→declaration, which the parser
  already does as it walks the live `scopes` stack — so the symbol table is
  populated during that same walk rather than by a separate post-parse resolver
  (which would duplicate scope/shadowing logic and drift from the checker).
  Position-indexed, single-document; cross-file and builtins are out of scope.
  (D2)

## Assignment is an expression yielding its right-hand side

`x = e` evaluates to `e`'s value (so `b = (a = 5)` gives 5, `while (line = next()) != ""`
works, and a function whose trailing statement is an assignment returns the assigned value
via the trailing-expression rule — `function bump() { count = count + 1 }` returns the new
count). Confirmed deliberate (2026-06): the classic `if (x = 5)` C foot-gun is mostly
defused by VL's mandatory-`bool` conditions; the residual hole — `if x = true` with a
boolean `x` — is handled by LINT, not semantics (an assignment whose RHS is a LITERAL in
condition position warns; see ROADMAP B17), keeping the expression semantics uniform.

## `else if`, not a fused `elseif` keyword

A chain is `else` whose branch is another `if` (the brace grammar nests with no extra
terminator — the C / Rust / Swift / JS form). The fused `elseif` keyword was removed as a
pure alias (it parsed to the identical nested-`IfStmt` AST and was used once in the whole
corpus vs 571 `else if`). A dedicated `elseif`/`elif` keyword only earns its keep in
block-terminator languages (Python/Lua/Ruby) where `else if` would force an extra `end`;
VL's `{}` blocks make it redundant. One form means no parser ambiguity and no formatter
surface-recovery for the chain keyword.

## `then` removed — braces are the one branch spelling (owner, 2026-08-31)

`if cond then stmt` / `if c then a else b` was never designed: it arrived as host-parity
sugar in 654722e3 (June 2026, the "parser/lexer sugar tail"), the TS compiler it mirrored
is retired, and the tree had ZERO organic uses — std/ and compiler/ never wrote it, and
its only producer was `vl fmt` itself, which canonicalized simple if-EXPRESSIONS into the
`then` spelling. Braces already covered both of its positions (`if c { s }` statements and
`print(if c { 7 } else { 8 })` expressions, both verified running before the removal), so
the keyword was a second spelling of a form the grammar already had — the same shape as
`elseif` above, plus a soft-keyword ambiguity (`then` doubled as an ordinary identifier)
the parser and every editor surface had to carry.

Removed in one go, ordered so no intermediate tree is broken: (1) fmt flips to braced
rendering while the parser still accepts `then` — which also fixed a standing formatter
bug (a `then`-spelled `else if` chain made fmt emit an empty `else ` clause and refuse its
own output); (2) the tree migrates mechanically on the new fmt (45 fixture files, 2 TS
tests; the distilled corpus and the filed Repro blocks held zero `then` programs); (3) the
parser arm drops. Old code is not stranded on a generic "expected `{`": an `if` condition
followed by the identifier `then` refuses with `` `then` was removed — wrap the branch in
braces: `if cond { … }` `` and recovery-parses the old shape so every occurrence in a file
reports. `then` remains a perfectly good identifier (the lexer soft-keyword
fixtures now double as that regression's coverage), and the contextual soft-keyword set is
five: `as` `from` `in` `step` `to`.

## `toString` is std's name, not the compiler's — the ambient builtin is retired (owner, 2026-09-01)

VL had TWO number renderers with two names. `toString(x)` was a compiler BUILTIN: in scope
with no import, typed `(i32 | boolean) => string` in `driver.vl`'s default-scope list, and
lowered inline by `emitToString` into the string-op scratch frame. `std:fmt` exported
`toStr(self: i32 | i64 | boolean | f64)`, pure VL, reached by an import and readable as a
UFCS method. The ruling: **there is one, it is std's, and it is spelled `toString`.**

**Why `toString` and not `toStr`.** It is the cross-language-conventional spelling — Java,
C#, JavaScript, Kotlin, Scala and Dart all write the word out, and Rust's `to_string` is the
same word in its own casing. Nothing in VL abbreviates a name to save five characters, and
the abbreviation only ever existed because the full spelling was TAKEN by the builtin. With
the builtin retired the vacancy is real, and a std name is close to permanent — this was the
cheapest moment it will ever be to pick the better one.

**Why the builtin goes rather than both staying.** Two names for one operation is the flat-
namespace hazard `std:fmt`'s own header argues at length about `split`, one level up: a
reader who learned `toString(42)` and a reader who learned `n.toStr()` are writing different
programs for the same thing, and neither spelling can be recommended without qualification.
Worse, the builtin was the WEAKER of the two — its domain `i32 | boolean` is a strict subset
of the export's `i32 | i64 | boolean | f64` — so the name everyone reaches for first was the
one that refused an i64 and a float.

**Three measurements settled it, on the pre-rename compiler, and they are kept in
`std/fmt.vl`'s header rather than here** because that is the file a future reader will be
holding. (1) The builtin's domain is a strict subset, so **no program loses a capability** —
`toString(n)` over an i64 and `toString(1.5)` both refused before. (2) Builtins are not
`self`-first, so `n.toString()` refused (`member access '.toString' on non-object i32`); the
rename BUYS the UFCS spelling, and that is the actual user-facing win rather than a tidying.
(3) The one break: `toString(42)` compiled with NO import and now needs
`import { toString } from "std:fmt"`.

**That break ships once, deliberately, with a targeted refusal.** std has no deprecation
story, so the compiler pays instead: `typecheck.stdFmtMovedNote` appends the import line to
the undeclared-identifier message for BOTH retired spellings, and to the member-access
sentence on a scalar receiver, where the migrating spelling actually lands. This is the
`then`-removal precedent above — a spelling the language removed earns a refusal that names
its replacement, because the generic one strands a reader who has no reason to suspect a
rename. `toStr`'s note is the one with an expiry (it buys a release of muscle-memory);
`toString`'s should outlive it, since the builtin was import-free and its absence is the
surprising half.

**What was NOT done, and why.** The builtin's lowering is DELETED, not kept as a fast path
behind the std name. A hidden intrinsic that fires only for `i32` would make `n.toString()`
mean two different programs depending on the receiver's width, and the whole point of the
ruling is one meaning. The cost is real and recorded — `bench/strings/int-format` measured
the pure-VL renderer at 5.7x the builtin — but it is now a LIBRARY-QUALITY item on a path
with a name, which is a better place for it than a compiler special case nobody can profile
or improve in VL. And the three std modules that render a number inside an error message
(`utf8`, `fs`, `args`) IMPORT `std:fmt` rather than each keeping a private renderer: that
costs a `std:utf8` consumer 3,670 → 18,556 bytes with no cross-module DCE, and the
alternative is three copies of a decimal loop that must agree about i32 min forever. Same
ruling as `split`: one implementation beats smaller output, and DCE is the fix.

## `else` takes a block or an `if` — the brace is required (owner, 2026-09-01)

**"make brace on else required."** `else <stmt>` is removed. An `else` is followed by a brace
block or by another `if`, the Rust / Go rule — so `else print(2)`, `else x = 2`, and in value
position `const x = if c { 1 } else 2` are parse diagnostics rather than sugar.

This is the `then` removal's other half, and the argument is the same one. After `then` went,
every branch in the grammar took a brace block except this one, which still accepted a bare
statement — a second spelling of a form the grammar already had, kept alive by nothing but its
own history. The asymmetry was also load-bearing in the wrong direction: `if c print(1)` had
just become a diagnostic while `else print(1)` on the next line stayed silent, so the rule a
user inferred from the first message was contradicted by the second line of the same file.

**The cost was measured, not assumed, and it is not zero.** `compiler/` and `std/` write no
unbraced `else` — nor could they quietly acquire one, since `lint-self.sh` runs `vl fmt --check`
over both and fmt has always normalized the form to braced, which is also why every formatted
file in the tree is already compliant. The distilled corpus moved **0 of 7,564 cells** (2,061
representatives + 5,503 curated), which is what the generated-then-formatted pipeline predicts.
But `tests/` is excluded from fmt-check by construction — it is the deliberately-malformed
fixture corpus — and **six sites in five fixtures did write it**: `conditionals/
tail-if-else-value.vl` (two), `functions/recursion.vl`, `inference/hole-is-guard-alternative.vl`,
`inference/hole-is-guard-return-join.vl`, `soundness/hole-is-guard-return-join-reject.vl`, plus
`parser/then-removed.vl`, whose `else 8` was incidental to what that fixture pins. All migrated
mechanically, in place, line-count-preserving. A grep that reads only the fmt-checked half of
the tree reports zero here and is wrong by six.

**Old code is not stranded**, and the recovery is not a new one: the `else` arm now calls the
same `parseBracedBody` the other three bodies use, so an unbraced `else` costs exactly ONE
diagnostic — `` an `else` body requires braces: `else { … }` ``, anchored on the offending
statement's first token — and the parse continues with the statement taken as the arm. The
`startsStmt` gate comes with it, which makes `else` behave IDENTICALLY to its `if` twin on
every non-statement-start: `else }`, `else )` and an `else` at end of line now give the same
message, count and span shape as `if c }`, `if c )` and `if c` do (measured pairwise). The last
of those is a wording change on a path that already failed — `else` at end of line was never
legal, and used to read `expected an expression but found NEWLINE`.

**Two braced forms are deliberately untouched, and a rule spelled "the token after `else` must
be `{`" would have broken both.** `else if` is an `if` in the else slot, not a body, and stays
silent in statement and value position alike — it is 571 uses in the tree. And `else { a: 2 }`
in value position is an OBJECT LITERAL: it is braced, so the rule is satisfied, and which of the
two readings applies is `looksLikeObject`'s question, not the brace rule's. `vl fmt` renders it
as the unambiguous `else { { a: 2 } }`.

**fmt keeps no dead path from this.** It never had one specific to the sugar: an unbraced `else`
was printed by `bareBodyInline`, the general "render a one-statement Block inline" helper, which
braced blocks reach too (`if c { 1 } else { 2 }` in value position is the same call). fmt only
formats parse-clean files, so it simply stops seeing the unbraced input; nothing became
unreachable.

## ONE hole syntax, `\{expr}`, in BOTH quoted forms — the trigger lives in the escape namespace (owner, 2026-09-01, "OK do `\{`")

**`"v=\{x} done"` interpolates, and so does `` `v=\{x} done` ``.** Plain double-quoted strings
gained holes; backtick templates MIGRATED theirs from `${` to `\{` the same day, six days after
templates shipped. There is now one hole spelling, one desugar, one renderer and one refusal for
both literal forms — and `$` is an ordinary character again, with `\$` retired.

### Why the trigger is an ESCAPE and not a brace

The interesting choice was not *whether* plain strings interpolate but **what a bare `{` means
inside one**, and the two live answers in industry split exactly there:

* **Kotlin/Scala/Ruby/JS put the trigger in the TEXT namespace** (`$`, `#{`, `${`). Every literal
  that wants the trigger character as data has to escape it, forever, in every string ever
  written afterwards. The tax is small per literal and permanent in aggregate.
* **Swift puts it in the ESCAPE namespace** (`\(expr)`). A backslash inside a string literal was
  ALREADY the escape opener, and `\(` was already an error — so adding interpolation to plain
  strings cost Swift nothing at all, and `(` stayed data.

VL takes Swift's placement and the owner's brace spelling. **The zero tax is by CONSTRUCTION,
not by luck**: the trigger is a sequence that was already a hard error, so there is no string
whose meaning could change, and `{` stays data in every string forever. That property is worth
more than the sigil's shape, which is why the spelling being `\{` rather than `\(` costs nothing.

**Measured, and the measurement is smaller than the one the proposal carried.** On the tree this
landed against: **119 of 32,071** double-quoted VL string literals carry a literal `{` (10,312
`.vl` files; a literal-extracting scan, so comments, char literals and templates are excluded —
`grep` over lines would count all three). The figure
quoted while ruling was 4,821, which does not reproduce under any population that could be
constructed here (literals with `{` or `}`: 189; `{` occurrences inside literals: 121; literals
with `{` across `.vl`+`.ts`+`.rs`+`.md`+`.json`: 996). **The ruling does not depend on the
number** — a `{` trigger's tax is permanent and applies to every JSON, wasm-text and
format-specifier literal not yet written, while the escape-namespace tax is zero by construction
— but the number in the argument should be the one that reproduces, so it is recorded here as
119 with its population named.

**And `${` in a double-quoted string was already ZERO tree-wide**, so nothing rode on it either.

### The pre-1.0 licence, and why the template migration was cheap

Templates were six days old (#2188) and the ONLY `${` users in the tree were their own fixtures.
Migrating them cost one mechanical pass over eleven files. **A one-day-old feature is the
cheapest moment a break will ever be**, and holding two hole syntaxes — `${` in backticks, `\{`
in strings — to avoid it would have been the permanent cost: two spellings to learn, two to
document, two the grammars and the four textual module gates each have to scan for.

After the migration `${` is ordinary text in a template, and **no hint or lint marks it**. That
is a decision, not an omission: it does not become an error, it becomes a legal program, and
minting a diagnostic for a legal program to warn about a six-day-old spelling is speculative.
Measured before deciding — ZERO `${` remain in tree. `\$` is different and DOES get a targeted
sentence (``\$` is not an escape — write `$` (an interpolation hole is `\{…}`)`), because it
becomes an ERROR either way and the only question was the wording.

### One scanner, one escape decoder — the discipline the template entry claimed, now load-bearing

`scanQuoted` already served `"`, `'` and `` ` ``. It gains ONE predicate — `holes = quote is `"`
or `` ` `` `` — and the `\{` test sits in front of the escape arm, so `\{` never reaches
`decodeSimpleEscape` and `\\{` is an escaped backslash before an ordinary brace. **The `"` call
site gains the split-run arm the backtick call site already had**, and a fourth stack (`gTplQuote`)
records each open run's delimiter so the `}` arm resumes in the mode the run opened in and the
unterminated report names the literal the author actually opened. A holed string mints the same
`TEMPLATE_HEAD`/`MID`/`TAIL` kinds a template does, so **nothing past the lexer learned that a
second literal form exists** — the parser's desugar, the absolute binding, `binTpl`'s verbatim
reprint, the hole domain, the refusal and the nesting rules are all untouched code serving twice
the surface. Proved by byte identity rather than by reading: `print("v=\{x}")`,
`` print(`v=\{x}`) `` and the hand-written `import { toString } from "std:fmt"` +
`print("v=" + x.toString())` are all **17,089 bytes, one sha**.

The kinds keep their `TEMPLATE_` spelling and the module gate keeps the name `cliHasTplHole`.
Both now undersell what they cover, and both are kept deliberately: the gate is mirrored
character for character in three languages under a guard that anchors on the declaration, and the
kinds are a closed token vocabulary threaded through the parser, the semantic-token classifier
and the printer. Renaming buys a word and touches every mirror; the headers carry the contract
instead, and the guard's anchors now name the `"` arm explicitly so a gate that only scanned
backticks fails by name.

### What did NOT move: multiline

**A raw newline in a `"…"` string is still the end of the literal.** That is the one rule the two
grammars still disagree about, and it is the reason `tpl` survives as a separate predicate beside
`holes`. Only the TEXT parts are governed by it: a HOLE is expression context in both forms, so
`"v=\{\n x + 1\n}"` parses, exactly as the template spelling does.

## A template literal's stringifier is bound ABSOLUTELY, never by scope pickup (owner, 2026-09-01)

*(Spellings updated when the hole trigger moved to `\{` — see the entry above. Everything this
entry says about BINDING is unchanged, and it now covers `"v=\{x}"` too, which is the same
construct reached from a different delimiter.)*

**`` `v=\{x}` `` renders `x` through `std:fmt`'s integer/boolean renderer no matter what the
file imports, declares, or shadows.** A hole is not a call the user wrote and does not
resolve like one: the parser desugars it to a call naming `$tpl$render`, an identifier no
program can spell (`$` is not an identifier character), and the module merge rewrites that
onto the merged `toStr$mN` through an ordinary rename row.

**The rejected alternative is scope pickup** — resolving `toStr` in the user's scope, the way
UFCS resolves `x.toStr()`. It reads as the more "VL" answer, and it is wrong for one reason
that outweighs the consistency: *a string literal's meaning would then depend on the file's
import list.* Two files with identical source text and different imports would print different
things; deleting an unused-looking import would silently change a message; and a local
`function toStr(self: i32) { "USER" }` would hijack every template in the file without a word
from the compiler. Every surveyed language binds interpolation to a canonical protocol —
Rust's `format!` expands to absolute `::core::fmt` paths precisely so a `use` cannot reach it —
and `docs/constraints-design.md` §1 records the same answer from the other side: *bounds* may
be scope-relative, interpolation may not.

**Absolute binding is not free, and the price is an injected import.** Calling a std function
from lowered code requires that function to be IN the merged program, so `modScan` pushes a
BARE `std:fmt` edge — `impName` and `impLocal` both empty, the exact row a bare `import "…"`
produces — for any module holding a hole. That emptiness is the whole no-pollution mechanism:
`modBuildRename` mints a user-visible binding only for `impLocal != ""`, so the module is
fetched, ordered, parsed and merged by the machinery an author's own import uses while `toStr`
stays undeclared, a user-declared `toStr` still renames to its own `$mN`, and completion (which
filters on the entry's imports) never offers it. Verified by byte identity rather than by
reading: `` print(`v=\{x}`) `` compiles byte-identically to `import { toStr } from "std:fmt"` +
`print("v=" + x.toStr())`, and a module that already imports `toStr` and also interpolates is
byte-identical to its hand-written twin — one merge, not two.

**The bound name lives in ONE constant** (`TPL_RENDER_EXPORT` in `driver.vl`) because the owner
has already ruled that `toStr` is renamed to `toString` once the ambient builtin is killed
(ROADMAP § Ruled and sequenced). That rename is a one-line edit here.

### The hole domain at launch, and why `f64` is absent

`string`, plus whatever the RENDERER's declared parameter admits. A `string` hole is delivered
DIRECTLY, because the renderer does not accept one and widening it to would box every
interpolated string into a union to hand it straight back; everything else goes through the
renderer.

**The domain is not spelled in the compiler.** Both the admission test (`assignable(at,
expected)`) and the refusal's own SENTENCE are read off that parameter type, so the two cannot
disagree and neither can go stale. That is not a hypothetical: this was written against
`i32 | i64 | boolean`, serde Stage 0's `renderF64` widened the renderer to include `f64` days
later, and `` `v=\{1.5}` `` began printing `1.5` **with no template-side edit** — the fixture
that had pinned the f64 refusal flipped to pinning the widening instead. A hard-coded list is a
citation with a date on it; this one would already have been wrong.

Anything outside the domain gets a TEMPLATE-shaped refusal AT THE HOLE'S SPAN
(``an interpolation hole is `string` or i32 | i64 | boolean | f64 — this one is P``), never
`argument 1: expected …, got P`. The generic message would name a call the
author never wrote, over a parameter list they cannot see. The type-directed choice — deliver
directly, render, or refuse — is made at the ONE line in `checkCallNode` where the hole's type
first exists, so the in-domain path is byte-for-byte the path a hand-written `x.toStr()` takes
and no second lowering exists to disagree with it.

### Nesting is allowed; a backtick inside a hole's string needs no escape

Both fall out of the scanner rather than being added to it, which is why neither is refused.
A hole ends at the `}` at THAT hole's own brace depth, so a template inside a hole simply
pushes its own row on the stack — `` `a\{ `b\{x}c` }d` `` prints `ab1cd`. And a hole is
EXPRESSION context, so `"…"` inside one is scanned by the ordinary string scanner, where a
backtick is an ordinary character: `` `\{"nested ` backtick in string"}` `` needs no escape and
does not get one. Escaping it would have meant one grammar's delimiter reaching into another's
literal, which is the rule TS and JS also decline to make.

Only the template's own TEXT parts escape a delimiter, and there the one escape is ``\` ``
(`\$` was the second until the entry above moved the hole trigger into the escape namespace and
made `$` ordinary again). Every other escape is the string escape set, shared and unchanged — asserted as
such (`` `\t` == "\t" ``, `` `\u{1F600}` == "\u{1F600}" ``) rather than transcribed, and
implemented as a purely LEXICAL part→`"…"` rewrite so no second escape decoder exists to drift
from the lexer's.

### The cost that is recorded rather than fixed

A template whose holes are ALL strings still pulls `std:fmt` (and the `std:str` it imports):
17,120 bytes against 1,920. The renderer is merged but never CALLED — byte-identical to an
import-and-never-call control — so this is dead weight, not a wrong lowering (and at the
`-O3` rung binaryen's DCE erases it entirely: the string-hole template is 198 bytes against
200 for the `+` concat it replaces — the "dead weight" claim holds only at the `none` rung). It is
unavoidable *here* because the injection decision is made at TOKEN level: every host closes
the module graph from a textual scan before any lexing happens, so nothing at that moment
knows a hole's type. The fix is whole-program dead-code elimination, which `std/fmt.vl`'s own
header already names as the missing piece for the identical symptom (`import { toStr }` alone
costs 17,062 bytes where it used to cost 2,850 — that module's header dates and
breaks down the number). A template-specific module-drop would be a
second, narrower mechanism for the same problem.

## An unbraced body is RECOVERED, not cascaded — and the gate is `startsStmt`

**One mistake, one diagnostic, and the parse continues with a usable AST.** (owner directive,
2026-09-01)

`if` / `while` / `for` bodies require braces. An unbraced one used to cost TWO diagnostics and
sometimes three, because `expect("LBRACE")` diagnoses and deliberately does NOT consume a
non-sync token: `parseBlock` then read the rest of the file as the body and its `expectClose`
reported `expected `}` but found end of input` on a line nobody wrote. The second message is
pure cascade — it names a position derived from the first mistake — and in the `if c x = 1`
shape a third appeared, `expected an expression but found EQUAL`, because the mis-parse had
already consumed `x` as the body's first token. `parseBracedBody` takes the one statement as
the arm instead, and the arm is `mkBlock([stmt], -1)`, the same synthesized wrapper the `then`
refusal above and the `else <stmt>` sugar already build — so the checker, the printer and the
LSP see exactly the braced shape and nothing past the parser learns a body was recovered.

**Three things this deliberately does NOT do.**

*It does not recover a body that was never written.* The gate is `startsStmt`, so `if c }` and a
truncated `if c` keep the plain `expected `{``. Recovering there would mean inventing an arm out
of a closer: the parser would be guessing at intent rather than reading a mistake, and the arm
it invented would then be the thing later diagnostics were anchored against. Three members of
`startsStmt` (`(`, `[`, `-`) are unreachable from a body position — measured, one probe per
member — because the CONDITION's expression parse consumes them as a call, an index and a
subtraction. They stay listed: the predicate answers about statements, not about one caller's
precedence accident.

*It does not touch `else`.* An unbraced `else` branch is LEGAL syntax (`if c { 1 } else 2`
parses, runs, and `vl fmt` normalizes it to braced) and goes through the same
one-statement wrapper WITHOUT a diagnostic. Whether braces should be required there is a
language question, not a recovery question, and it is the owner's to rule on. **(Ruled the
next day — see `else` takes a block or an `if` above. The recovery substrate did not change;
only the legality did, and the `else` arm was routed through `parseBracedBody` unmodified.
This paragraph is kept as the record of the split: the recovery question and the language
question really were separable, and answering them in that order cost one call site.)**

*It does not make a later TYPE error appear.* **(SUPERSEDED the next day — see "A recovered
parse is TYPECHECKED" below. The measurement in this paragraph is what the ruling was made on,
so it is kept verbatim.)** `checkSrc`/`compileSrc`/`lintSrc` in
`compiler/driver.vl` all return at `P.diags.length > 0` — the checker never runs on a file that
had any parse diagnostic. So `if c print(1)` followed by `const n: i32 = "hi"` still reports
only the parse diagnostic. That gate predates this change, and **lifting it globally was tried
and MEASURED before being left alone**: running `checkProgram` anyway costs **5 corpus cases**,
every failure a PHANTOM type error the incomplete parse invented — `f(1 2)` becomes `wrong
number of arguments: expected 2, got 1`, a mis-parsed operator overload becomes `redeclared ==`,
and a `(1 +` truncation adds both `d is used before it is assigned` and `operator '+' is not
defined for i32 and void`. That is the same noise this change exists to remove, one tier down,
so the gate earns its keep as written.

What the experiment DOES show is that the gate is coarser than the question: it keys on "any
parse diagnostic", and an unbraced-body recovery is LOSSLESS — the arm is the statement the user
wrote, so its type errors would all be real. A finer gate would have to be armed by each
recovery SITE (this one is lossless; `expectClose`'s skip-to-closer drops tokens, which is what
produces all five phantoms above), not derived from the AST — `f(1 2)` parses to a hole-free
`f(1)` with no `ErrExpr` to detect. That is a design change with its own reach, and it is the
owner's call, not this change's.

Later PARSE errors do surface, which is what makes the recovery worth having: the arm is exactly
one statement, never a scan, so the cursor lands back on the statement boundary.

## A recovered parse IS typechecked — the gate quantifies over EVERY diagnostic

**Stage 1 of the lossless-recovery flag. `checkSrc`/`checkSrcSym`/`compileSrc`/`lintSrc`/
`lintGraph`/`modCompile` run the checker past parse diagnostics IFF EVERY parse diagnostic in
the file carries a per-diagnostic LOSSLESS flag; exactly one recovery site sets it. Emit never
proceeds past any parse diagnostic.** (owner ruling 2026-09-01, "seems straightforward"; #2217)

The paragraph above states the problem and refuses to solve it: the bail keys on *any* parse
diagnostic, and an unbraced-body recovery is provably lossless. The refusal was right about the
DANGER and wrong about the only available shape — it assumed the choice was between the bail and
lifting it. The third option is to make the diagnostic itself say which kind it is.

**The flag is a sparse index-keyed column beside `P.diags`** (`dgLossless` in `compiler/ast.vl`),
the same shape as the driver's `vcDg*` tokenless-diag table, and it is reset from the same
`vcDgReset` the seven pipeline entry points already call in lockstep with `P.diags = []`.
**Sparse and not dense on purpose**: a dense column would have to be pushed by every
`P.diags.push` in the tree, and the site that forgot would mis-key every later entry. Absent
means "not known to be lossless", which is the safe default and therefore the right answer for a
site that has never heard of the table. (The stale-entry direction is the dangerous one — the
LSP re-enters `checkSrc` per keystroke on one instance — which is why the reset lives in the
one home rather than at seven call sites.)

**Exactly one site sets it: `parseBracedBody`'s unbraced-body recovery** (#2115/#2165 — `if`,
`else if`, `while`, `for`, `else`). Its arm is handed to `parseStmt` exactly as a braced body
would have been, so no token is dropped and none invented; a type error read off that AST is
about the program the user wrote. `parseBlock`'s fall-through is NOT marked, because
`expectClose`'s skip-to-closer drops tokens. The `then`-removal recovery in `parseIf` is
arguably lossless too and is deliberately left unmarked — it was not in the ruled set, and it is
the cheapest stage-2 candidate. (Stage 2's FIRST conversion has since landed and split
`expectClose` in two — see the section below; the sentence above describes the site as stage 1
left it.)

**The quantifier is ALL, and that is what makes it safe by construction.** One lossy diagnostic
anywhere in the file restores the old bail for the whole file, so the five phantoms cannot
appear: they each need the checker to run on a file whose only diagnostics are lossy.

**EMIT is not gated on the flag and never proceeds past a parse diagnostic.** A recovered program
CHECKS; it does not BUILD. `vl build`/`vl run` keep rc 1, write no module, and print the same
parse message — the only difference is that the type errors found on the way now ride with it.
`formatSrc` also keeps the ANY reading, and for a different reason: `vl fmt -w` writes its output
back over the file, so printing a recovered AST would silently re-spell the mistake as the braced
form and erase the diagnostic with it.

**The five phantoms, re-derived rather than quoted** (the paragraph above names a `(1 +`
truncation that no corpus case has ever held — its two messages come from a hand probe, and the
count is the part that reproduced). Lifting the bail wholesale on 2026-09-01 fails exactly five
corpus cases, each inventing the message beside it:

| case | phantom |
| --- | --- |
| `parser/call-missing-comma-recovers.vl` | `wrong number of arguments: expected 2, got 1` — **RETIRED by stage 2's first conversion; four pins remain** |
| `functions/trailing-comma-illegal.vl` | `wrong number of arguments: expected 0, got 1` |
| `objects/error-equality-not-overloadable.vl` | `redeclared ==`, `redeclared !=` |
| `index/operator-unannotated-self.vl` | `cannot index non-array Box` |
| `parser/coalesce-logical-mix-error.vl` | `operator '&&' expects boolean operands` |

Each is pinned in `tests/vl_lossless_recovery_test.ts` by the message that must NOT appear, and
the suite was validated in BOTH directions — sabotage the gate to never block and two tests fail;
sabotage it to always block and five fail. The RESET has its own control and needs one: delete
`dgLosslessReset()` from `vcDgReset` and every gate stays green except the one test written for
it (`tests/lsp_lossless_recovery_wasm_test.ts`, "the flag column does not leak across checks on
one instance"), which then reports the real `wrong number of arguments` phantom on the second
check of a single wasm instance. Nothing else in the tree re-enters the driver twice with a
lossless file first, which is exactly the sequence an editor types. **Stage 2 converts the lossy skip sites one at a time,
each conversion making a recovery faithful and then deleting its pin deliberately.** Widening the
gate without making the recovery faithful is what the pins exist to stop.

**Ordering was not a decision this change had to make.** The driver's stream is parse-then-type
(`diagCount` reads `P.diags` before `T.diags`) and `vl run`/`vl build` print it that way; the
`vl check` report has stable-sorted every tier by `(line, col)` since long before this, so parse
and type diagnostics simply interleave by position with ties keeping stream order. The sink
already merged three sources; it now merges four.

Measured: distilled corpus **zero cells moved** (the corpus is parse-clean, so the gate is
unreachable from it), all eleven gates green, 349/349 filed witnesses as filed.

## A MISSING LIST SEPARATOR IS INSERTED, NEVER SKIPPED PAST

**Stage 2, first conversion. Inside a delimited list, a token that starts another ELEMENT where
a `,` belongs is diagnosed and the `,` is INSERTED — the list keeps every element the user
wrote. And `expectClose`'s skip-to-closer is now two events, not one: a scan that consumed
NOTHING inserted only the closer and is LOSSLESS; a scan that ate tokens on the way is not.**
(no new ruling needed — ROADMAP's stage-2 entry authorises the conversions; #2397)

`f(1 2)` was the phantom DECISIONS names first, and it was never an arity bug. The parser had no
separator arm at all: an element-starting token simply ended the list and fell through to
`expectClose`, whose bounded scan ran forward to the `)` — so the `2` was **deleted**, the call
re-parsed hole-free as `f(1)`, and `wrong number of arguments: expected 2, got 1` was a count
nobody had written. Skipping was the defect; the phantom was its symptom, and lifting the bail
would only have made the symptom visible.

**The insert is gated on the CALLER's element-start test, not on one global predicate**, because
"another element" is a different set per list: an expression for a call and an array literal
(`startsExprTok` — `startsStmt` minus the statement keywords, plus `if`), a field key
(IDENT/STRING) for an object literal, a parameter name (IDENT) for a parameter list. Four sites
are wired: `parseArgs`, `parseArrayLit`, `parseObjLit`, `parseParamList`.

**`{` is deliberately NOT an element start**, even though an object literal begins with one.
After a complete element a `{` is far more often a missing closer than a missing comma, and it is
already `expectClose`'s own scan bound — so `[{x: 1} {x: 2}]` keeps the lossy skip and keeps the
bail. That is the case `tests/lsp_lossless_recovery_wasm_test.ts` now uses as its LOSSY control,
having previously used `f(1 2)`: the conversion would otherwise have left that suite green with
its control no longer controlling anything.

**AND THE INSERT IS SAME-LINE ONLY — the guard is the whole difference between a faithful
recovery and a phantom, and the first cut of this change was the phantom.** Every list site skips
NEWLINEs before asking whether the list continues, because a list may legally span lines. Without
a guard that makes a missing CLOSER at end of line read as a missing COMMA, and the NEXT
STATEMENT becomes an element:

```
const xs = [1, 2      →  `expected `,` but found `print``, then
print(xs.length)         ``xs` is used before it is assigned` and
                         `list element expects a value, got void`
```

`expectClose` then reaches EOF having consumed nothing, marks the diagnostic LOSSLESS, and the
checker runs over a program nobody wrote — **the exact class the phantom pins exist to stop,
reintroduced by the change that retired one of them.** Master reports one diagnostic there
(`expected `]` but found `print``) and so does this, because a NEWLINE between the element and
the element-start token declines the insert. Measured on the built candidate against a pristine
master control, all three shapes byte-for-byte identical to master: `const xs = [1, 2` / `print(1`
/ `const a = { x: 1` each followed by a statement.

**THE PRICE IS REAL AND IS THE RIGHT ONE.** A missing comma at the end of a line inside a
MULTI-LINE list is no longer inserted, so it keeps the old lossy recovery and is not typechecked.
A closer that is missing and a separator that is missing are *indistinguishable* at a line end —
the tokens are identical — and guessing "separator" there is what invents a program. On ONE line
they are distinguishable, because a list that ends on that line has its closer there. The price
is a capability this change does not GAIN, not one it loses: the multi-line spelling behaves
exactly as master does. All four shapes are pinned in `tests/vl_lossless_recovery_test.ts`
(`NEWLINE_GATED`), each against MASTER'S OWN OUTPUT and each requiring a real type error placed
after the mistake to be ABSENT — the inverse of the positive cases, and the assertion that fails
if the gate is ever dropped. The pins were validated against the unguarded build, which produces
every forbidden message.

The guard reads the TOKEN STREAM rather than a flag threaded through the four callers:
`skipNewlines` leaves the NEWLINE it consumed at `P.pos - 1`, so "was a newline crossed" is
already recorded where it happened.

**The zero-skip half generalises the marker to all twenty `expectClose` call sites** without
touching any of them. The contract is unchanged — "the program the checker sees is the program
the user wrote, up to the inserted token" — and an inserted CLOSER satisfies it exactly as
`parseBracedBody`'s inserted braces do. `print(1` at end of line and a block whose `}` never
arrives are now typechecked; anything whose recovery ATE tokens still is not.

Measured on the built candidate, one program per spelling, each with a real type error placed
after the mistake so "no phantom" cannot be confused with "the checker never ran":

| spelling | diagnostic | checker ran | phantom |
| --- | --- | --- | --- |
| `f(1 2)` | ``expected `,` but found `2` `` | yes | none |
| `f(1 2 3)` (3 params) | two, one per gap | yes | none |
| `g(f(1 2), 3)` | ``expected `,` but found `2` `` | yes | none |
| `[1 2]` | ``expected `,` but found `2` `` | yes | none |
| `{ x: 1 y: 2 }` | ``expected `,` but found `y` `` | yes | none |
| `function f(a: i32 b: i32)` | ``expected `,` but found `b` `` | yes | none |
| `[{x: 1} {x: 2}]` | ``expected `]` but found `{` `` | **no — correctly still gated** | none |
| `const xs = [1, 2` + a statement | ``expected `]` but found `print` `` (master's own) | **no — the newline gate** | none |
| a multi-line list missing a comma | master's own two | **no — the price** | none |

**The strongest witness is the arity error that DOES fire.** `f(1 2 3)` against a two-parameter
`f` reports `wrong number of arguments: expected 2, got 3` — the phantom's own message with the
right number in it, which is what separates "the separator was inserted" from "the checker
happened not to run".

`vl fmt` is unaffected and must stay so: the comma goes into the TREE, not into the file. The
formatter keeps the ANY-diagnostic bail, refuses, and leaves the source byte-identical rather
than silently spelling the missing `,` in.

Measured: distilled corpus **zero cells moved**, all eleven gates green, three corpus fixtures
re-worded (the message changed from the closer's to the separator's) and one added
(`parser/call-missing-comma-typechecks.vl`). **Four phantom pins remain**; the next stage-2
conversion is the `then`-removal arm in `parseIf`.

## Which channel owns a NARROWED argument's type at a monomorphization pin

**The pin's own NAME owns it, and the checker's recorded type on the argument node is
consulted only to pick among that name's OWN members.** (D25, #1938)

Two channels answer "what type is this argument" during monomorphization, and they are
already both per-parameter columns of one instance:

* `pinned[j]` — the pin NAMES, from `monoArgTyName`, which reads the PARAMETER's declared
  annotation because mid-mono every `expr*` classifier is blind (`buildLocals` is post-mono);
* `pinTys[j]` — the ARGUMENT NODE's arena row, which knows the narrow.

The parameter slot and the body's binding column were built from the NAME; the RETURN
annotation's `substTyDeep` was built from the argument's ROW. Inside `if c is Circle` those
disagree — the annotation is still `Circle | null`, the checker has already typed the node
`Circle` — so `idg<T>(x: T): T` was minted `(param (ref null $uVarHeap[vi])) (result (ref
$uVarHeap[vi]))`. `vl check` rc 0, module refused at load.

### The measurement

A 187-cell grid over generic-call shapes (type parameter in the result vs not · `is` /
`!= null` / no narrow · nulvariant, plain variant, nulstruct, struct, nulreflist, reflist,
nulstring, string, nul-i32/f64, nul scalar list, nulmap, nullable closure, litunion,
nominal struct · direct / binding / nested / call-result / field-read / module-scope
delivery · generic returning `T`, returning a concrete type, two type parameters, a
forwarder), graded on `runs` · `loud check reject` · `loud emit reject` · `check-clean
invalid wasm` · `compiler trap` · `runs but wrong value`:

| | runs | loud check | loud emit | check-clean INVALID WASM | blockers (loud→silent) |
|---|---|---|---|---|---|
| master | 94 | 33 | 7 | **53** | — |
| (a) annotation owns it | 134 | 33 | 12 | **8** | 0 |
| (b) node type owns it | 98 | 33 | 10 | **46** | **6** |
| (c) shipped | **146** | 33 | 8 | **0** | 0 |

* **(b) is disqualified on the brief's own rule** — 6 cells moved from a loud outcome to a
  silent one, and 21 more from `runs` to invalid wasm. Its breakage is exactly where the row
  warned: a literal union's render SOFTENS to `string`, a nominal `P` renders `{x:i32}`, a
  closure renders an arrow where the pin needs a `$fnsig` marker, and a generic FORWARDER's
  leaf node still carries the ORIGINAL's `T`.
* **(a) is sound but leaves the result at a rep the checker does not believe in.** Its whole
  residue is the call RESULT's onward use: 8 silent cells at the boxed nullable scalars, and
  4 `runs` cells lost to a loud `field access but no struct type declared` because the
  instance returns `string | null` / `P[] | null` where the checker typed the expression
  `string` / `P[]`.
* **(c) is (a)'s consistency rung plus a GATED narrowing rung**, and it is what shipped.

### The ruling, in two rungs

1. **An instance is a function of its registry key.** The RESULT's substitution takes
   `letTyCol` — the same column the parameter slot and the body's bindings take — not
   `pinTys`. The registry is keyed on `pinned` alone, so sourcing the result from a column
   the key does not carry made the instance depend on something the key cannot see. That was
   an ORDER DEPENDENCE, not merely a wrong type: one program with two function declarations
   swapped moved between `runs` and check-clean invalid wasm, with identical call sites and
   an identical key.
2. **A narrowed argument's pin NAME is the narrowed spelling**, where the checker's recorded
   type renders a name that is a top-level MEMBER of the annotation's own union/nullable
   spelling AND that `monoAnnPinName` echoes back unchanged.

Rung 2 is the reason (c) beats (a), and the MEMBERSHIP gate is the reason it is not (b). The
justification for taking the narrow at all is `monoScalarAnnName`'s exact-name safety
property read at the CALL BOUNDARY: a pin becomes the instance's parameter annotation, so it
is safe exactly where a NON-generic function carrying that annotation already lowers the same
program. Measured, on the concrete twin of every rep in the grid — `function takeN(x: N): N`
called with a `W` value narrowed to `N` — **all ten run on master**, argument coercion
(`ref.as_non_null`, unbox) and result box included. Pinning `W` is equally legal as an
annotation and lands the RESULT off that path; pinning `N` lands the whole instance on it.

Where rung 2 declines (the nominal reps, whose render is structural), rung 1 alone keeps the
instance consistent — which is why the two rungs ship together and neither is redundant.

### What is deliberately NOT done

* **The narrowing is not decided by TYPE identity.** A `tySame`-based membership test would
  reach the nominal reps too (`{r:i32}` matching the `Circle` arm). It is not licenced: the
  grid has 0 silent cells and 0 regressions without it, and widening a rule past its measured
  need is the D-SHAPEFIELD precedent this repo keeps paying for.
* **`monoArgTyName` itself is unchanged**; the narrowing lives in a separate
  `monoArgPinName` that only `monoInstantiate` calls. `wasmEmit`'s `monoStaticIsResult` asks
  `monoArgTyName` about an `is` RECEIVER and const-folds on the answer — narrowing there
  would fold a guard the mono pass has no business deciding.
* **Five cells remain LOUD rather than running**: a narrowed `P[] | null` and a narrowed
  nullable closure whose generic RESULT is then indexed / called. Both are honest emit
  refusals (`field access receiver is not a struct`, `callee is not a function name`), both
  were check-clean invalid wasm before, and a loud floor beats a wrong instance.

## A REFUSAL the checker holds must ride the pin, and a deferred constraint belongs to ONE body

**A rule enforced at `vl check` and lost at monomorphization is not a rule — it is a rule
about spellings.** `checkBinary`'s equality arm asks two questions of the operands
(`isEquatable`, `eqCmpKindOfTy`); of a `T` they answer "equatable" and "OPAQUE", which is
correct about a type VARIABLE and useless about the instance. Nothing re-asked once the pin
was known, so `xs.indexOf(n)` over a `Circle[][]` was `vl check` rc 0 over a module the engine
refuses while the identical `a == b` was a clean checker error. (D35, #1946)

This is the third instance in three days of one shape — **information present at one layer and
silently dropped at the next** — after D25's "an instance is a function of its registry key"
and #1938's "a classifier's no-answer sentinel is not neutral when the caller has a default".
The transferable form: **when a checker rule consults a TYPE, ask what it answers for a type
VARIABLE, and whether anything asks again at the pin.** An answer that is merely *true* of a
`TyVar` is not an answer about the instance.

### Where the question is asked, and why not at emit

At the CALL SITE, through the deferred binary-op constraint (`noteBinCstr` /
`validateBinCstrs` / `binOpDefinedFor`) that already carried exactly this shape of question
from a generic body to its callers — its `==` arm asked only mutual compatibility, and now
asks both gates off one home (`eqRefusals`) that `checkBinary` also calls. The alternative was
a check inside `emit_mono`, which reaches the same programs; it was rejected because **`vl
check` is what an editor runs**, and a soundness rule that only the CLI's run path states is
invisible where the code is written. It also keeps ONE home: two places answering "is this
comparable" is the two-guesses shape the `eqCmpKindOfTy` header was written to end.

### The constraint list was a global keyed on a NAME, and that was already a defect

`substTyDeep` matches TyVars by name, so an unscoped constraint list makes every `<T>` in the
program one namespace. On master, `function addT<T>(a: T, b: T) { return a + b }` anywhere in
a file made `idT(c)` — a generic that adds nothing — report `operator '+' is not defined for
Circle and Circle`. **A false reject that predates this change, and the reason the equality
gate could not be stated without fixing it**: `indexOf`'s `self[i] == needle` would otherwise
have refused `xs.reverse()` over the same receiver.

Constraints now carry the DECLARATION that recorded them, and a call adjudicates only its own
callee's. A call site knows its callee to three degrees and each gets its own answer:

* a **declared** callee adjudicates its own body's constraints;
* a callee with **no declaration** consults everything, as before — but must not RE-RECORD.
  `validateBinCstrs` re-records a partially-substituted constraint under the hole it lands on,
  stamping the body it stands in as the new owner; with the whole list in scope, a HOF's inner
  `f(self[i], i)` re-recorded a sibling generic's `T == T` onto the HOF's own `T`, which is how
  `xs.mapIndexed(toI)` came to report `==` over an element type nothing in the program
  compares. **The re-deferral inherits the scoping bug of whatever it re-records**, so a fix
  that scopes only the direct read leaves the leak intact one hop away — and, symmetrically, a
  fix that scopes the read too far breaks something else (below);
* **no callee at all** — `genericFnAssignable` instantiates a function VALUE from its TYPE —
  consults everything, unchanged.

An owner-less constraint (module scope) always applies, so the scoping can only remove
cross-generic false rejects, never silence one that fires today.

### The callee's own DELIVERY is an axis, and holding it constant cost a round

The first draft scoped the unnamed callee to the ENCLOSING BODY, on the reasoning that a name
with no declaration is a closure parameter whose holes are the enclosing generic's own. **That
reasoning is persuasive and false**: it is also `const f = addT  f(c, c)`, where the holes are
`addT`'s, and the draft turned a loud `operator '+' is not defined for Circle and Circle` into
check-clean invalid wasm — a loud→silent move produced by the fix for loud→silent moves.

It survived a 1514-cell grid, because that grid crossed the NEEDLE's delivery and the
RECEIVER's delivery at five values each and spelled the callee `f(x)` in every cell.
**Enumerate the delivery of everything a call site names, not just the arguments.** The rule
that shipped withholds only the re-record from an unnamed callee, which is the narrower thing
the HOF case actually needed; the callee axis is now in the grid and in
`tests/cases/generics/error-deferred-constraint-true-positives.vl`.

### `validateBinCstrs` reached only the direct-call spelling

`xs.indexOf(nd)` never reached it. The same asymmetry the `u8[]`-meets-a-generic rule had, for
the same reason: **`self` arrives AHEAD of the argument loop the rule sits in.** Any rule
placed in that loop must be placed twice, and the UFCS half is now there.

### The measurement, and the one direction that needed defending

1712 cells, re-measured cell-for-cell after #1945 merged and identical in every column (T
binding × equatability of `T` over the rep vocabulary the grid enumerated × operation × route ×
needle delivery × receiver delivery × callee delivery × alias-vs-spelled-out). 225 moved, **0
genuine loud→silent**: 132 `check-clean invalid wasm → loud check reject`, 49 `loud emit → loud
check` (the same refusal one stage earlier), 18 `runs → loud check`, and 26 that LEFT a loud
outcome — every one of those the cross-generic false reject being removed, each with a master
diagnostic of `operator '+' is not defined for X and X` from a sibling generic the cell never
calls at that type, and each confirmed by deleting that sibling and re-running master.

The 18 are all `T = ("a"|"b")[]`, the cell D35 itself called its sharpest, and they are the
point rather than the cost. **A program that works because the emitter happens to hold a
comparison for one rep, while the checker refuses the identical comparison spelled out, is
relying on a coincidence one rep table away from changing.** The direct spelling has always
been `K[] isn't equatable`; the pin now says the same. `std/array.vl`'s ledger records this as
its first entry cleared by making a spelling LOUDER.

### The message goes in FRONT of the refusal, not behind it

The pin reports the direct spelling's sentence verbatim, so the two are greppable as one rule
— but the attribution is a PREFIX (`` `indexOf` compares its type parameter with `==` here: ``)
rather than the suffix the generic operator message uses. The reader is standing at
`xs.indexOf(n)`: they wrote no `==` and no `Circle[]`. The generic sentence can take
` (the call's argument types)` behind it because it ENDS on the two types; the equatability one
ends on a remedy clause (`— define a `==` operator for it`), and a suffix after that reads as
an instruction to define the operator *for the call's argument types*.

### What this does NOT reach, measured rather than assumed

* A NULLABLE `T` whose compare the checker ACCEPTS and correctly lowers — `string | null`,
  `i32[] | null` — is D35's MIRROR and is untouched: `eqCmpKindOfTy` answers `"nulstr"` /
  `"nullist"`, a compare core exists, the direct spelling runs and is right. There is no
  refusal to lose, so `eqRefusals` is correct to stay silent; the defect is that the PIN drops
  an acceptance. **D42**, 96 cells.
* **Whether the refusal being propagated is itself right.** For `T = ("a"|"b")[]` its first
  sentence says "a field is not value-comparable", and the field is `K` — `K == K` runs and is
  correct, as does `string[] == string[]`. So D35's close makes the pin state a refusal that is
  over-broad about its own reason, and the 18 cells it costs are not purely a caller's luck.
  **The fix is still the right call** — two spellings of one call answering with two severities
  is not a capability, and the silent answer was the permissive one — but the other half is
  filed as **D45** rather than absorbed into a sentence about coincidence.
* **The remedy clause it prints.** `— define a `==` operator for it` cannot be followed: a
  `function "=="` declaration parses, type-checks, and is silently discarded. **D46.** Left
  alone here on purpose: the clause lives in `eqRefusals`, the ONE home, so changing it changes
  both spellings, and choosing between "implement the dispatch" and "delete the clause" is a
  language-design call rather than a rider on this one.

### The axis a delivery grid cannot have: the SHAPE of the operand's type (D421)

**"Is the operand a hole" and "does the operand's type CONTAIN a hole" are different questions,
and every gate in the deferred-constraint machinery asked the first.** `tyIsHole` answers about
the type itself, so `function eqL<T>(a: T[], b: T[]) { return a == b }` — whose operand is a
`TyArray` OVER a hole — recorded no constraint at all. The pin had nothing to re-ask and the
whole apparatus above never ran: `eqL(circleList, circleList)` was `vl check` rc 0 over a module
the engine refuses, while the same comparison written out is loud and always has been.

**THE GRID THAT MISSED IT WAS THE RIGHT GRID FOR ITS QUESTION, and that is the transferable
part.** D35's 1,712 cells and D44's 741 vary the NEEDLE's delivery, the RECEIVER's delivery, the
CALLEE's delivery, alias-vs-spelled-out and the siblings — five axes about how the operand
ARRIVES. None of them is about what the operand's type IS, so all 2,453 cells hold it at `T`.
A delivery axis is not a shape axis, and a family whose mechanism is a predicate over the TYPE
is invisible to any number of delivery cells. The check that finds this cheaply is to ask, of
any rule keyed on a type predicate, "what does this predicate say about `T[]`, `T | null`,
`{ v: T }`, `(T) => T`" — four spellings, and two of them were defects.

**THE SAME WORD ONE LAYER DOWN.** D42 gave the emitter's `==` channel a `nodeTyIsTyVar` gate
for exactly this reason — a banked type that is a type VARIABLE is correct about the variable
and useless about the instance — and wrote it as IS, not CONTAINS. `a: T | null` is banked as
`T | null` inside the monomorphized instance for precisely the same reason, so the gate declined
to consult the second channel and the compare fell into the i32 tail. The rule is one sentence:
**wherever a predicate exists because a banked type may be about a type variable rather than
about the instance, it must ask CONTAINS.**

**A DEFERRAL IS ONLY SAFE ONCE SOMEBODY RE-ASKS.** `eqCmpKindOfArrayElem`'s array arm answered
`"none"` for a hole one hop down while the element arm one level up answers `""` for the same
`TyVar`, which is a false reject over `i32[][]`. Turning that `"none"` into `""` is one line and
is a LOUD→SILENT change when landed alone: measured, it takes a 468-cell grid's silent column
from 15 to 22, because the 9 cells whose element genuinely has no core leave their check reject
for check-clean invalid wasm (7) or a loud emit reject (2) with nothing standing behind them. On
top of the constraint widening the same line is a pure win. **Two rungs, one landing, and the
evidence is that the branch's moved set is a strict SUBSET of the union of the single-rung moved
sets — 25 against 34** — which is the arithmetic signature of a rung that is unsafe alone.

### `print`'s DOMAIN is a design rule; its container refusal was wearing a capability gap's words (D711/D712)

**`print` takes ONE value of `(i32 | i64 | f32 | f64 | boolean | string)` and that is the
DESIGN, not a codegen stage VL has yet to reach.** The refusal for an array / struct / map /
set / function value / union-of-those said `is type-valid but not yet supported by codegen`
on the stable `unsupported-lowering` channel; it is now a plain `tErr` in `toString`'s
words — `print expects one scalar or string value (…), got i32[] — print the elements or
fields individually`. `driver.builtinScan` and the message both render one
`typecheck.printDomainStr()`, so the domain the compiler advertises to LSP completion cannot
drift from the one it enforces.

**WHY THIS IS A RULING AND NOT A RELABEL, IN ONE MEASUREMENT.** Both refusal sites were
lifted and the corpus regraded: **19 cells move `loud check reject` → check-clean invalid
wasm and ZERO run.** Disassembled, the emitter falls through its ladder of positive rep
tests onto `call __print_i32__` with a `(ref $t)` on the stack — there is no partial
lowering to finish. What is missing is not a rep (a container's rep is an ordinary
`(ref $t)` the emitter already builds and reads) but a RENDERING the language has never
defined: separators, nesting, string quoting, a map's key order, what a closure prints as.
`print(1.5)` renders HOST-side (both hosts agree: `1e+21`, `Infinity`, `NaN`, shortest
round-trip) while a container must render guest-side through `__print_char__`, so
`print(x)` and `print([x])` would disagree on the same f64 unless Ryu is written in emitted
wasm — which `std:fmt`'s header and `std-design.md` D4 both decline from the other side.

**THE EARLIER VERDICT'S REASON 4 IS REFUTED, AND THAT ONE FALSE PREMISE IS WHY THIS DRIFTED.**
`destringify-types-program.md` ruled correctly that `print` does not learn to lower arrays,
but justified the channel with *"`print` has no declared type … so this cannot be an ordinary
assignability error — it has to be the same UNSUPPORTED-LOWERING admission"*. `toString` has
no declared type either and refuses out-of-domain arguments with a plain type error
(`toString expects an i32 or boolean, got string`). A settled design rule therefore spent
months counting against clause 2 on every scoreboard run, because the sentence conceded what
the ruling denied.

**THE SIBLING GATE KEEPS ITS CONCESSION, AND THE SPLIT IS THE POINT (D712).** `print` of a
BOXED VALUE UNION (`i32 | string`) is a real capability gap: every arm is already inside the
domain and `if v is i32 { print(v) }` runs today, so nothing about the output is undecided —
only the runtime tag dispatch is missing, and the emitter already performs that dispatch for
`is`. Grouping the two by their shared `print of …` prefix would have merged a design rule
with an implementable gap; the ablation separates them 19 / 0. General rule: **ask whether the
argument's MEMBERS are inside the domain. If they are, the refusal is a capability. If the
value has no members in the domain at all, the refusal is the domain.**

### PRINTABILITY is the fourth deferred capability, and the row's own prescription named the wrong LAYER (D401)

**`print` is a capability like `==` and `+`, and it was lost at the pin the same way.**
`tyPrintsAsRef` / `tyPrintsAsUnionBox` are asked of the printed value's type IN THE BODY,
where inside a generic it is a hole — `T` itself, or the `?elem.T` an `x[0]` read derives —
and a hole is neither a ref nor a box, so both floors answer FALSE and every generic `print`
is admitted. The emitter's print ladder is a run of POSITIVE tests ending in an unguarded
`call __print_i32__`, so the instance hands a `(ref $t)` to an `(i32) -> ()` import. Fixed as
the fourth table beside `binCstr*`, `argCstr*` and `escJoin*`, and it needed `tyHasHole`
rather than `tyIsHole` for the same reason D421 did.

**THE ROW SAID `monoInstantiate` AND THE SITE IS REACHABLE — the objection is not that it does
not work, it is which LAYER may state the rule.** D35's own ruling above already settled it
(*`vl check` is what an editor runs*), and D401 sharpens it into a criterion anyone can apply:
**when the whole content of a row is that two spellings ONE ANNOTATION apart disagree, the fix
has to land where they can be made ONE SENTENCE apart.** `monoInstantiate` can only say
`emitProgram:`; the concrete twin says `print of i32[] is type-valid but not yet supported by
codegen`, positioned. A pin constraint says the second with an attribution in front. A fix
that is loud in a different vocabulary from its own control is a fix that leaves the reader to
discover the relationship the row exists to state.

**THE GRID THAT FILED IT COULD ONLY SEE A THIRD OF IT, for the reason D421's could not see its
own shape.** D14's `lengrid.py` varies the OPERATION (`.length` vs `x[0]`) and holds the print
at the element read; it found 3 cells. Holding the operation at `print` and varying the
POSITION instead — the parameter itself, an element read, a field read, `.length` — finds 19,
of which 15 are the bare `print(x)` the row never mentions. **A grid's fixed coordinate is
where its blind spot is**, and the cheap check is to name the coordinate out loud before
believing a family's size.

**`tyPrintsAsRef`'s HEADER ASSERTED THE MISSING GATE.** It read *"nor a `TyVar` (a generic
body's `T` — monomorphization decides its rep at the call site, and the concrete argument is
gated there)"*. Nothing gated it there. A comment that names another site as the one holding
an invariant is a claim with a witness attached, and running it costs seconds.

### The seam is an AXIS of the deferred-constraint question, and holding it fixed hid four of them

**D551, D561 and D572 are one question asked at five places, and the first two grids fixed the
place.** `retgrid.py` varies the declared return type, the body shape, the argument type, the
call spelling and whether the result is printed — five axes, and the DESTINATION is a `return`
in every one of its 630 cells. Vary that coordinate instead and the same defect is at a local
declaration, a re-assignment, a struct field write and an array element write, on both sides of
the hole; `letgrid.py` finds 171 moving cells where `retgrid.py` finds none, because none of
them is a `return`. This is D401's lesson arriving a second time in the same family — **a grid's
fixed coordinate is where its blind spot is** — and it is worth stating separately because the
fixed coordinate here was not an obvious parameter at all. Nobody chose "the destination is a
return"; it was simply what the row that started the family happened to say.

**THE SHARP FORM: a deferred-constraint table answers for ONE seam, so ask what the OTHER seams
do with the same vacuous predicate.** `assignable(i32, T)` is vacuous wherever it is asked, and
by the time D572 landed there were six tables — `binCstr`, `argCstr`, `printCstr`, `escJoin`,
`retCstr`, `letCstr` — each covering one place a hole meets a concrete requirement. Two more are
filed (D581, D582) and both were found by *enumerating the destinations a value can reach*, not
by another sweep.

**AND A GATE INSIDE ONE TABLE HAD THE SAME SHAPE, WHICH IS WHY THE ABLATION EARNED ITS KEEP.**
`validateRetCstrs`' re-deferral — re-record a constraint whose hole substituted to another hole —
asked `tyHasHole(rg)`, the BODY side. That was the entire question when D551 recorded body-side
holes only. D561 widened the TABLE to the declared side and left the gate alone, so its widening
evaporated across one level of relay: `inner<T>` reached through `outer<U>` stayed check-clean
invalid wasm on D561's own landing, beside a one-call spelling that was already loud. **The grid
that owned that table could not see it**, because its `relay` axis puts the hole on the side that
already worked. The transferable check: **when a table is widened to a new side, every gate that
reads the table has to be re-asked about that side** — a widening is not one condition.

### An override whose lost cell prints the RIGHT value needs a different fourth term, and saying so is the honest move

**D561 exempted rather than overrode because its brand cell prints ten right values, and the
coincidence term is the one an override cannot argue around.** D572 met the same shape at the
same seam one node over — `d572o_brandlet_typar`, D561's branded accessor with the return
laundered through a hole-typed local — and it printed `1032`, which is right. It was OVERRIDDEN
anyway, and the difference is not a softer bar: **no capability is lost, only a second spelling
of a capability that remains.** `rowAt` still builds byte-identically through D561's own
exemption; corpus `cmp` is 0 DIFFER / 0 LOST where D561's widening cost two modules; and the
laundered spelling is precisely what D572's row was filed to warn is a relocation rather than a
repair. Exempting it would have doubled D571's residue — the forge reaching a local, a field and
an element as well as a return — and made the eventual `as A` landing bigger rather than smaller.

**The rule this leaves: when the lost cell's VALUE is right, do not stretch the coincidence term
to fit. State which term fails, and carry the override on a named replacement** — here, that the
capability survives, executably, on a line of a `keeps` fixture and in `d551/retgrid.py --price`.
An override argued on four terms where one plainly does not hold is how a bar stops meaning
anything.

## The `runs → not-runs` veto is overridable, and the override must be ARGUED IN THE ROW

**`CLAUDE.md` makes `runs → not-runs` the one condition the standing gate stops the world for,
and that is right: a program that worked and now does not is the failure a merge gate exists to
catch.** It is not, however, a proof that the program was *correct*. D426 is the worked
instance — four cells that ran only because `boolean | null` and a string litunion's `K | null`
happen to be bit-compatible with the i32 default an UNSUBSTITUTED `T | null` lowers to. The
emitted signature was for the wrong type in all four; the same source one binding over is
check-clean invalid wasm. Refusing them cost four accidental passes and bought 33 silent
miscompiles.

**THE OVERRIDE IS A CONJUNCTION, and all four terms have to hold:**

1. the lost cells run by **COINCIDENCE rather than by rule** — some accident of representation
   makes a wrong lowering happen to work, and the shape has instantiations where it does not;
2. the loss is **LOUD** — a positioned diagnostic, never a silent class. The direction the veto
   is really guarding is `runs → silently wrong`, and this is not that;
3. the price is **NAMED** — the exact cells in `distilled/named/`, so the trade is a number the
   next person can re-grade rather than a sentence they have to take on trust;
4. the reversal is **INSTRUMENTED** — the thing that would buy them back is identified, and a
   named set says when someone has landed it.

**AND IT MUST BE WRITTEN IN THE ROW, NOT INFERRED FROM A GREEN GATE.** In D426's case
`regress.py` does not fire at all, because the four cells were not in the derived corpus until
this landing put them there — so a reader grading the change by its gate output sees `0 runs
lost` and learns nothing. That is the failure mode this rule exists to prevent, in both
directions: **do not read "0 runs lost" as the only shippable outcome, and do not read this
override as licence.** A row that loses a running cell without arguing these four terms is a
row that has not finished measuring.

**THE ALTERNATIVE IS ALWAYS COSTED FIRST.** The narrower floor that keeps D426's four cells
exists and is one constructor smaller — and it leaves 12 of the 33 silent cells exactly as they
were, in exchange for a rule that reads *"reject a type parameter under a constructor, unless
the constructor is `| null` and the binding is one of two"*. A rule nobody can state at the next
site is not cheaper than the price it avoids.

## A parameter FLOOR is a question about the VALTYPE, so `T` under a `=>` is not the same as `T` under `[]` (D426)

**The emitter's parameter floor rejects a bare `T` at every argument rep and accepts `T[]`,
because every rung of its ladder asks about a CONSTRUCTOR — is this an array, a struct, a map,
a scalar — and each of them answers YES about a constructor over an unsubstituted type
parameter.** That is the same IS/CONTAINS confusion as D421's `noteBinCstr` and D422's
`nodeTyIsTyVar`, now at a third site; the reason it keeps recurring is that the narrow
predicate reads correctly at every one of them.

**BUT "CONTAINS" IS TOO WIDE HERE, AND THE GRID IS WHAT SAID SO.** The floor's question is
*does this annotation decide a wasm VALTYPE that the instance might not agree with*. A `T`
under a `TyFunc` does not: a closure parameter is the fat pointer at every instantiation. The
wide predicate turned **14 running cells into rejects** and every one of them was a `(T) => T`
parameter or its `T | null`-at-`boolean` cousin. **The distilled corpus and the corpus byte
comparison were both blind to it** — the change is byte-identical to master on all 1,942
buildable modules either way — so the only instrument that could see it was a grid built for
the family, which is the standing argument for building one before shipping a refusal.

**A REFUSAL WHOSE CELLS HAVE CONTROLS THAT RUN IS A FLOOR, NOT A CLOSE, and the difference has
to be written down or the next person reads the row as finished.** All 33 of D426's silent
cells have a control — the identical program with the lambda's annotation spelled at the
concrete type — that runs and prints the right answer. So what was lost is a LOWERING, and the
loud reject buys only that the loss is visible. The 33 are kept whole in `named/` precisely so
that the day per-pin lambda lifting lands they read `runs` and say so.

**A COINCIDENCE IS NOT A RULE, and pricing it is cheaper than protecting it.** `T | null` as a
lambda parameter runs at exactly two bindings, `boolean | null` and a string litunion's
`K | null`, because both rep as the plain i32 the unsubstituted default picks. All four inputs
of the niche compare agree with the direct spelling, so the programs are not wrong — they are
right for a reason nothing in the source states, and one binding away the identical source is
invalid wasm. Refusing them with the rest of the shape and NAMING the four cells is the
position; keeping them would mean the floor's rule is "reject `T` under a constructor unless
the constructor happens to be `| null` and the binding happens to be one of two", which is not
a rule anyone can hold in their head or check.

## Operator dispatch is decided at the REWRITE, so it may only ask questions the CHECKER has answered (D424)

**`drwWalk`'s `a op b` dispatch gated on `structIndexOfExpr(n.binLeft, ctx) >= 0`, which is a
question about the EMITTER'S LOCAL SLOT TABLE — and that table is filled by the emit pass this
rewrite runs ahead of.** Its `Ident` arm therefore answers for a PARAM, a module-declared
binding, a GLOBAL and a CAPTURE, and not for a plain function-body local. The consequence is a
capability that exists at four receiver deliveries and silently does not at the fifth:
`const a: V = { … }  a < b` inside a function body emitted `i32.lt_s` over two struct refs,
`vl check` rc 0, while the identical program at module scope runs.

**THE FIX IS A CHANNEL CHOICE, NOT A CLASSIFIER EXTENSION.** The self-fn branch needs one bit —
"is the left operand an object" — and the CHECKER already asked exactly that before resolving
the dispatch itself (`opSelfFnTy` runs under `if odsp is TyObj`). So it asks the checker's bank
(`nodeTyIsObj`) and the two stages agree by construction. The FIELD-closure branch needs the
struct table ROW to look a field up in and keeps `structIndexOfExpr`: widening it the same way
would be a claim the emitter cannot cash, and the two branches wanting different things is why
one gate could not serve both.

**THE GENERAL RULE, because this is the second time this shape has cost something.** A rewrite
that runs before a table is populated must not read that table as a PREDICATE. If the question
it needs was answered by an earlier stage, ask that stage; if it was not, the rewrite is in the
wrong place. `opIdxFnAtNode` — the `[]` operator's banked resolution, sitting eight lines below
this one in the same function — is the shape to copy when the checker's existing bank is not
enough.

**AND THE FIXTURE THAT WAS GREEN THROUGHOUT.** `tests/cases/objects/operator-self-method.vl` is
the tree's only operator-declaration fixture and every binding in it is a module global — one
of the four deliveries that worked. A single-position fixture over a feature whose lowering is
position-dependent is not coverage, which is the same finding #1995 records for D188's leaf
table and #1996 for the anonymous-row rung.

## A declaration nothing can reach is refused AT ITSELF, and the reject is DERIVED from the dispatch predicate rather than restated (D444/D445)

**The tree already refused two shapes of unreachable operator declaration and was silent about
two more, and the four had drifted into four different opinions about the same question.**
`parseFuncHead` refuses a quoted NON-operator name (`function "shout"`) because it "would let a
declaration take a name no reference could ever be written for"; the pass-1 hoist refuses a
mis-arity `"[]"` "so a malformed declaration is reported once, at itself, rather than at every
use site that fails to resolve"; `indexOpDeclName` refuses an un-annotated `self` because the
declaration name cannot be minted without it. D444 (any arity but 2 on a binary operator) and
D445 (a `"[]"` over a built-in indexable receiver) are the same sentence and were `vl check`
rc 0 with the built-in's answer coming back. **The ruling is that "no reference could ever be
written for it" is one rule with four sites, not four rules.**

### Which SEAM a gate belongs at is decided by what the predicate needs to read

**D444's gate is syntactic and D445's is not, and getting that backwards was the standing
belief.** D425's row records D46's parser home as unable to host a declaration-site reject
because "that arm has the NAME spelling and not the resolved type of `self`". That is exactly
right for the index operators — an ALIAS (`type Xs = i32[]`) and a NEWTYPE (`type Xs = new
i32[]`) are both swallowed and neither is spelled `i32[]`, and a generic `function
"[]"<T>(self: T[], i: i32)` is swallowed too — so D445 sits at the pass-1 hoist beside the
arity check, keyed on `hpt[0]`. It is exactly *wrong* for the unary case: arity is a property
of the token stream, `parseFuncTail` already holds the parameter list because
`indexOpDeclName` inspects it there, and no resolved type is involved. **So D444 was never
blocked behind D402 and D445 never could have been parser-resident.** Ask what the predicate
reads before deciding where it lives; "the other half of this family lives over there" is not
an argument.

### The reject must be the NEGATION of the dispatch gate, spelled by calling it

**D445's gate calls `tyBuiltinIndexable` — the same function `checkIndexNode` consults to
decide the swallow — rather than re-listing arrays, maps and strings.** The set refused is then
by construction the set the checker walks past, and the two cannot drift: a receiver added to
the swallow becomes refusable in the same edit. Re-listing would have produced a second opinion
about the same question, which is precisely the failure the four sites above had accumulated.

**It subtracts exactly the two arms the dispatch predicate answers `true` for out of CAUTION
rather than knowledge.** `tyBuiltinIndexable` returns true for an un-pinned hole and for the
error type because at a USE site the conservative answer is "leave it to the built-in arms". At
a DECLARATION site the polarity inverts: refusing must require *knowing* the declaration is
dead. A hole is a live receiver (`function "[]"<T>(self: T, i: i32)` dispatches for every
non-built-in receiver, measured) and an error type has already been reported at the annotation.
**A predicate reused across a polarity flip needs its caution arms named and removed, not
inherited.**

### A row's TITLE is not its population, and the grid is what says so

**D445 was filed as "a `"[]"` declaration over a non-object `self` is silently ignored" and a
gate written from that sentence would have condemned six working receivers.** Measured over 15
receivers, `i32`, `f64`, `i64`, `boolean`, `new i32` and the union `i32 | string` all dispatch
correctly and print the declaration's answer; only arrays, maps, strings and aliases/newtypes
over them are swallowed. The six are kept in `distilled/named/` as boundary cells for that
reason. The same round corrected the brief that scheduled the work, which read the row's "std
declares four index operators" as "std's four index operators are inert" — they are nominal
structs (`new { base, length }`), they dispatch, and the emitted module calls them
(`(return_call $26)` into `getI32`). **The row said std was a live CUSTOMER a gate must agree
with; that is a different sentence from "std is broken", and only running it separates them.**

**THE COMPRESSION IS THE FAILURE MODE, NOT THE ROW.** The row said `"[]"` is inert at
`self: i32[]` and `self: string` — built-in indexable receivers — and that the STRUCT control
dispatches. std's views are structs. Compressing that into "std ships four inert operators"
inverted which half of the row std was on, and then supplied the reason to prioritise the work.
A one-sentence summary of a row that distinguishes a population from its control cannot be
trusted to have kept the distinction: **re-derive the population from the row, and then run
it.** `tests/cases/std/buffer-view-bracket.vl` was already in the tree and prints
`1.5 2.5 7 9 3.25 11 6 4` — cross-module dispatch on the nominal brand, both spellings,
compound writes. The refutation cost one command.

**This was the second brief-level premise refuted the same day by an agent running the code
instead of reading about it**, which is the point worth keeping: a premise arrives with the
authority of whoever wrote it and none of the evidence, and the cheapest moment to test it is
before any work is scheduled on it.

### The runs-lost override, and what the boundary half of a named set is for

73 grid cells go `runs` -> loud check reject, and the four-term conjunction above holds: they
run by coincidence (each cell's own body says 99 and the program printed the built-in's
answer — the `check-clean silently wrong` class the census records ZERO of in 250,238 cells),
the loss is loud at the declaration's line, the price is named, and the reversal is
instrumented. **The instrumentation detail worth copying is the EXPECTATION.** Each named cell's
expected stdout is the DECLARATION's answer, never the built-in's, so the cell's grade answers
"did dispatch happen?" rather than "did the program run?". Two consequences follow, both
wanted: a price cell whose reject is ever lifted grades `runs but wrong value` — silent, and
reported — instead of quietly reading `runs`; and the eight D425-inert boundary cells baseline
as `runs but wrong value` rather than `runs`, so the day D425 lands its own gate they REPORT
instead of BLOCKING on eight runs-lost. The neighbouring `d425c*` set records the built-in's
answer and so baselines as `runs`; that is the older convention and this set deliberately
departs from it.

**36 of the 111 named cells did not move at all, and they are the more important half.** A
price set says what a candidate cost; only a boundary set says the candidate stopped where it
was supposed to. Here one comparison carries it: `d444_lt_a2_obj` grades `runs:true` (the
declaration's answer, dispatch) against `d444_lt_a2_i32` at `runs:false` (the native answer,
D425's inertness).

### The grid was wrong twice, and both times it looked fully populated

**Neither bug produced a gap, an error or an odd column. Each produced a complete table of
plausible verdicts answering a different question from the one asked** — which is the only
failure mode of a probe that a green-looking run cannot distinguish from success.

**(1) The use site was held constant while the declared operator varied.** The first generator
carried a per-RECEIVER use expression (`print(a - b)` for the struct row) and looped the
operator over `-`, `+`, `*`, `/`, `<`. The `<` cells declared `function <(self: V, other: V)`
and then measured `a - b`. All of them graded; none graded its own declaration. This is
#2001's `cell(): i32` wrapper one level out — there the harness's return type reported the
mismatch instead of the operator's, here the harness's operator did. **The tell is structural:
a cell's source should not require finding the operator in two places to read.**

**(2) The `<` body returned the answer the built-in already gives.** Every operand pair is
`7 <op> 1`, so native `<` is `false` — and the declaration returned `false` too. The two cells
that are the entire arity-2 dispatch/inertness discriminator, `d444_lt_a2_obj` (must dispatch)
and `d444_lt_a2_i32` (must not), both graded `runs:false`. Twelve cells were reporting a
measurement they could not have made. Changing the body to `true` is the whole fix, and it is
what turned the boundary half of the named set from decoration into evidence.

**BOTH BREAK ONE RULE: a cell's expected answer must differ from the answer it would give if
the thing under test did nothing.** That is why `grade()` records `runs:<stdout>` rather than a
bare `runs`, and why every cell's body disagrees with the built-in on its own operands — the
discipline D425's row already recorded costing its grid eight cells, applied one axis further
in. A grid that cannot fail is not a measurement, and neither of these announced itself.

### Stating that rule did not stop the next grid from breaking it; RUNNING it did

**The rule above was written down, and the very next grid over the same family broke it
again.** D471/D425's generator (`scripts/silent-sweep/d471/opdeclgrid.py`) ordered its string
and literal-union operands ASCENDING while its numeric ones descended, so `"ab" < "cd"` is
natively `true` — and the `<` declarations returned `true`. Thirty-two cells could not have
distinguished dispatch from inertness. Nobody noticed while writing the table; the run did.

**The fix is to give every cell a DO-NOTHING CONTROL and compare against it, rather than
against a remembered native answer.** A control is the cell's program with the DECLARATION
DELETED and nothing else changed, so it IS, by construction, the answer the cell would give
if the thing under test did nothing. `--verify` then grades every control and FAILS on any
cell whose control answer equals its declaration answer. That turns the rule from a thing an
author must hold in mind while writing a table into a thing the instrument refuses to run
without — and it is what caught the 32.

**It also improves the grade itself.** With both answers in hand a cell reads `dispatch`
(printed the DECLARATION's answer), `inert` (printed its own CONTROL's answer), or `loud`,
instead of a `runs:<stdout>` a reader has to interpret. The `inert` verdict in particular is
no longer an inference: it is an observed equality with the program that has no declaration.

**The one shape the rule does not apply to, and why saying so matters.** Four of the pins in
that grid have NO operator site at all — they declare and never use — so cell and control
print the same thing by construction and differ only in whether the program compiles. Their
measurement is `accepted` vs `loud`, not a value comparison, so there is no answer for the
control to accidentally supply and `--verify` skips them. A blanket application of the rule
would have flagged the very cells that carry the most load: `d471_pin_inter` is the only cell
in 770 that can see the declaration gate by itself, and it is what pins the intersection
look-through against a future narrowing.


## A blocker that survives re-measurement can still be the wrong blocker

**D425 was left open twice on a sentence that was TRUE, and closing it required noticing the
sentence was about the wrong thing.** The filed blocker was *"`self` must be an object type"
is FALSE for `self: AB`* where `type AB = {a:i32} & {b:i32}` — because `AB` IS an object and
the site refuses to dispatch over it anyway. That was re-measured on both sides of #2004,
found live, and re-measured again on master `2f1f0621`, found live a third time. Every
re-measurement agreed, and every one of them was answering "does the SITE dispatch over an
intersection?" when the question the gate needed was "can the DECLARATION tell that `AB` is
an object?".

Those are different questions and they have different answers. `intersectTy` merges `{a}` and
`{b}` into a real `TyObj`. `declaredTyOfName` then wraps it: `singleAliasMemberTyIx`'s `TyObj`
arm is gated on `isPlainAliasRef`, false for an intersection's right-hand side, so the alias
stays an opaque one-member `TyUnion` — **deliberately, so the emitter can intern `AB` as a
named struct**, and the comment there says as much. The object is one field access away from
any code willing to look.

**The asymmetry is what makes the look-through safe at the declaration and unsafe at the
site.** At the declaration the predicate decides whether to REFUSE, so seeing through the box
can only accept more; a box it fails to see through costs a missing reject, never a false one.
At the site the same collapse would diverge from the emitter's `singleMemberAliasTyIx` twin,
which is the divergence `declaredTyOfName` is written to prevent — that is D402's row and it
is untouched. **Transferable: when a blocker keeps re-measuring live, check whether the probe
and the gate are asking the same question before inheriting the conclusion.** Three
re-measurements of a true sentence bought nothing; one look at what produced it closed the row.

**Runner-up predicate, recorded so nobody re-derives it.** The row's own measurement said the
silent class is "exactly a `self` type that has a native lowering for the operator", and
`binOpDefinedFor` is that predicate, already written and already documented as the single home
for "`checkBinary`'s accepted forms". It is the wrong POLARITY. Its stated default for an
operator it does not model is `true` ("no false reject"), which is safe when a `true` PERMITS
and unsafe when a `true` REFUSES: gating the reject on it refuses `function "^"(self: V,
other: V)` over a struct — which dispatches today — and says something false about `^` over
`string` besides. A shared predicate is only reusable in the direction its default was chosen
for.

**And asking what that default ANSWERS, rather than only whether it could be reused, found two
live defects** — filed as D492 and D493, both D35's sentence at operators D35's own fix does not
reach. `binOpDefinedFor` is what `validateBinCstrs` adjudicates a deferred hole constraint
through, so every `true` it returns is an ACCEPTANCE at a generic call site: `^` is unmodelled,
so `function g<T>(a: T, b: T) { a ^ b }` pinned at `string` is `vl check` rc 0 over a module the
engine refuses, while the identical body annotated `string` is a loud checker reject; and the
`%` arm, which does exist, asks only `isNumeric`, so `f64` remainder reaches
`emitProgram: operator '%' has no f64 form` where the direct spelling is a positioned
`operator '%' is integer-only`. **The transferable step is the cheap one: when a predicate is
rejected for reuse because of its default, spend the five minutes finding out what that default
is currently answering.** The reuse question was a dead end; the same reading of the same six
lines was not.


## An ACCEPTANCE must ride the pin too, and it does not ride the same channel a refusal does

**D35's rule — "a rule enforced at `vl check` and lost at monomorphization is a rule about
spellings" — has a mirror, and the mirror needs a different layer.** `xs.indexOf(nd)` at
`T = string | null` was `vl check` rc 0 over a module the engine refuses while the identical
`a == b` written directly ran and was correct. Same sentence as D35, opposite sign: not a
refusal the pin dropped, an ACCEPTANCE it dropped. (D42, #2217)

`binEqNulNiche` decides whether a `==` needs the null-guarded lowering, and it asked one
channel: the type the CHECKER banked on the operand node. `monoCloneBody` rebuilds only an
instance's STATEMENT SPINE and **shares every leaf expression**, so one `self[i] == needle`
node serves every instantiation of `indexOf<T>` and the type on it is `T` however the instance
was pinned. `eqCmpKindOfTy` answers `""` for a `TyVar`, which is correct about the type
variable and says nothing about `string | null`.

### Why the deferred constraint is the WRONG channel here

D35's fix rode `noteBinCstr` / `validateBinCstrs` and placed the gate at `vl check` **because
`vl check` is what an editor runs**. That reasoning is about a RULE. This row has no rule to
state — the checker is right to accept, `eqRefusals` is right to stay silent, and there is
nothing a call-site gate could say. What is missing is a LOWERING, and a lowering can only be
chosen where the instance exists, which is emit. **The transferable form: "state the rule at
the earliest layer that can see the instance" and "choose the lowering at the layer that emits
it" are the same principle, and they land in different files.** Checking whether the existing
channel fits before building one is the step, not assuming it does because the previous row's
did.

### The second channel was already written, and so was the precedent for asking it

The emitter's rep classifiers — `exprNullableString`, `exprNullableRefNiche`, `exprNulClosure`,
`exprNullableList`, `exprNulScalarListKind`, `exprNullableRefArray` — are `fnIx`-SCOPED, and a
monomorphized instance IS its own emitted function with its own parameter kinds, so they answer
per instance where the node cannot. `isNumRecvBaseName`, in the same file, has exactly this
two-channel shape for an `is` receiver and its header already says why: *gating on the node's
banked type alone cannot see an instance at all.* `binEqNulNiche` was a one-channel consumer
that predates it. **The `*OfTy` twin was written; the question was which caller had not asked.**

`eqCmpKindOfOperand` is the one home, and it is **gated on `nodeTyIsTyVar`, not on "the first
channel said nothing"**. `eqCmpKindOfTy` answers `""` for six different reasons and five of
them mean *the existing dispatch owns this rep and is already correct* (a literal, a literal
union, a value-union box, the two SENTINEL-repped nullables, the error hole). Only the type
variable means the question was never answered. A gate on the empty ANSWER rather than on its
REASON would have wrapped a null guard around compares that already null-test correctly — the
`fnAssignKindGuard` shape from #1938, where a "no answer" sentinel is not neutral.

### State the admission on the MECHANISM'S boundary, not on the grid's enumeration

The closing grid contained `string | null` and `i32[] | null`, and the first draft of every
paragraph about this change named those two. **The fix is `eqCmpKindOfNulInner`'s whole niche
family** — `string[] | null`, `boolean[] | null`, `i32[][] | null` and a nullable CLOSURE moved
with them, inline and through a declared alias, measured one file per cell on both compilers.
A grid enumerates CELLS; a fix has a BOUNDARY, and the boundary is stateable here because the
compiler already names it in one function.

The cost of getting this backwards is not symmetric. Naming two reps where five moved
UNDER-promises, which is the direction `std/array.vl`'s ledger has been wrong in exactly once
before and calls out as the one that "cost a caller a capability it already had". It also hides
a failure-kind fact: the two the grid ran were `check-clean invalid wasm`, and the `nulreflist`
and `nulclosure` cells were a check-clean runtime TRAP, so "all invalid wasm → runs" is true of
those sixteen cells and is not the family's shape.

**And the sixth token is a compound-claim trap.** A draft filed `Circle | null` beside
`i32 | null` as "a BOX and a struct-eq shape, not niches with compare cores" — false for the
first, and false against three readings of this change's own diff (`eqCmpKindOfNulInner` answers
`"nulstruct"`, `eqKindIsNulNiche` lists it, and the new second channel has an explicit
`nulstruct` arm). Two `Circle | null` bindings compared directly run and are correct; what
refuses the generic route is `emitProgram: ref valtype with no interned shape`, isolated by a
hand-written generic **containing no `==` at all** that fails identically and RUNS at
`T = Circle`. A nullable STRUCT cannot be a generic ARGUMENT and the compare is never reached.
**Two cells failing by two mechanisms were given one shared reason.** Both found by the
`std-api-reviewer` pass, which is the sixth consecutive time it has produced the closing
change's next correction on this module.

### Both consumers of the answer must get the channel, and the measurement says so

A `==` needs two decisions: whether there is a GUARD (`binEqNulNiche`) and which CORE goes
under it (`eqCoreKindOfBin`). A first cut wired the channel into the guard alone, and
`i32[] | null` then reached `emitNulNicheEq` with the core selection still answering -1: eight
`std:array` cells became a loud `emitProgram: `==` over this operand rep has no compare core`.
Silent → loud where silent → **runs** was the win, which is the failure this row's grading is
written to catch. Both read the one home now, which also keeps the frame-reservation scan
(`leqNoteBin`) in agreement with the emitter by construction, as its own header requires.

## A capability rule the pin states must be a rule SOMEBODY holds

D35's `==` gate re-asked a question the checker already answered. **`binOpDefinedFor`'s `+` arm
was doing something different and worse: stating a rule at the pin that existed at neither
spelling.** "Any two arrays are a list concat" is not what the emitter does — there is exactly
ONE concat core, `emitListConcatI`, the i32 backing — so `Circle[] + Circle[]` was
check-clean invalid wasm through a generic, and written directly it fell past the list arm into
the NUMERIC tail and emitted `i32.add` over two refs. (D44, #2217)

`concatRefusal` is the one home, read by `checkBinary`'s concat arm, by `binOpDefinedFor` and by
the emitter's floor (`binConcatHasNoLowering`, the `+` twin of `binEqHasNoLowering`). Three
things about it are worth keeping:

* **Its accept set is not the `==` one, and reusing that would have removed a capability.**
  `eqCmpKindOfArrayElem` answers "none" for a literal-union element, and
  `("a"|"b")[] + ("a"|"b")[]` concatenates correctly today. Two operators, two boundaries, two
  functions. The `boolean | null` / `i32 | null` pair makes the same point inside one type
  constructor: the first is the i32 sentinel 2 and concatenates, the second is a value-union
  BOX and does not, so "a nullable element" is not the axis.
* **It DEFAULTS TO ACCEPT**, which is `binOpDefinedFor`'s own stated convention. Every rep it
  refuses was RUN at both spellings first; a rep it has not measured keeps today's behaviour.
  An over-refusing capability rule removes something a caller has.
* **The pin's arm must mirror `checkBinary`'s ORDER, not just its answers.** `binOpDefinedFor`
  softened literal unions before its string test and `checkBinary` softens after both the
  string and array arms, so `T = "a"|"b"` was admitted at the pin and refused written out. Two
  functions computing "the same" predicate in a different order are two predicates.

### The false reject a capability rule widens, and the axis that hid it

Tightening `+` made a **pre-existing** leak fire in a new place: a call through a bound local
names no callee, so it adjudicates EVERY generic's constraints, and `substTyDeep` matches
TyVars by NAME. On master, `const g = idT  g(structList)` already reports `myIndexOf`'s `==`
refusal — a generic that compares nothing, refused for a comparison in a function it never
calls. That is #1946's rung 2 at the one callee delivery its fix could not reach. A local bound
to a bare Ident naming a declared function now NAMES that declaration (`fnAliasScopes`, a table
separate from `fnDeclScopes` because a function VALUE must keep its exact-arity gate), so
`const f = addT  f(c, c)` keeps its own true positive and only the cross-generic leak goes. A
closure PARAMETER has no initializer to resolve and is deliberately untouched.

**The 741-cell grid did not find it; a fixture did.** #1946 records that holding the CALLEE's
delivery constant cost it a round. This grid varied the callee's delivery at five values and
held something else constant: **every cell had ONE generic in the file.** A cross-generic leak
is invisible to a grid with no siblings. The transferable form is one level up from #1946's —
enumerate what the PROGRAM contains, not only what the call site says.

## `==` and `!=` are NOT overloadable, and the diagnostic that asked for one is retired with it

A `function "=="` declaration parsed, type-checked, and was silently discarded: `checkBinary`
returns on the equality arm before the operator-dispatch tail and `drwDispatchOp` excludes
`==`/`!=` at the emitter, so the structural compare ran and the program printed the answer the
declaration was written to change. Meanwhile `eqRefusals` ended its refusal with
`— define a `==` operator for it`. **A `vl check`-clean WRONG VALUE, with a diagnostic
prescribing the thing that produces it.** (D46, #2217)

**Rejected rather than implemented, and the deciding measurement is who the diagnostic's
customer is.** The clause fires on a CONTAINER — `K[]`, `Circle[]` — and a container's compare
recurses through `emitStructEqRec`, `emitListEqRCore` and `emitListEqSCore`, three cores with
no per-element dispatch hook, and through `isEquatable`, std's four `needle: T` exports and the
map key. Honouring the top-level struct case alone would leave the message still prescribing
something inert one container deep, and would create a NEW silent class: a user `==` that some
consumers honour and others do not. **A half-implemented dispatch is worse than none, because
the half that works is what makes the reader trust the half that does not.**

Two rules follow, and the second is the one that makes this a close rather than a move:

* the reject lives in the PARSER, at `parseFuncHead`, because that is where the symbol-token
  spelling (`function ==(…)`) and the quoted one (`function "=="(…)`) converge on one `name` —
  one home, four spellings with `!=`;
* **the diagnostic changed in the same commit.** `— define a `==` operator for it` became
  `— compare a projection whose components are value-comparable, and only one that no two
  distinct values share`. Leaving the old clause beside the new reject would be strictly worse
  than the state the row was filed against: a message recommending a declaration the compiler
  now refuses. **A prescription and its implementation are one change.**

**A REPLACEMENT PRESCRIPTION INHERITS THE ORIGINAL'S QUALIFIERS, and the first draft dropped
them along with the sentence's predicate.** `std/array.vl`'s ledger has one entry it calls its
worst-shaped — the only one that ever printed a WRONG ANSWER rather than a wrong claim — and it
is this remedy stated UNQUALIFIED ("project to a key and search that", where a first element is
not a key). A diagnostic that imports the unqualified half hands the defect to every caller, and
for `==` it is worse than for a search: two distinct values sharing a projection compare EQUAL
rather than merely being found at the wrong index. The same draft also ended on "…whose
components are" and stopped — **a sentence with no predicate that passed every gate**, because
`@error` matches a SUBSTRING and the fixture's directive stopped before the clause. One
directive now runs to the end of the sentence. **A message is a claim, so it needs a test that
reads all of it.**

Nothing in the tree declares a `==` or `!=` operator function, so the reject costs no
capability. The 12 grid cells it moves `runs → loud check` are an `i32` comparison beside an
inert declaration: the answer was right, and it was right only because the declaration did
nothing.

## A loud reject's BOUNDARY is where its family's silent cells sit — and a reject with a fixture is a PIN, not a defect (D402, D441, D442)

`type AB = {a:i32} & {b:i32}` makes `const c: {a:i32, b:i32}[] = [{a:1,b:2}]` a loud emit
reject, and the alias is never mentioned by the annotation that fails. Filed as D402, it looks
like an unexamined defect. It is not: `tests/cases/structs/struct-alias-union-inline-elem-array-floor.vl`
is an `@emit-error` fixture whose whole purpose is to keep the reject, written after a
destringify slice opened the gate once on a dual-run that read 1,029 agree / 0 disagree while
being blind to the pairing that matters. **A row that does not name its own pin invites a
re-lift**, so the first thing a closer grades is whether a fixture already answers the
question.

**The mechanism was recorded backwards, and the probe is what said so.** The row said the
element tables hold two rows for one layout. Folding the resolution into `checkArrName`'s own
failure message reads `row=AB via=bridge NOTDECL` at every rejecting cell: there is ONE row for
the layout — the dedup is the ingredient — and `shapeElemDeclaredStructIdx`'s trailing
`nameIsStructDecl` gate closes on it because a canonicalized object intersection is a
one-variant `UnionDecl`, not a `TypeDecl`. Five of nine probed cells never reach the reject at
all, which is the half a message alone cannot report.

**The lift candidate is measured clean on every population reachable without a full census, and
is still refused.** Corpus `cmp` byte-identical over 2,378 modules (0 DIFFER, 0 LOST); the
distilled corpus loses 0 `runs`, moves 0 classes `→ silent`, and turns **399 census cells** from
loud emit reject into `runs`; a 103-cell cell-matched grid moves 21 cells, all to `runs` with the
RIGHT answer, 0 lost and 0 → silent. The pin's stated harm — a shape-armed union routed into the
union-arm narrow machinery — does not reproduce, because with no declared twin the gate never
fires at all. **That is a real result and it is not a licence.** An emitter accept-set widening
over a gate with a fixture and a header owes its own `rep-fuzz-check.sh`, its own mono grid and
a re-derived census; folding it into a row-settling change is how the 1,029/0 dual-run got
written the first time. The measurement is banked as the named set
`d402-intersection-elem-gate` so the next attempt starts from it.

**The generalisable finding is where the silent cells were.** D402's reject reaches eight
positions and misses two; both misses run and both are correct. One step past the boundary,
with a SECOND declaration or a SECOND spelling in the same program, are two check-clean
invalid-wasm cells:

* **D441** — two intersection aliases of one layout, both as ref lists. The STRUCT table mints
  one row per alias NAME (`type 0`, `type 1`, identical layouts, distinct wasm heap types); the
  REF-LIST table dedups on LAYOUT and mints one array whose element is `(ref null 0)`. So
  `q[0].b` applies `struct.get 1 1` to a `(ref 0)`. **Two tables, two different keys, one
  program.**
* **D442** — an alias ref list assigned into a structurally-spelled field list, at exactly the
  struct-FIELD position D402's reject does not reach. Two ref-list wrappers for one layout and
  no coercion between two spellings the checker's own hint calls one type.

So: **grade a loud row's neighbourhood at the positions the reject does NOT reach.** That is
where a silent sibling can exist, and it is the only place it can.

**LANDED 2026-08-28 (#2004) — and this section got two things wrong.** The refusal above was
right about the *owed work* and wrong about the *reason*, and it is worth recording which is
which, because the second error would have survived indefinitely.

*One:* "the pin's stated harm does not reproduce, because with no declared twin the gate never
fires at all" — the cell is not an emit reject on either side. It RUNS, correctly, on base and
on the lift. The conclusion held and the sentence supporting it did not, which is exactly the
failure mode a measured close is supposed to prevent. What replaced it: a poison probe at the
gate fires on **3 of the 2,386** corpus modules that predate this change — the pin plus two
whose resolved row really is anonymous — and those two build BYTE-IDENTICALLY with the gate
lifted, so the reach is live and the answer does not move; a 10-cell grid of the protected
population moves nothing. **A pin
whose premise is refuted is a pin to retire with its evidence.** The fixture keeps its path and
its program, becomes `@run`, and carries the measurement in its header.

*Two:* D441 and D442 were filed as "not moved by the candidate" with an unbuilt price ("the
ref-list table keys on the ELEMENT ROW, which mints a second array type per alias and costs
module size"). Both were true of THAT candidate and neither was the fix. Their root is D402's
one gate over: `internShapeAs`'s D0 recorder banked the ALIAS name's arena type — a
one-variant `UnionDecl` — so `slotCanonId` returned the "never merged" -1, `buildStructTwins`
tests that key FIRST, and no struct-alias-union row had ever been compared against any other.
Recording the SHAPE's type instead closes D441, D442 AND D443, costs nothing on the corpus
(2,391 modules, 1,948 identical, 0 DIFFER, 0 LOST) and is the same degenerate `sTyIxOfNameTy`'s
generic-application arm was added for. **When a row's price is "unbuilt", the number to
distrust is the price, not the row.**

---

## A rung can score ZERO on every population you can derive and still be the reason the change is sound (D442)

The D441/D442/D443 fix is one line: record the shape's arena type at the row mint instead of the
alias name's. It ships with a second rung that closes no inventory row, moves no cell of the
distilled corpus, changes no corpus module's bytes, and would read as gold-plating in any diff.

It is what stops the one line being a miscompile. Two struct rows collapse to one wasm heap type
only when their field SEQUENCE matches, and `structFieldCodesEq` compares field CODES
positionally and never NAMES. `collectS`'s `TypeDecl` arm has canonicalised field order against
an existing same-fieldset row since `xfail-miscompile-permuted-struct-fields.vl`. `internShapeAs`
— the SECOND mint site, one layer down — never did, and **could not be caught doing it, because
its rows had never been eligible to merge in the first place.** The moment they were,
`type AB = {b:i32} & {a:i32}` beside a `{a:i32,b:i32}[]` field merged with `a` and `b` in
opposite slots and went from check-clean invalid wasm to check-clean **WRONG VALUES**.

Three things follow, and the third is the one that generalises.

* **A dormant gap is not a small gap.** The omission had zero observable consequence for as
  long as the guard above it declined, and full consequence the instant it stopped. Opening a
  merge, a dedup or an accept set means auditing every invariant the *closed* path was
  vacuously satisfying — the reordering rule was written down, tested and shipped, and still
  only covered one of two mint sites.
* **The grid found it and no derived population could have.** One cell of 151 — the permuted-arm
  crossing, which exists in that grid only because reversed arm order was an axis. The corpus is
  blind to it (nothing declares a permuted same-layout pair), and the distilled corpus is blind
  to it (the class did not exist to be collapsed). It is now kept whole at
  `distilled/named/d402_permuted_arm_field_alias.vl`, which is what `named/` is for.
* **Ablate for LOAD-BEARING, not for effect.** The eight-subset ablation table shows the rung
  changing nothing on every row and every graded population; read as an effect table it is
  deletable. Read as a *soundness* table — R1+R2 has a silent cell, R1+R2+R3 does not — it is
  mandatory. **A rung's ablation column is evidence about what it BUYS, never about whether it
  can come out.**

---

## An operator reject's PLACEMENT is a language decision, and its price is counted in DISPATCH GATES, not in gates (D425, D443, D444, D445)

`function "+"(self: i32, other: i32)` parses, type-checks and is silently ignored: `checkBinary`
reaches `opSelfFnTy` only under `if odsp is TyObj`, so a `self` that can never be an object is
unreachable by construction. That is D46's shape at the nine other operators, and D46's answer —
reject at the declaration — is the right shape. **What was wrong was the price**, and the row
now carries the corrected one rather than a patch.

**Three dispatch gates, three predicates.** A declaration-site reject has to be the negation of
the gate that would have reached it, and there are three of them with three different rules:
BINARY dispatch asks `T.tys[lt] is TyObj` at the site (and must keep accepting `self: T`, which
DISPATCHES at an object site, and the un-annotated `function +(self, b)` the tree's own fixture
uses); `"[]"` / `"[]="` resolve by the RECEIVER'S type through `opIdxBindGen`, a different rule
with `std/buffer.vl`'s four exports as live customers (D445 — the same inertness holds there,
and D425's price rested on a false "nothing in the tree declares one"); and UNARY has no
dispatch path at all — `checkUnaryNode` never looks and `opSelfFnTy` requires arity 2, so a
one-parameter declaration is inert at EVERY receiver while `compiler/lint.vl` records in its own
words that it dispatches (D444). **Three components disagreeing about whether a feature exists
is a price, not a detail.**

**The call site is the wrong layer, and a program says so.**
`function "+"(self: i32, other: i32): i32 { return self + other }` runs today, and its own body
is an i32 `+` site: the narrowest site-reject that catches this row refuses the declaration it
is complaining about, refuses every unrelated arithmetic site in the same program, and points at
a line that is not the bug. D46 put its reject in `parseFuncHead`; that home cannot host this
one, because the deciding input is the RESOLVED type of `self` and the parser has only its
spelling.

**And the binary predicate cannot be spelled honestly yet.** `type X = A & B` is invisible to
five of the nine object/struct gates measured against its plain-struct twin (D443), including
this one: `function "+"(self: AB, …)` over `AB` operands is `operator '+' is not defined for AB
and AB` while the structural spelling of the same shape dispatches. A declaration-site gate
saying "`self` must be an object type" would freeze a factually false sentence into the compiler
for a declaration that is entirely about an object. **D402's root is a prerequisite, not a
neighbour** — which is why D425 stays open with a price rather than closing with a patch, and
why D444 does not: its predicate is arity plus the operator name, both of which the parser
already has.


---

## A MIRROR is a claim about ORDER as well as about predicates (D492, D493)

`binOpDefinedFor`'s header has said, since it was written, that it "Mirrors `checkBinary`'s
accepted forms". For the integer-only family it mirrored neither the predicate nor the order,
and the two failures had different outcome classes — which is why D492 and D493 were two rows
and one edit.

**The predicate half.** `checkBinary` rejects `& | ^ << >> >>>` and `%` on a float operand in
one arm, under a comment beginning "BITWISE / SHIFT / REMAINDER are INTEGER-ONLY" and a 12-line
rationale for why float remainder cannot be lowered by the `a - trunc(a / b) * b` identity. The
pin's copy of that rule had `%` in the plain arithmetic arm asking `isNumeric` alone (true of
`f64`, D493) and had no arm at all for the six bitwise/shift names, which therefore fell to the
function's documented `true` tail (D492). **The rule was written twice and one copy was wrong.**
`binIntOnlyOp` and `binFloatOperandPair` now hold it once, read by `checkBinary`'s reject and by
the pin's mirror, so adding an operator to the family reaches both sites or neither.

**The blocker was the row's own false sentence, and it is the transferable part.** D492 refused
to take the fix because modelling `^` "means deciding what `^` IS … a statement about the
language a defect row should not make on its own". That sentence is what kept the row open, and
it was wrong: `checkBinary` had already decided, in writing, with a rationale. **When a row
declines a fix as a language question, check whether some other layer has already answered it —
a mirror that is out of date is not a design decision waiting to be made.** The cost of the
mistake was one PR, and the same mistake in the other direction (taking a real language question
in passing) would have been worse, so the check is the cheap half of the discipline rather than
an argument against caution.

**The ORDER half, which a predicate-only mirror gets wrong.** `checkBinary` reaches the
integer-only rule only AFTER its operator-dispatch arm, so an object receiver with a `^`
overload is decided there and never asks this question — and it lowers: a
`function "^"(self: V, other: V)` at a pinned hole prints its own answer today. A mirror that
copies the predicate and not the position is a FALSE REJECT for those programs, and the ablation
priced it at 2 grid cells — and that number is the NAIVE variant built and graded, not an
estimate off the table, which matters because the first estimate was 6. This is the second time
this exact shape has been recorded in this
one function: the `+` arm carries a comment explaining that it must read the UNSOFTENED types
because `checkBinary` softens AFTER its string and array arms (D44). **Two arms, same lesson —
mirroring a decision procedure means mirroring where in it the question is asked.**

`objOpDispatchTy` is that deferral, and its shape is deliberate. `checkBinary` asks
`opSelfFnTy`, which takes the right operand's NODE index, emits diagnostics and can re-enter
`checkNode` — none of which belongs in a pure predicate. So the deferral asks the same two
routes (a free `self`-function whose first parameter is named `self`, or an operator FIELD) from
TYPES ALONE, and stops before every condition that exists only to produce a diagnostic. That
makes it **deliberately the weaker question — "a dispatch is available", not "the dispatch
type-checks" — and the asymmetry is the whole justification**: a false TRUE leaves a cell exactly
as silent as it already was, a false FALSE is a check reject for a program that runs. When a
pure predicate has to approximate an impure one, approximate in the direction whose errors are
the ones you already have.

### #2007's runner-up predicate was right about the danger and wrong about the conclusion

The parent PR rejected `binOpDefinedFor` as D425's reject-gate because "gating the reject on it
refuses `function "^"(self: V, other: V)` over a struct — which dispatches today". That
observation is correct and it is exactly the veto this landing had to route around. What did not
follow is that the predicate was therefore unfixable: the polarity problem is a property of
using it as a REJECT gate for a different question, not of the predicate. Reading the same six
lines with the opposite question — what is this default currently ANSWERING? — produced D492 and
D493; measuring what a naive fix would cost produced `objOpDispatchTy`. **A predicate that is
wrong to reuse can still be wrong on its own terms, and those are two separate readings.**

### The census cannot see this family, and that is checkable rather than probable

`gencensus.py` emits exactly ONE generic declaration across all 250,238 cells —
`function idg<T>(x: T): T { return x }` — and its body contains no binary operator. So no census
cell records a deferred constraint, none reaches `binOpDefinedFor`, and block D (9,000 cells,
graded on both compilers) and the distilled corpus (1,477 representatives) each moved zero cells
at this landing. **A zero from a population that structurally cannot contain the family is not
evidence of safety, and the difference is one `grep` away** — `grep -n "<T>" gencensus.py` is one
line. Report the grep beside the zero; a reader who sees only the zero will read it as coverage.

### The price, and why the override holds

36 cells went `runs` → loud check reject: the bitwise and shift operators over `boolean` and over
a string literal union, through a type parameter. They ran on the REPRESENTATION rather than on a
rule — `true ^ false` printed `true` because the boolean rep is an i32, and `"b" ^ "a"` printed
`a` because the literal union rides two interning indices and `i32.xor` of them lands on a member
— while the direct spelling of every one of them has always been
`operator '^' is not defined for boolean and boolean`. There is no spelling in which a programmer
could have chosen this behaviour; it was reachable only by writing the operand type as a type
parameter. The override is `pingrid.py --price`, which asserts per cell that (a) it ran, (b) its
direct twin is loud, and (c) the twin's refusal names that operator — 36 of 36, and a cell whose
twin RUNS would be a veto rather than a price.

### A grid axis can hide a `runs` cell, and the absence looks identical to safety

The grid's cells come in two BODY shapes: `bind` writes the operator's result to an unused local
and returns a constant, `ret` returns the result. They were expected to be equivalent. They are
not: with an operator overload on the left operand, `bind` RUNS and prints the declaration's
answer while `ret` is check-clean invalid wasm. A one-shape grid would have reported the veto
cell as absent — with `ret` only it never appears, and with `bind` only the residue never does.
**When two spellings of "the same" program are available and cheap, run both; a grid reports a
missing axis as a clean column.**

## A check must FAIL when its population is empty

The do-nothing rule says a CELL's expected answer must differ from the answer it would give
if the thing under test did nothing. This is the same principle one level up: **a CHECK's own
result must differ from the result it would give if the check did nothing.**

Found 2026-08-29 by running `d492/pingrid.py --price` from a tree without its ledger:

    price cells: 0  seed build/vl-compiler.wasm
      (a) ran on the base seed            : 0 fail
      (b) direct twin is LOUD             : 0 fail
      (c) twin's refusal names the op     : 0 fail
    price: ... override holds

Zero cells, three zero-fail lines, "override holds", **exit 0**. A green result from a
population that does not exist, and nothing in the output says so. The realistic causes are
a partial checkout, a rebase that dropped the set, or a `git apply` that skipped it — none of
which announce themselves.

Both `--price` grids now exit 1 on an empty list with a message saying nothing was verified.
The two rules were violated in one day by authors who had each read the other one, which is
the argument for making both **executable** rather than documented: `d471/opdeclgrid.py
--verify` refused 32 of its own author's cells for breaking the do-nothing rule minutes after
they read it.

Related: a `--price` run against the POST-landing seed reports VETO rather than a false pass,
because term (a) legitimately fails once the cells are loud. That is the safe direction; the
check takes the BASE seed.
## Array covariance over ALIASING lists: what VL actually owes, priced (D411, D501, D661B, D741, D742)

**This is a language-design decision the compiler cannot make for itself, and it is the root of
the largest clause-2 cluster in the corpus.** The section exists so the decision can be taken
from the numbers rather than re-derived; every figure here was measured on `ca5fa21a`.

### The unsound pair

Two facts, each independently correct, and together the classic hole:

1. **VL lists ALIAS.** `const b: i32[] = a; b[0] = 99` prints `99` through `a`, and so does the
   same store made by a callee through its parameter.
2. **The checker admits COVARIANT array assignment.** `assignableGo`'s `TyArray` arm is
   `assignable(sTail.aElem, d.aElem)` (typecheck.vl:16480), with no mutability qualification.

So a `Circle[]` flows into a `Shape[]`, a store through the second handle puts a non-`Circle`
into the list, and a read through the first sees it. `vl check` returns 0 for all of it.

### Three faces of one hole, and only one of them is currently loud

| face | witness | today |
|---|---|---|
| the two destinations need different element STORAGE | D411/D501 | **loud emit reject** — 33 corpus cells, the largest clause-2 cluster |
| the two destinations are different unions sharing a BOX | D741 (`d741_w0_base`) | **check rc 0, then `wasm trap: cast failure`** |
| the source is ANNOTATED, so covariance applies directly | D661B | **check rc 0, invalid wasm** |
| the literal is EMPTY, so the element is pinned first-wins | D742 (`d741_o1_hole_k1_first`) | **check rc 0, invalid wasm** — and the OTHER order is a clean check reject |

The first row is loud only because the wasm validator happens to notice. It is not a design
rule the checker could state narrowly and correctly, and **D741 measured why**: over a
36-cell grid varying the two destinations' element types, the outcome is EXACTLY the storage
partition with zero deviations — `Shape[]` + `Other[]` (two unrelated declared unions,
`tySame` false) RUNS, `Circle[]` + `Shape[]` is refused. The separating predicate is "is the
element boxed", which is a representation fact. **Fourteen cells run with a differing element
type**, so no rule in the type system's vocabulary is co-extensive with today's behaviour.

### The four real answers, and what each costs

**(a) Array INVARIANCE.** Built twice — once for D661B, rebuilt from scratch on `ca5fa21a`.
Distilled corpus **617 behavioural classes / 14,309 census cells `runs` -> NOT-RUNS**; all 7 of
D411's single-destination controls lost; **203 of D661's 211** grid cells lost. Sound, and by a
wide margin the most expensive thing in this file.

**(b) Element-hole unification for un-annotated literals only.** This is the cheap-looking
option and it is not available. It already EXISTS for the empty literal — `constrainEmptyD`
(typecheck.vl:1537) pins `s.aElem = d.aElem` from the first destination and the second is then
checked against it — so the price of extending it to a non-empty literal is measured rather
than estimated: **exactly 10 running cells**, the differing-union pairs above. It is also
order-dependent and unsound in one direction today (D742), so extending it would propagate a
defect rather than a rule. And it is not a ninth deferred constraint table: all eight key on
`tyHasHole` -> `TyVar`, while an un-annotated list element is the unrelated `-1` open slot for
which `tyHasHole` is FALSE and `substTyDeep` a no-op, and their pin is the generic call site,
which a two-destination binding in a non-generic function never reaches.

**(c) A read-only view** (`readonly T[]`, or covariance permitted only where no store can
reach). This is the answer that keeps both facts and costs no running program, because every
cell that runs today stores through at most one handle. It is a real language feature: a second
array type, a variance rule that reads it, and a decision about what `.push` does to it.
Nothing has been built or priced.

**(d) Value semantics for list assignment** (copy on assign). Changes aliasing for programs
that run today, which is fact (1) above; D411's third enumerated option is the same observation
from the other side. It also has no answer for `const e = []; take_i(e); e.push(1); take_f(e)`,
which is why the element-widening copy probe refuses by hand.

### What the compiler should NOT do, and this is the trap

**Re-word the emit refusal into the checker.** It looks like a clause-2 close: the 33 cells
stop being `loud emit reject`. It is not one. The rule it would state is the storage partition
wearing type-shaped clothes; it closes only the face the validator can see, leaving D741's trap
and D661B's invalid module untouched; and because `goal-scoreboard.py` counts an emit reject
but scores a non-conceding CHECK message as neither, the cluster would leave the scoreboard
without a single program compiling any better. **That is strictly worse than leaving it at
emit**, where at least it is counted.

The standing instruction it violates is already in CLAUDE.md — "making a failure LOUD does not
move the goal", and clause 2's purpose of keeping "legal" from drifting to mean "whatever the
compiler accepts". A refusal relabelled as a design rule is exactly the drift.

### The tripwire

`scripts/silent-sweep/d741/gen741.py`'s 123 cells are in `distilled/named/`, 46 of them
running. Any future candidate for (a)–(d) re-grades against them in one command and has to say
which of the 46 it costs.

## Default arguments v1: the expression is the DECLARATION's, the evaluation position is the CALL's (owner, 2026-09-01)

**"let's do A — schedule in defaults, then we can do tracking."** Default arguments ship as a
general feature and track-caller becomes their first customer, rather than a `CallerLoc` magic
TYPE fusing a general mechanism and one special case into a single rule. ROADMAP §Next's
track-caller row carries the survey that reached this: Swift, C++20 and C# all express the
callsite magic through default arguments plus one intrinsic, and only Rust hides it — at the
cost of attribute machinery and fn-pointer shims.

Trailing defaults, annotation-required, literal-only shipped earlier under B15a. **v1 completes
it**: a module-scope `const` and the `__callsite__` intrinsic join the admitted set, and UFCS
stops disagreeing with the plain spelling about arity.

### The semantics, in one sentence, because everything else follows from it

**A default expression comes from the DECLARATION and its names resolve THERE; only its
EVALUATION POSITION is the call site.**

Both halves are load-bearing and they pull in opposite directions, which is why the sentence
has to say both. Resolution at the declaration is what makes a dependency's
`join2(a, b, sep = SEP)` take *its* `SEP` when the entry module declares a different one —
otherwise a library's default would mean whatever the consumer happened to name a binding.
Evaluation at the call site is what makes `__callsite__` possible at all: a value that IS the
call's position cannot be computed at the declaration, and Swift/C++'s `#line` /
`source_location::current()` are the same trade.

**The three admitted forms are exactly the forms for which that sentence needs no machinery.**

* **A LITERAL** has no names, so there is nothing to resolve.
* **A MODULE-SCOPE `const`** has one name, resolved against the module frame
  (`isModuleScopeConst` — the module frame specifically, not the scope chain, so the callee's
  own parameters and locals cannot answer) and then MARKED
  (`ast.markDefaultGlobalRef`). The mark is the mechanism: the checker's `Ident` arm and the
  emitter's `emitIdentNode` both consult it before consulting the caller's locals, so a
  caller-local sharing the const's name cannot capture the substituted reference. Across
  modules the merge already gives it for free — `SEP` becomes `SEP$mN` and the entry's `SEP`
  is a different name — once the merge walks parameter defaults at all, which it did not
  before (`modRwFunc`).
* **`__callsite__`**, which is not an expression and is legal in no other position.

**`const` and not `let`, deliberately.** An immutable module binding has the same value at every
call site, so "evaluated at the declaration" and "evaluated at the call" cannot be told apart
and v1 owes no answer about which it meant. A `let` can change between two calls, which would
make the question real and answerable only by deciding something this feature is trying not to
decide. Everything else — a call, an allocation, a reference to an earlier parameter — stays
out for the reason B15a gave: it would have to be evaluated inside the callee, and a callee
that evaluates its own defaults must know which arguments were omitted, which is an ABI change
rather than sugar.

### The fixed-arity compatibility argument, unchanged and restated

Defaults are CALL-SITE SUGAR. A call omitting trailing arguments is normalized to the callee's
full arity before monomorphization and before signature collection, so the wasm signature always
carries every parameter, `fnSigKeyOf` keys off the DECLARATION's parameter list, the `$fnsig`
closure ABI never sees arity variance, and **no overload resolution enters the language**: a
k-argument call maps to exactly one function. A function VALUE therefore keeps its FULL
signature — `const kv = k; kv(1)` is an arity error, pinned — which is the same edge the
rejected `CallerLoc`-type design had, so the spelling choice cost nothing there.

### `__callsite__` is the ONE default whose node is minted per call site

Every other admitted form means the same thing at every call, so every other form SHARES one
arena node. `__callsite__` cannot, so `driver.csPreMintLocs` mints one
`{ file, line, col }` object literal per CALL and banks it; `ast.fillArgDefaults` substitutes
the banked node for the marker at both the checker's padding and the emitter's rewrite, keyed
on the same Call node so the two cannot disagree.

**It is a PRE-PASS, run at the top of every `checkProgram` caller, and that placement is the
whole design.** `nodeTyIx` is sized to the arena at `checkProgram` entry, so a node minted later
reads its type back as -1 forever — D969's recorded cost, and the reason `parseTemplate`
desugars in the PARSER rather than in a rewrite. Minting before the sizing puts these nodes
inside the checker's own numbering, so they are typed, collected and lowered by the ordinary
machinery and **nothing downstream knows the argument was synthesized**. The alternative
considered and rejected was cloning at `emit_rewrite` with a hand-carried type: it needs the
object literal's shape registration to survive a type the checker never computed, which is the
same class of blindness D969 named.

The pass is USAGE-GATED — a program declaring no `__callsite__` default mints nothing, banks
nothing, and emits byte-identical wasm. Measured: 2,045 corpus programs compile byte-for-byte
identically against a `git archive` control of the pre-change tree.

**The anchor is the CALLEE's own token** (`where` in `where(1)`, `f` in `x.f(1)`), which is what
Swift's `#line` and Rust's `Location::caller()` report for the same call. It is read through
`nodeToks`, NOT `fmt_util.tokIndexAt`: that binary search assumes `P.toks[i].start` ascends, and
the module merge APPENDS each module's tokens with that module's own offsets, so `start` restarts
at every boundary and the search silently misses — measured, every call in a module build fell
through to the fallback before this was fixed. `file` is the module KEY; a single-source compile
with no module table answers `""`, because nothing in that pipeline knows the entry's path.

**The TYPE is checked structurally at the declaration**, against
`{ file: string, line: i32, col: i32 }` — so the track-caller follow-up's
`type CallerLoc = { file: string, line: i32, col: i32 }` satisfies it with no compiler change,
and the compiler never learns the std name. Checking it at the declaration rather than only at
the call is what keeps a library's mistake out of a consumer's diagnostics.

### What a `__callsite__` call costs, disassembled

Unoptimized, one omitted `__callsite__` argument is a `struct.new` of two `i32.const`
immediates and a `global.get` of the interned file string, built in the CALLER's frame — so
the per-site cost is the allocation plus three constants, and the string is shared by every
site in the module. **At `-O3` it is nothing**: `wasm-opt --closed-world -O3 --gufa -O3`
inlines the callee, Heap2Local scalarizes the struct (it never escapes), and a two-call probe
folds to two `i32.const` and a 66-byte module. The ROADMAP row's estimate ("three
constant-folded scalars per opted-in call") is therefore right about the optimized build and
understated the unoptimized one by an allocation, which is the honest way round.

### UFCS took the arity RANGE, which B15a had left as a dispatch rule wearing other clothes

B15a shipped with `scale(5, 2)` taking the default and `5.scale(2)` refusing
(`member access '.scale' on non-object i32`), on the argument that the receiver-injecting
rewrite decides whether a member call is a method call AT ALL, so widening it changes DISPATCH.
That is true and it is not a reason to leave the two spellings disagreeing about the same call.
Both halves now read the declaration's range — `ufcsCallTy`'s gate in the checker and
`drwSelfFnOf`'s in the rewrite — so they cannot drift, and the emit-side fill runs after the
receiver is injected and needs no UFCS-specific arm.

**And putting the two halves side by side found that they had ALREADY drifted, on a different
axis.** `drwSelfFnOf` has always required the first parameter to be NAMED `self`;
`ufcsCallTy` asked only whether the receiver is assignable to parameter 0. So
`function pair(a: i32, b: i32)` made `5.pair(2)` `vl check`-clean and then
`emitProgram: callee is not a function name` at build — measured identical on the
pre-defaults compiler, so it is not this change's doing, but widening UFCS to the arity range
would have widened its reach to the defaulted spelling. The checker asks the `self` question
now (`declFirstParamIsSelf`).

**That is clause 2's second horn, not a capability gap relabelled.** UFCS in VL *is* the
`self`-function rule, so `5.pair(2)` is a program the DESIGN forbids — and an illegal program
is one the checker owed the diagnosis for. The refusal falls through to the caller's existing
member-access message, which names the receiver and the property the author wrote
(`member access '.pair' on non-object i32`), rather than an emitter sentence about callee
shape. Zero corpus movement, and no program that ran before stops running: reaching the
emitter's rewrite required the `self` name, which is exactly what the checker now requires.

### Two things the feature broke elsewhere, both found by running it

* **A module `const` named only by a default read as "Unused variable".** `lint.bindScan` never
  walked parameter defaults. It does now, and it walks them BEFORE binding the parameters —
  the order is the rule, not a convenience: a default's names resolve in the ENCLOSING scope,
  and scanning after the binds would attribute `function f(K: i32, b: i32 = K)`'s use to the
  parameter, which is the reading the checker refuses.
* **Top-level binding PROMOTION (G2c) became unsound for a const a default names.** The
  reachability analysis asks "is this NODE reached from the top-level region", and one shared
  default node sits in a top-level call (marked) and in a nested function's call (not marked,
  and invisible to a node-keyed scan) at once — so the binding was promoted to a start-function
  local and then read from a function body. `emitUserGlobalGet` caught it as a build error,
  which is the loud floor rather than the answer. `computeGlobalPromotion` now vetoes promotion
  for any const a default names, marked or not: the conservative side this analysis is built to
  fail towards, costing the promotion of exactly those consts.

### What v1 deliberately does not do

Function TYPES are unchanged — a default is a property of a DECLARATION, not of an arrow type,
so `(i32) => void` gains no optional-parameter spelling and an indirect call passes every
argument. Templates with literal-only holes are not admitted as defaults: `` `a${1}b` ``
desugars in the parser into a concatenation with a call to the renderer in it, so admitting it
would admit a CALL through the back door, and the whole literal rule exists to keep calls out.
And no default expression is evaluated more than the call sites that omit it — there is no
memoization question, because there is nothing to memoize.

## Track-caller: the LOCATION is a second LINE, and `CallerLoc` lives where its consumer does (2026-09-01)

> **THE ANCHOR MOVED THE NEXT DAY — read this entry as of 2026-09-01, not as of today.**
> §"A failed assertion is located at the MATCHER, not at `expect`" (below, BUILT in #2386)
> moved the `caller` parameter off `expect` and onto each MATCHER (`toEqual` / `toBeTrue` /
> `toBeFalse`), and the receipt no longer carries it. So everywhere this entry writes
> `expect(v, caller)` or "`expect` takes a trailing `caller`", today's spelling is
> `expect(v).toEqual(1, caller)` and "each matcher takes a trailing `caller`". Everything
> else here — the type's home, the structural check, the separate-LINE format, the
> last-line invariant, one-hop — is unchanged and still current. The banner is at the TOP
> because a superseded signature read as current fact is exactly the cost this file exists
> to stop paying.

Default arguments v1's first customer, and it needed no compiler change: `std:test` exports
`type CallerLoc = { file: string, line: i32, col: i32 }` and `expect` takes a trailing
`caller: CallerLoc = __callsite__` (as of this ruling; see the banner). Three choices were
open and each is answered here rather than left to read off the diff.

### The type's HOME, and why the structural check makes it reversible

**`std:test`, exported.** The alternatives were `std:fmt` (std's shared-helpers home), a new
module, and a `std:test`-local non-exported alias.

* **`std:fmt` is ruled out by a standing decision, not by taste.** `std/test.vl`'s header
  keeps this module's dependency surface at ZERO on the argument that it is the surface that
  reports failures in everything else, `std:fmt` included — a defect in fmt's renderer must
  not be able to corrupt the message that reports it. Putting `CallerLoc` there and importing
  it back would spend exactly that.
* **A new module is the speculative surface a version-locked std cannot take back.** One
  three-field alias with one consumer does not earn a module key, and a module key is the most
  permanent thing this repo mints.
* **Non-exported still COMPILES — and that is the problem.** It would be easy to write that
  the forwarding helper cannot be spelled without the export. It can: measured 2026-09-01, a
  user's own `type MyLoc = { file: string, line: i32, col: i32 }` in another module takes
  `__callsite__`, forwards into the assertion (`expect(v, caller)` then, `expect(v).toEqual(1,
  caller)` since #2386), and reports the caller exactly, with
  `CallerLoc` never imported. What the export buys is DISCOVERABILITY, not capability — the
  one-hop rule says a wrapper forwards its own `caller` explicitly, and leaving the type
  unexported would make every test helper re-spell three fields against an unwritten contract,
  which is precisely the "invisible rule about a type name" the defaults ruling rejected. That
  is an admission under D2's language-story clause and it should be claimed as exactly that,
  not as a necessity. (The refutable version of this paragraph survived one review draft; a
  claim that dies to a ten-second probe does not belong in the permanent record.)

**The structural check is what makes this reversible, and that is the load-bearing part.**
`__callsite__` is typed against `{ file: string, line: i32, col: i32 }` at the DECLARATION, so
the compiler never learns the std name and any identical alias satisfies it — measured both
ways on 2026-09-01: a user-declared `type L = { … }` takes `__callsite__`, and `std:test`'s
alias does. So if a second consumer ever wants a different home, an alias there is the SAME
type rather than a competing one. A wrong choice here is cheap in a way most std naming is not.

### The location is a separate LINE, and the assertion sentence is untouched

`vltFail` emits `"expected 7 to equal 8\n  at /p/f.test.vl:11:3"`, not
`"expected 7 to equal 8 at /p/f.test.vl:11:3"`. Both halves of that are decisions.

**Why a line and not a suffix: the sentence ends in a RENDERED OPERAND.** That operand is
arbitrary user text — `expect("at a.vl:1:1").toEqual("x")` renders it verbatim — so a machine
reader sniffing the tail of the sentence is parsing a field whose neighbours it does not
control, with no separator to search back from.

**But being on its own line is NOT what makes it readable, and the first draft of this entry
said it was.** A multi-line operand renders a fully ANCHORED forgery inside the sentence —
measured, `expect("x\n  at /forged/file.vl:99:99\n").toEqual("y")` produces two lines matching
the reader's own regex. The real invariant is **the location line is LAST**, which
`lsp/src/testDiscovery.ts` relies on (last match before the `--- captured output ---`
sentinel — the scan stops there because a program under test can print anything, that shape
included) and which **`std:test` owns**, because std is the end that chooses to append it. A
line added after the location — a hint, a structural diff — silently re-anchors every failure
in the editor, so std's header carries that prohibition at the emitting site rather than here.

**A joint invariant across two modules has to be written down at the end that can break it.**
That is the general form, and this one nearly shipped with its justification pointing at the
reader instead of the writer.

**Why the sentence is byte-identical to v2: every existing pin stays a PREFIX match.** The
runner suite's message assertions — the renderer-agreement i64-min pin included — needed no
edit at all; the change is additive to the report and additive to the tests. That is the
cheapest possible interaction with a fixture set the std:test v2 landing had to A/B twice.

### The render is LAZY, and the reason is the receipt's own rule read backwards

`std/test.vl`'s receipt computes `shown` EAGERLY, at `expect` time, because it is T-DEPENDENT
and every lazy spelling of a T-dependent render is one of the D941 family's miscompiles. That
argument does not extend to `caller`: it is a concrete `CallerLoc` at every instantiation, so
it is rendered only on the failure path. As of this ruling it was carried RAW in the receipt
and the pass path paid one struct copy; since #2386 the receipt does not hold it at all and
the pass path pays the matcher's own `struct.new` instead. The LAZY-render conclusion is
unchanged either way — it is the placement that moved, not the reasoning.

Measured, 2026-09-01: **+325 bytes** unoptimized on a one-assertion module (5,873 → 6,198),
**byte-identical at `-O3`** (596 both ways — Heap2Local scalarizes the struct, which reproduces
the `__callsite__` cost finding above through std), and **~11 ns per PASSING assertion**
(10M iterations, ~0.33 s → ~0.44 s) for the receipt copy plus the call site's `struct.new`.
Those ABSOLUTES are that day's program on that day's seed and do not compare with the
2026-09-02 pair in the matcher entry below; only the DELTAS do.

### The MATCHERS only — and it said `expect` only for one day

**Superseded 2026-09-02 by §"A failed assertion is located at the MATCHER, not at `expect`"
below, which is BUILT (#2386).** This section shipped saying `expect` was the one surface that
took `caller`; the parameter now lives on `toEqual` / `toBeTrue` / `toBeFalse` and `expect`
takes none. The sentence that follows is the part that survived unchanged, and the part that
did not is instructive: "one surface at a time" was right about `fail` and `it`, and wrong
about WHICH surface, because nobody asked which token an author wants to be sent to.

`fail(msg)` takes no location — its argument is the author's own sentence, not a rendered
assertion — and `it`/`describe` keep their signatures, because a registration site is not an
assertion site. One surface at a time; both are separate decisions to make on their own rather
than riders on this one, and the editor keeps its `it`-line fallback for exactly the failures
that carry no location by construction.

**The deferral costs nothing structurally, which is the point of having built defaults first.**
A trailing default is ADDITIVE, so `fail(msg, caller: CallerLoc = __callsite__)` can land later
without breaking a caller — the version-locked-std relief the defaults ruling was justified on,
collected here on its first surface. What the deferral does cost, and the header says so at
`fail`: the second line is a wire format an author can WRITE, and `fail("…\n  at /not/real.vl:1:1")`
reaches the editor as a location into a file that does not exist (measured). That is an argument
for closing the gap, not for distrusting the format — today an author who wants a located custom
assertion has no alternative to hand-building one.

## Serde on the wire: seven rulings, two of which reverse the same morning's decisions (owner, 2026-09-01)

A three-lens critique panel (consistency / cross-language / performance) attacked
`docs/serde-design.md` and its coordinator put seven decisions to the owner, who adopted every
recommendation as stated ("Recommendations all sound reasonable to me"). The arguments live in
`docs/internals/serde-critique-synthesis.md` §"Decisions that are the owner's" and the applied
form in `docs/serde-design.md`; what is recorded here is the *why*, per ruling, because none of
it is recoverable from a wire format's bytes.

### Unknown fields are REJECTED — and that is what makes untagged unions decidable (serde-design OQ-8)

Four sentences, all adopted: reject unknown fields; exact case-sensitive field matching; reject
duplicate keys; always emit `"f": null` for a `T | null` field rather than omitting it. Each is
a named Go v1 regret and Zig's default, and each is this repo's loud-over-silent preference
applied to the wire — the same argument that already made `NaN` an encode error rather than a
`null`.

**The non-obvious part is that reject-unknown is not a taste, it is a PREMISE of OQ-7.** Under
it, `{x} | {x,y}` is derivable — a document with `y` cannot be the `{x}` arm, because `y` would
be unknown there — so the required-key-set rule decides it. Under ignore-unknown the same two
arms are genuinely ambiguous, since every `{x,y}` document also matches `{x}`. Same VL type,
opposite answers. A serde design that leaves the field policy open has not answered its union
question either, which is why this became an OQ rather than a paragraph. The cost is
forward-compatibility on hand-edited configs; a program that wants it carries a
`{[string]: Json}` catch-all explicitly, in the type, where a reader can see it.

### `i64` goes on the wire as a JSON NUMBER, and the reason is NOT the RFC (OQ-9)

The doc had said "i64 as a decimal string" in three places, inherited from protobuf's canonical
JSON mapping. Reversed. VL's reader is **type-directed**: it knows the destination is an `i64`
before it reads a digit, so it parses exactly and never touches an f64 — the funnel that forces
strings elsewhere does not exist here. Two further reasons: `i64 | string` stays derivable under
the untagged rule (under the string rule every `i64` IS a string and no reader can tell the arms
apart), and a human writing a config writes `3`, not `"3"`. A JavaScript consumer loses precision
above 2^53 and is told so in the format's documentation, which is a true statement about
JavaScript rather than a tax on every VL program.

**The caveat is part of the decision.** The critic's supporting argument was that the f64 funnel
is "JavaScript's, not JSON's" and that VL should rule against I-JSON. *That was never verified* —
neither the critic nor the coordinator had web access, and the coordinator's recollection is that
RFC 7493 §2.2 says the opposite (64-bit integers SHOULD be strings, i.e. the interop profile
adopted the JS premise deliberately). **The ruling deliberately does not rest on the RFC in
either direction.** If I-JSON does endorse strings, nothing here changes and the status becomes
"VL is knowingly not I-JSON-conformant on this point" — a sentence the format docs should carry.
Recorded this way because a decision resting on an unchecked citation is the failure mode this
repo keeps paying for.

### Untagged distinguishability is FIRST TOKEN or REQUIRED KEY SET, not a general predicate (OQ-7)

"The deriver decides distinguishability statically" is right in shape and wrong in size: over
recursive types that predicate is tree-automaton intersection emptiness — decidable, but
unpredictable to a user and expensive to get right. The narrowed rule is one a user can hold in
their head, and it buys three things at once: **no backtracking** (the reader commits on the
first token, never O(arms × value) with a speculative parse per arm), streaming stays possible,
and the refusal can name the two arms and the token they share. It also admits the plan's own
migration idiom `deserialize<ConfigV1 | ConfigV2>` exactly when the versions differ in a required
key — which is the honest condition, because two versions differing only in an optional field
genuinely cannot be told apart. Two overlaps the doc's list had missed are now written down:
an open map arm overlaps EVERY object arm (its required key set is empty), and JSON's single
number type merges `i32 | f64`.

### The cycles ruling SPLIT: the compiler predicate is serde's, reference identity is the language's (§Cycles, OQ-11)

§Cycles priced its seen-set as "one hash-set insert per ref node". **There is no hash set** —
`Map`/`Set` keys are `string` or `i32` only, and WasmGC gives `ref.eq` while deriving no integer
from a reference — **and the static skip that would have made the cost moot does not exist in
the compiler either** (audited: no transitive ref-free predicate anywhere; `repTyScalarMask` is
the right template and the wrong question). The fallback a walk would get, a linear-scan
seen-set, measures 204 ms at 16,000 nodes — 70× the VLB encode it protects — and degrades
smoothly, so no small fixture would ever have shown it.

Ruled: **build the static acyclic-shape predicate** (transitively ref-free, or ref-bearing with
no back-edge in the type graph), keep a depth cap as the floor beneath it, and land a timing
probe (walk a ref-bearing shape at N and 4N, fail above 6×) *with* it — the shape of quadratic
this repo cannot see any other way.

**The split is the decision worth recording.** Whether VL wants reference identity as a keyable
concept — `Set<Node>`, `Map<Node, V>` — is a LANGUAGE question that serde surfaced and serde does
not get to answer; it costs an identity slot on every allocation or a linear probe on every
lookup, and both are decisions with reach far past a wire format. It is filed OPEN as OQ-11, and
stage 2 deliberately does not wait on it: the static predicate is sufficient for the shapes serde
walks, so a later "yes" makes the seen-set cheaper without making the predicate wrong.

### VLB's header carries an 8-byte shape fingerprint, and a version byte is not a substitute (OQ-10)

VLB is schema-implicit, so two builds that disagree about a shape do not fail — they silently
misread, which is bincode's known failure mode and the thing "same build only" was asking users
to guarantee by hand. Eight bytes of the recursive structural fingerprint OQ-2 already commits to
(so: existing machinery, one compare) turns that into a loud refusal.

Two constraints come from other languages' regrets and are part of the ruling. **Hash
wire-relevant structure ONLY** — Java's `serialVersionUID` moved on edits that could not affect
the bytes, users learned to pin it by hand, and the check died. **And the format-version byte
stays beside it, not instead of it** — MessagePack's 2013 `str`/`bin` split is the case: a
version says what the encoder's *rules* were and says nothing about whether this program's `Move`
is the encoder's `Move`. It weakens "same build only" as a slogan and strengthens it as a
guarantee, which is the trade taken everywhere else in this document.

### OQ-6 REVERSED: newtypes serialize transparently, because the refusal was anti-correlated with its hazard

The morning's posture was "refuse `new` types at the wire until a consumer opts in", on the
argument that a brand marks provenance and provenance does not survive a trip. Reversed the same
day. Measured from ONE std file: the refusal rejects `F32View`/`F32Base` — branded, and the brand
is the only reason it can see them — while accepting `Buf`, a plain alias for **the same raw
address**. The hazard belongs to the ADDRESS; the rule catches the spellings that told the truth
about themselves and waves through the one that did not. It also refuses the domain's centre
(`F32Base = new i32`), and a newtype-branded struct field runs today, so the refusal would remove
a working program from the wire — clause 2's shape exactly. Accepting is cheap to narrow later;
shipping a refusal into a version-locked std is not.

**What still needs a rule is the `Buf` observation, and it is kept as the open remainder**: a
plain alias over a linear-memory address encodes an integer that is meaningless in another
instance and nothing marks it. That wants a rule about ADDRESSES, not about brands.

### Stage 1 is a `Json` VALUE TREE, because the premise that forced a pull lexer was refuted

`std:json` v1 was scoped as an escaping writer + token-at-a-time pull lexer + per-type hand
codecs, on the design doc's fact 5: that a self-referential union cannot be built, so a value
tree was impossible. #2244 landed the `null` arm and the six-arm tree
`null | boolean | f64 | string | Json[] | { [string]: Json }` now renders and round-trips, with
two checker residues that have one-line workarounds (D1009, D1010). So the lexer was a
workaround for a wall that is gone, and v1 ships the tree plus a parser and a renderer instead.
Two consequences: `deserialize` becomes a two-phase read whose first phase is reusable, and
**stage 3 retires LESS** — the tree is the schemaless escape hatch by construction rather than a
leftover lexer, so what stage 3 adds is the derived one-step path beside a `std:json` that keeps
its own reason to exist.

## `std:json` ships NO accessor helper, because the decoder is an OPERATOR (owner, 2026-09-02)

`json-design.md` §6 q1 offered three helpers for walking a `Json` tree (none / `jsonGet` /
an RFC 6901 `jsonPointer`) and recommended the pointer. The owner declined the premise:
"why would it have to be one `is` test per level? why can't you do a complex, nested type
on the right hand side? I say get that working and then (a) is fine for now until we have
an actual consumer." Two facts made the question answerable rather than a taste call:

- **"One test per level" was never a rule.** `x is T` over a union is a TAG test: the
  checker asks whether `T` is a registered arm, the emitter compares the box tag. A struct
  on the right is refused ("not a variant of Json"); a REFINEMENT of an arm (`r is
  string[]`, `r is {[string]: string}`) is admitted by the assignability-based membership
  test and then answers **`false` unconditionally** — `["xyz"] is string[]` prints `false`,
  a check-clean silently-wrong answer (D1035). Nothing in the language decided that; it is
  the shape of a tag test applied where a shape walk is meant.
- **The walker helper and the typed decoder are the same customer.** Every consumer in
  reach (config readers, message payloads) can NAME its shape; a helper only serves the
  consumer that cannot, and none of those is in the tree. serde-design already commits to
  `deserialize` being a two-phase read (text → `Json` → shape); the ruling is that the
  second phase is spelled `doc is Cfg` / `doc as Cfg` — the operator the language has —
  rather than a `deserialize<T>` intrinsic, which OQ-1 (b) keeps for the BINARY source and
  for `serialize`, where no operator fits.

So: **(a) no helper in v1; the build item is deep `is` / `as` over `Json`** — a derived
per-`T` shape walk that BUILDS the `T`-repped value, inheriting the wire policies already
ruled (unknown key → no match, exact case, duplicate keys a parse error, `i64` a number,
union arms by first token / required key set). Four sub-rules carry recommendations and
await the owner (`docs/serde-design.md` §"Deep `is` / `as` over a `Json` value"): the
narrowed value is a COPY and `is` rebinds; `i32`/`i64` fields accept only an integral
in-range number (the same predicate as q2's exact `as`, ruled the same day); an absent key
reads as `null` for a `T | null` field (RULED the same day, next section — the
recommendation had been the opposite); `as` propagates a `JsonError { kind: "shape", path }`
rather than the useless remainder. A helper returns to the list the day a consumer that
cannot name its shape arrives, and not before — std has no deprecation story, so the
cheapest helper is the one never shipped.

### An ABSENT key matches a `T | null` field and reads as `null` — VL's map read already says so (serde-design S3, owner, 2026-09-02)

The sub-rule as drafted said the opposite: absent ≠ present `null`, the read-side mirror
of decision A (the writer always emits `"f": null`), on the argument that `{x} | {x, y}` is
only decidable when absence is a fact. The owner asked three questions — is `doc` a struct
or a map, could an absent key match `null`, and does VL have optional-key semantics at all —
and the measured answers reversed the recommendation before the ruling was made:

- **`doc`'s object level is the MAP `{[string]: Json}`; the target is a STRUCT.** Absence is
  a fact of the source; a VL struct has no absent field and no `field?: T` syntax exists —
  `T | null` is the language's one spelling of "maybe not there". So the only question is
  whether the walk PRESERVES the difference (refuse) or COERCES it (absent → `null`); a
  struct cannot hold it either way.
- **VL's own map read is already absent → `null`.** `const m: {[string]: i32} = Map();
  m["a"] = 0; m["zz"] == null` prints `true` on the current seed, with the stored `0` under
  `"a"` reading as `0` (#1899/#1901 made a miss distinguishable from a stored zero). A shape
  walk that refused the absent key would be STRICTER than reading the same map by hand,
  which is the argument that decided it.
- **Nothing a struct could have expressed is lost.** The consumer that needs "absent vs.
  explicit null" still has the map (`doc["host"]`); the round trip canonicalises only the
  JSON text (`{}` → `{"host": null}`, the VL value identical). The cost — a producer that
  forgot a nullable field reads as `null` rather than failing `is` — is the cost `m[k]`
  already carries.

**Ruling.** A missing key matches a field typed `T | null` and the field reads `null`. A
missing NON-nullable field is not a match. A `T | null` field is therefore NOT a required
key, so OQ-7's required-key-set rule refuses `{x: i32} | {x: i32, y: i32 | null}` as
ambiguous at the `is` site, naming both arms — the OQ-7 ruling's own sentence ("two
versions differing only in an optional field genuinely cannot be told apart") was already
this rule. Decision A on the WRITE side stands: total writer, lenient reader, and the
asymmetry is the chosen one. Grading list, with the un-annotated spelling of each (an
annotation pins a rep the walk must not depend on): `{"port": 1} is Cfg` → `true` and
`cfg.host == null`; `{"port": 1, "host": null}` → `true`; `{"host": "x"}` → `false`; the
two-arm union above refused at the checker.

## Deep `is` over a `Json` value is a SHAPE WALK plus a conversion, and its walker is generated VL (2026-09-02)

**Standing.** `r is T` where `r`'s type is a JSON-shaped union and `T` is not one of its
arms is a RUNTIME SHAPE WALK, not a tag test. `docs/serde-design.md` §"Deep `is` / `as` over
a `Json` value" is the design; **S1, S2 and S3 stand as built, S4 (the `as` trio) is the
remainder**. S1: the arm binds one converted COPY, so mutating it never writes back to the
tree — a `{[string]: Json}` map and a `Cfg` struct are different wasm reps, so the arm
cannot be a view, and narrowing already changes rep silently for a value-union arm. S2: an
integer target matches iff the value is integral and in range, and it is not a second
definition — the walk asks `v as? i32`, so it IS §"Numeric `as` to an INTEGER target is
exact-or-fail under the trio". S3 (RULED by the owner): an ABSENT key matches a `T | null`
field as `null`, because the source's object level is a MAP and VL's own map read already
says absent is `null`; a walk that refused it would be stricter than reading the map by hand.

**Why the walker is GENERATED VL SOURCE rather than emitted wasm.** The walk must BUILD
every target rep — a `string[]`, a struct, a `{[string]: i32}` map — and the emitter already
knows how to build each of those out of ordinary VL. Generating the walk as source (one
`__vlJsonIs_<k>` + `__vlJsonGet_<k>` pair per distinct target, parsed into the same arena and
appended to the program root) means the arm's binding is an ORDINARY local of the target
type, so no delivery position needs wiring and `wasmEmit.vl` learns no new rep. That is
D965's rule satisfied by construction rather than by a nine-cell matrix. The cost is a
second parse and a second check, paid ONLY by a program that has a deep `is` — a program
without one emits byte-identical wasm.

**Why a PAIR and not one function returning `T | null`.** The arm would then bind a nullable
narrowed to non-null, and `.push` is a delivery that drops the non-null recovery for exactly
that value (D1197, check-clean invalid wasm; eight other positions run). The pair costs a
second walk and owes nothing to a standing defect. When D1197 closes, the pair collapses to
one function and a RECURSIVE target (D1198) becomes expressible.

## Numeric `as` to an INTEGER target is exact-or-fail under the trio; a float target rounds; nothing ships in std (owner, 2026-09-02)

**Ruling.** `x as T` with a numeric operand and an INTEGER target (`i32`, `i64`) succeeds
iff the value is exactly representable in `T`, and otherwise FAILS the way the trio fails
everywhere else: bare `as` propagates `null` (the enclosing function must return `| null`,
else the checker refuses and names `as!` / `as?`), `as?` yields `null` typed `T | null`,
`as!` traps. Concretely: `f64 → i32` / `f64 → i64` succeed iff the value is integral and in
range (NaN, ±Inf, a fraction and an overflow all fail); `i64 → i32` iff in range (no wrap);
`i32 → i64` / `i32 → f64` are lossless and cannot fail (`as?` on one is a hint). A FLOAT
target (`f64 → f32`, `i64 → f64`, `i32 → f32`) ROUNDS and never fails — rounding to the
nearest representable float is the conversion, not a loss of the value's meaning. Loss is
SPELLED where it happens: `trunc(d) as! i32`, `floor(d) as! i32`, `nearest(d) as! i32`,
where `trunc`/`floor`/`ceil`/`nearest` are the existing `f64 → f64` intrinsics and the
`as!` is provably infallible after them (the emitter peepholes the pair to the one
`i32.trunc_f64_s`). **No `asExactI32` / `asExactI64` ships in `std:fmt`** — that name
would have been `as?` spelled as a function, a std API bent around the ignored-suffix gap
(D1041), which is exactly what the 2026-09-01 "design is not bounded by the seed" rule
forbids.

**What it answers.** `json-design.md` §6 q2 in full: (1) the helper — none; a consumer reads
`p as? i32` / `p as! i32` (and, once deep `is`/`as` lands, an `i32` field under a shape
walk uses this same predicate — serde-design S2). (2) `f64 as i32` out of range — neither
trap-by-default, saturate nor wrap: it is a FAILURE the trio spells, so the three-way fork
the 2026-08-02 ROADMAP entry and `open-rulings.md` §`f64-as-i32-out-of-range` held open is
dissolved rather than picked. (3) The silently ignored `as?` / `as!` suffix on a numeric
cast becomes the build item.

**Why this and not truncation.** The owner asked whether `as` erroring instead of
truncating is normal and good design, and whether `trunc(d) as i32` costs more than the one
instruction. The survey: C and Go truncate, out of range undefined (C) or
implementation-defined (Go); Java, Kotlin and Rust `as` truncate and saturate, NaN to 0,
with `TryFrom` as Rust's checked spelling; Swift `Int(d)` and Zig `@intFromFloat` truncate and TRAP out of range, and
Swift adds `Int(exactly:)` for the check; Python's `int(x)` truncates but RAISES on NaN and
inf; Ada rounds and raises `Constraint_Error`; Julia's `Int(3.9)` is an `InexactError` and
the loss is spelled `trunc(Int, x)` / `floor(Int, x)`. Every language that made truncation
the default has an exact variant bolted on beside it; Julia is the one whose default is the
exact one, and its rule is the one adopted. The reason it fits VL rather than Rust: VL has a
propagating cast operator with three spellings and the "you get a `T`" invariant, so an
inexact conversion already has a home for its failure — the same place a union `as` puts
its remainder. Rust's `as` is total because Rust's `?` is a separate operator that `as`
cannot reach.

**Cost.** Performance: `trunc(d) as! i32` is the single instruction today's `d as i32`
emits (peephole; the operand is integral by construction so the exactness compare is
dead), and the general `d as! i32` is the conversion plus a compare, cheap and what a
correct Rust `try_from` pays. **CORRECTION, from building it (2026-09-02): the compare is
`trunc(d) == d` plus a range test, NOT the round-trip `trunc_sat` + convert-back + `eq`
this paragraph and D1041 both named.** The round trip is exact for `f64 → i32` — every i32
is an exact f64 — and UNSOUND for the other three float pairs, because the convert-back
ROUNDS: `9223372036854775808.0 as? i64` saturates to `i64::MAX`, converts back to exactly
`2^63`, and compares EQUAL to the operand, admitting a value the target cannot hold. One
shape that is right at all five pairs (`f64 → i32/i64`, `f32 → i32/i64`, `i64 → i32`) beats
a cheaper shape that is right at one and has to be remembered at the other four. The bounds
are `i32.const`/`i64.const` fed through `f64.convert_*`/`f32.convert_*` rather than spelled
as float literals, which keeps the emitter's decimal→IEEE parser off the soundness path and
makes the ENGINE's own rounding the fact the comparison is built on (`convert(i32::MAX)` is
exact in f64 so that bound is `<=`; it rounds UP in the other three, so those are `<`).
Binary size: the `as!` trap's source-located reason is per-SITE `__print_char__` code in the
cold branch — measured +226 bytes at `-O` on `bench/arrays/binsearch` for one cast, the same
trade Rust makes for `unwrap`'s panic location. A module-tail helper taking `(line, col)`
would cut it to about ten bytes a site if that ever matters. Do not lean on binaryen for the fold: its float folds are NaN-conservative and will
not remove the compare on their own. Migration: the tree's `as` sites are `as!` in intent
today (they were written under "traps on NaN / out of range"), so the migration is a
suffix per site — **`compiler/` 2, `std/` 15, `tests/cases` 167** (vl-de's
comment-and-string-aware count, landed as #2355 the same day and `cmp`-byte-identical; the
first figure quoted here, 67/21/230, was a bare grep and **70 of its 87 compiler+std hits
were prose inside `//` comments** — a count of casts is a count of CODE spans, not lines) —
and it lands FIRST, byte-identical, because the current seed accepts and ignores the
suffix; the semantics land second. **One live behaviour change to write down:** a bare
numeric `as` TRAPS today in three of its five failure modes (NaN, ±Inf, `f64` overflow) and
is silent in the other two (fraction truncates, `i64 → i32` wraps). After the migration no
site in the tree spells a bare `as`, but a USER function that returns `| null` and holds a
bare `f64 as i32` changes meaning from trap to propagated `null` for those three modes;
every other bare `as` becomes a check error naming the suffix, which is loud. After #2355
the tree spells no bare numeric `as` at all, so the price is documented rather than paid. `error-handling-design.md` §"The unified `as` principle" said
"Numeric casts do NOT propagate"; its stated reason (a propagated raw `f64` would infect the
signature and carries no information) argued against propagating the OPERAND, and this
ruling propagates `null`, which is the trio's remainder for a single-cause failure and
infects nothing but the `| null` the signature already owes. That paragraph is revised in
place with a pointer here.

**Grading list.** D1041 (`3.9 as? i32` prints `3`); the ten-row table on that row; D965's
delivery matrix for the `T | null` result of `as?`; `std/fmt.vl` `parseI32`'s comment,
which documents `as i32` as "an unchecked wrapping truncation on this compiler" and is
false the day this lands.

## A subsumed literal arm COLLAPSES: `string | "err"` is `string`, through aliases and through a union's arms; `x is <literal>` is a value test everywhere (owner, 2026-09-02)

**Ruling.** A union is a SET of values, and an arm that adds no values adds no arm. A literal
whose base type is already an arm — `string | "err"`, `i32 | 3` — is subsumed and the type is
the base. Subsumption is decided PER ARM, AFTER FLATTENING and THROUGH ALIASES, so where the
subsuming arm came from does not matter: `type Name = string` gives `Name | "err"` = `Name`;
`Json | "err"` flattens to `null | … | string | … | "err"` and is `Json`; and the mirror image,
a litunion beside its base (`Kind | string`, `Kind = "a" | "b"`), is `string`. Nothing
collapses that adds a value: `Kind | "err"` is the three-atom litunion `"a" | "b" | "err"`, and
`i32 | "err"` is a genuine two-arm box. `x is <literal>` is a VALUE test — it means
`x == <literal>` with narrowing — over a collapsed base, over a litunion atom and over a
value-union arm alike, which is what the language already does everywhere the spelling
builds today (`const s: string = "err"; const c: R = s; c is "err"` prints `true` over
`type R = string | "err"`). Two hints, neither blocking: at a WRITTEN spelling whose arm is
subsumed (`"err"` is subsumed by `string` — the arm carries nothing; a distinguishable
failure is `| null` or a struct arm), and at an `is <literal>` whose operand collapsed
(`r` is `string`; this is a value test and cannot tell a failure from data). No hint at a
generic instantiation (`orErr<Json>`): the caller did not write it and the author cannot
avoid it; the second hint fires exactly where the loss bites.

**What it answers.** `json-design.md` §6 q3 in full, and D1024's language question. It is
the same fold the language already applies to `Json | null` (D1021, #2312: `null` is an arm
of `Json`, so the composition is `Json`), stated once for every arm kind. The consequence
for `std:json` is the one the module already lives by: for a `Json`, NEITHER `| null` NOR
`| "err"` can be a failure arm, because both are data a document can hold — a struct arm
(`JsonError`) is the one thing a `Json` cannot be, and that is why it exists.

**Why collapse and not the two alternatives.** (b) A DISTINGUISHABLE literal arm — a value
returned as the literal tagged differently from the same value returned as a `string` — gives
a free poor-man's `Result` for generics and nothing else: two equalities diverge (`is`
false while `==` true — the opposite of today's measured behaviour), a value acquires an
identity by which arm it flowed through, every such union pays a box where the collapse
pays none, no structural literal-typed language does it (TypeScript, Flow and mypy all fold
`"err" | string` to `string`), and it is precisely the nominal-by-erasure thing the checker
already refuses for `string | Err` with `type Err = new string` ("same runtime
representation, so `is` cannot tell them apart"). (c) REFUSING the spelling is loud and
inert-free, but `T | "err"` at `T = string` then errors at an instantiation the author never
wrote — TypeScript's reason for folding silently — and avoiding that needs "refuse when
written, collapse when instantiated", two rules for one type.

**Build note.** The collapse lives in CANON — the type becomes a non-union, or a smaller
union — never as a dedupe of a built member set: box tags are POSITIONAL (the union
member-set ABI), and D1024's "dedupe the atom after widening" was the wrong layer. Grading
list: D1024 (prints `err`), the six-row spelling table on its row, `is "err"` as a value
test at every spelling in that table, both hints. **Split off, not this ruling's:** the
generic-instantiated union `T | "err"` / `T | E` at a scalar `T` refuses `no recorded
members` — measured 2026-09-02 to be about MONO-MINTED unions and not about the literal
(D1042).

**Note added 2026-09-02 (D1048), and it sharpens "the collapse lives in CANON" rather than
contradicting it: THERE ARE TWO PRODUCERS OF A UNION'S TYPE AND THE COLLAPSE HAS TO LIVE IN
BOTH.** The ruling's bare-literal half shipped as D1024 with the collapse at type
construction (`unionDropSubsumedArms`, reached by all three union-construction sites). The
MIRROR half — a litunion beside its base, `Kind | string` is `string` — needed the same drop
a second time, on the annotation SPELLING (`canonDropSubsumedParts` in `canonEmitNameTs`'s
union arm), because canon PRESERVES a string-litunion member (`litUnionPreserve`, and
`mixedUnionLitAliasRegroup` for the inline spelling) where the arena drops it. Each half alone
is a `runs → not-runs` veto, measured in both directions on two running fixtures; canon's half
alone additionally answers `x is Kind` a silent TRUE for a non-member. The bare-literal half
needed no canon change only because canon's `TyLit` arm already softens to the base and its
atom dedup collapses `string|string` — the two producers agreed there BY ACCIDENT. So the
build note's rule is right and incomplete as written: **a type-level collapse must move the
arena AND canon, or they agree about the TYPE and disagree about the REP.**

**Note added 2026-09-02 (D1199): BOTH HINTS ARE BUILT, and the second one needs a bank because
THE COLLAPSE IS INVISIBLE IN ITS OWN RESULT.** The first hint arrived free, exactly as ruled —
`string | "err"` now infers as `string`, so the existing redundant-annotation hint fires at the
written spelling with no new code. The second could not be derived that way, and the reason is
worth writing down: after the collapse `r` IS a `string` — the canonical arena singleton, the
canon spelling `string` — so the arena, the canon render and the message all agree with a
`string` nobody wrote a union for. A rule reading the TYPE at the `is` site would fire on every
legitimate `s is "err"` in the language. **How "collapsed" is recorded:** the annotation route
banks the arena index it collapsed TO (`collapsedTy`, a third bank on `unkTyPart`'s wire —
cleared by the outermost `tsToTy`/`nameToTy` frame, restored across `resolveAnnotTs`'s name memo
like `annotPart`); the DECLARATION route banks the alias NAME (`collapsedAliases`), which
`declaredTyOfName` re-banks at every later `: R`, so `type R = string | "err"` reaches
`function f(): R` through the one door every declared-type reference comes through. A `let`,
a parameter and a declared RETURN each compare their OWN resolved type against the bank —
so `(string | "err")[]` marks nothing — and an un-annotated `const r = f(…)` inherits the mark
from the callee's decl node. Marks are depth-tagged sparse rows dropped by `popScope`, paired
with `lookupDepth` at the read, which is what makes an inner plain `const r: string` shadowing
an outer collapsed `r` silent without recording anything itself. The generic-instantiation
decline is STRUCTURAL rather than a special case: substitution mints its collapsed union on the
third route (`substTyDeep`), which banks nothing, so `orErr<Json>` cannot reach the hint. The
diagnostic is a non-blocking `hint` under the code `collapsed-arm-value-test`, fires only for a
LITERAL check type (`is null` / `is string` / `is Circle` still discriminate), and changes no
codegen — 18 programs graded against a pristine `origin/master` seed emit byte-identical wasm.

## `is A` over same-shape struct arms is a DISCRIMINANT-VALUE test: a literal-typed field is a type that is also a value, and membership is decided by the value (owner, 2026-09-02)

**Ruling.** Two struct arms that share a field-name set and differ only in a literal-typed
field — `type Circle = { kind: "circle", r: f64 }` / `type Square = { kind: "square", r: f64 }`
— are a legal union, and `s is Circle` is true iff the value's tag names the shared shape AND
its discriminant is a member of `Circle`'s literal set: `s is Circle` ≡ `s.kind == "circle"`,
narrowing to `Circle`. Generalised, `is A` tests membership in every field where `A`'s type is
a literal set — the literal-field slice of the deep-`is` shape walk (json-design §6 q1). It is
the rule `docs/guide/unions.md` already promised ("a union whose members share a shape needs an
explicit discriminant field") and the rule TypeScript users arrive with; `s.kind == "circle"`
narrowing already computes the same arm set today, so the two spellings agree by construction.
Overlapping literal sets (`"x" | "y"` vs `"y" | "z"`) are LEGAL and answer truthfully — a value
with `kind: "y"` is a member of both, as structural typing says, and `else` narrows to `B`
minus `A`. A same-shape pair with NO distinguishing literal field (`{v: i32} | {v: boolean}`)
is refused by the CHECKER, not the emitter: "arms `A` and `B` share a field-name set and no
literal-typed field distinguishes them — add a discriminant field". That refusal is a DESIGN
rule (the guide's sentence), so the checker owes it; today it is an emit reject.

The owner's framing, kept because it is the reason the rule reads the way it does: *"circle"
and "square" are types that are also values, so it's blurry. They are structurally the same
shape but logically different.* One principle now covers q1, q3 and this row — **`is` asks
whether the VALUE is a member of the type: by tag when the tag can answer, by value when it
cannot, and refused only when neither can.**

**Representation is the compiler's, not the ruling's.** The owner is "not against (nor for)"
giving each named type its own heap type — "b vs c is an internal decision". So the emitter may
lower this as one heap type + one tag + a `struct.get`-and-compare on the `i32` sentinel (no rep
change; the recommended route), or as distinct heap types, PROVIDED the answer stays the value's:
a `{ kind: "circle", r: 1.0 }` built under no name at all is a `Circle`, and a `Square` value
widened through `Circle | Square` and back is still a `Square`. A rep that made `is` depend on
which NAME a value was built under would be nominal typing by the back door and is not what was
ruled. The litunion rep cliff is the known cost of the distinct-heap-type route (a struct's heap
type would depend on inferred literal sets and force copies at widening sites); it is why the
recommendation is the value compare.

**What it changes, measured 2026-09-02 (seed c4f03200).** The TS idiom itself — same field
names, singleton literals — is today an EMIT REJECT ("union `Circle|Square` cannot be
discriminated — same field names but different field types") even with no `is` in the program,
so the idiom is unwritable; two-member disjoint sets (`"x"|"y"` vs `"p"|"q"`, D1023's filed
shape) answer `true`/`true` and take the wrong arm silently; overlapping sets likewise; only
different field NAMES run. The guard (`variantFieldTysEq` in `emit_collect.vl`) parts singleton
literals on its identity column but folds multi-member sets into "one variant" — that column is
where the row's mechanism lives, and it is not the tag (`is` over struct arms is a tag compare on
the field-name signature, not a `ref.test`; the row's first filing said `ref.test` and was
wrong about the instrument, not the outcome).

**Build.** (1) collect pass: a same-signature pair that differs in a literal-typed field is
legal — one tag, one layout; (2) `is A` over such arms adds the membership compare(s) after the
tag test (an `i32` atom compare per literal field; the peephole for a singleton set is one
`i32.eq`); (3) the checker refuses the no-discriminant pair with the sentence above and the emit
reject becomes an unreachable floor; (4) `==`-narrowing and `is`-narrowing over the same union
must agree at every spelling — grade both. Grading list: D1023's filed witness (prints `a` then
`b`), the six-row table in its RULED paragraph, `is` and `==` narrowing side by side on the
Circle/Square idiom, the overlapping-set case answering `true`/`true` for `"y"` and
`true`/`false` for `"x"`, and the `{v: i32} | {v: boolean}` pair refusing at CHECK.

**BUILT 2026-09-02 (#2365), as the four steps, and the recommended rep cost no rep change.**
Three things the build settled that the ruling deliberately left open, kept because each was a
question someone will ask again:

* **The compare works on ONE layout because atom ids are interned globally by literal VALUE.**
  `internAtom` is a single module-global map keyed by the literal's text, so `"y"` is the same
  `i32` in `type KA = "x" | "y"` (position 1) and `type KC = "y" | "z"` (position 0) — measured
  on a disassembly. Had the ids been per-type positions, a value compare would have needed
  atoms interned per BASE type first, which IS a rep change. Note also that a literal set has
  two reps and only one is a sentinel: an inline `kind: "x" | "y"` is a `(ref $string)` holding
  the member's own characters, a registered ALIAS the interned atom. The compare is therefore
  picked off the field's STORAGE, which is what makes the answer independent of spelling.
* **The membership test must be a GUARD, not a conjunct.** Both operands of an `i32.and`
  evaluate, so conjoining membership onto the tag test ran the discriminant read — a
  `ref.cast` to this arm's heap type — on values of every other arm. A two-arm union hides
  this completely (both arms share the shape, so the cast always succeeds); it takes a THIRD
  arm with different field names to see it. Lowered as `if (result i32) … else 0`.
* **A shared tag with two heap types is not a representation.** Tags key on the field-NAME
  signature, so these arms always shared one; `buildVariantTwins` keys on a canon id that
  PRESERVES each arm's literal set, so they did not share a heap type — and the box is built
  under whichever row the field-name match hits first, so the other arm's `ref.cast` trapped.
  Admitting the pair without folding it reproduced the filed bug from the other side. One
  predicate now answers for both callers so they cannot drift.

**Residue: the two litunion reps in one union (D1050) — CLOSED 2026-09-02, see the section
below.** `{kind: K1} | {kind: "x" | "y"}` is legal by this ruling and refused, because an
interned atom and a string ref share no layout. The refusal was worded to concede the program
is type-valid rather than to claim the field types differ, which is what kept it visible; it
is now reached only by the two shapes that have no atom rep at all. The interim std rule is
retired: a std error struct no longer NEEDS a unique field name, since a unique `kind` literal
now discriminates. `JsonError.path` stays for the information it carries, not for
discrimination.

## A MIXED-SPELLING VARIANT FIELD CARRIES THE ATOM

*Decided 2026-09-02 while closing D1050. The question the ruling above left open: when two arms
of one discriminated union spell their literal discriminant differently — a named literal-union
ALIAS in one, an inline set in the other — which of the two litunion representations does the
shared field carry?*

**THE ATOM, and the reason is that its consumers are already built.** A string literal set has
two reps and `nodeTyIsLitUnionAlias` is the seam: a registered alias is the interned `i32`
atom, an inline `"x" | "y"` a `(ref $string)`. Either could in principle be the shared one. The
atom side already has all four sites a unification needs — `emitDiscrimFieldEq`'s code-0 arm
compares interned ids, `emitVariantStruct`'s `variantFieldIsLitUnion` arm interns the member
literal at CONSTRUCTION, `exprIsLitAtom`'s variant and struct member arms claim the READ off
the same field code, and `emitAtomToStr` widens it back at every string boundary — so the
conversion costs no new lowering. Unifying on the STRING side would need all four written from
scratch for the arm whose type is the alias, and would then give that alias a rep the rest of
the module does not use for it.

**THE UNIFICATION IS SCOPED TO THE ARMS OF A MIXED PAIR, NOT TO THE TREE.** This was the
question that made D1023 stop: "closing it means unifying the two litunion reps", the litunion
rep cliff, with corpus-wide byte effects. That framing assumed the unification had to be
GLOBAL. It does not — `unifyMixedLitRepArms` moves the two rows a mixed pair actually has, and
the distilled corpus moved **0 classes of 255,504 cells** while the candidate compiler emits
master's own source byte-identically. The whole-tree unification remains unbuilt and is not
required for this ruling.

**BOTH TABLES MOVE OR NEITHER DOES.** The VARIANT row is what the union box is built and cast
through; the arm's DECLARED STRUCT row is what `variantStructHeapTwinAt` merges it with and
what a `const s: B = { … }` outside the union builds. Rewriting only the first gives one
declaration two heap types, and any value crossing between them is a module the engine refuses.
The arena sidecar (`*FieldElemTyIx`) moves with the code for the same reason one rung out: the
read classifiers are code-0-**plus**-`tyIsLitUnion(ety)`, so a promoted row without its sidecar
entry stores an atom that every reader calls a plain `i32` and `print` emits the raw interned
id.

**THE BOUND IS "BOTH ARMS ARE ATOM MATERIAL", and two legal pairs stay refused because of it.**
A field may be re-laid only when both arms carry a 2+-member set every one of whose members is
a string — what `internAtom` keys and what `emitAtomToStr` can widen back. So `{kind: K1} |
{kind: string}` (the amendment's set-beside-its-base: the base arm holds an arbitrary string
with no interned id) and `{kind: K1} | {kind: "a"}` (a BARE single literal, a `TyLit` rather
than a `TyUnion`, which the read classifier does not treat as a litunion) keep the loud
refusal. That refusal is still the right diagnosis, so its message literal stays counted by
`--sites` — the SITE narrowed, it did not clear. Closing those two means the STRING-side
unification, which is the genuinely open half of this question.

**THE ADMISSION AND THE ACTION ARE ONE PREDICATE ASKED TWICE.** `assignTags` runs at the end of
`collectU`, one pass before the struct table exists, so it cannot do the re-lay; it admits on
`variantLitRepUnifiable`, which is the acting pass's own applicability test.
`variantLitDiscriminable` keeps asking the strict "agree as laid out" question because
`buildVariantTwins` runs after the unification and must see the FINAL layout. Both are arms of
one walk (`variantLitPairKind`) — the same discipline the ruling above already imposed on
`assignTags` and `buildVariantTwins`, one seam further along.

**Amendment (owner, 2026-09-02): a literal set beside its own base is legal.**
`type A = { kind: "x" | "y" }` beside `type B = { kind: string }` in one union is a LEGAL
discriminated pair: `v is A` ≡ `v.kind ∈ {"x","y"}`, `v is B` is true for every value of the
shared shape (B's set is the whole base), and `else` after `is A` narrows to B. It is the
overlapping-set case with one set being the base, and the ruling's principle line — *`is` asks
whether the VALUE is a member of the type: by tag when the tag can answer, by value when it
cannot* — already covers it. **The "treat a pair as distinguishable only where BOTH arms carry
a literal set of the SAME base type" sentence above is superseded for this pair**: one arm
carrying a set and the other carrying that set's BASE is enough. Unchanged either way: a pair
where NEITHER arm carries a set (`{v: i32} | {v: boolean}`) still refuses at CHECK, and a pair
whose field BASE TYPES differ (`{v: i32} | {v: "a" | "b"}`) is a different question this
amendment does not reach. The lowering follows the asymmetry — a membership compare is emitted
only for the arm that HAS a set, so `is B` stays the bare tag test — and that asymmetry is what
makes the `"z"` value (a B that is not an A) the cell which actually grades the rule.
Fixture: `tests/cases/unions/discriminant-value-is-set-beside-base.vl`, both spellings
(annotated and inferred), both directions, both bases.

## A `type` declared in a function body is legal and lexically scoped, may name the enclosing function's type parameters, and is refused loudly until built (owner, 2026-09-02)

The owner asked whether `type` inside a function body is legal. It was neither legal nor
refused: the parser admits it (`parseStmt` is shared between module and block scope), the
checker registers type names only from the module-level walk, and the declaration is silently
dropped — so one mechanism wore THREE faces (D1045): `unknown type 'P'` at the use, a
check-clean `unsupported statement in body` emit reject when the name is never used, and a
local `type P` that silently resolves to a MODULE-scope `P` of a different shape. The
precedent already in the language decided it: a nested NAMED `function` in the same position
runs today, and a declaration form that is legal in a body for functions and not for types is
a rule nobody would write on purpose.

**Ruled: legal, and lexically scoped to the block.** Every form the module-scope grammar
admits is admitted in a body, because `parseTypeDecl` is one production and the ruling is
about WHERE it may stand, not which arms:

| form | in a body | note |
| --- | --- | --- |
| struct `type P = { x: i32, y: i32 }` | legal | the filed witness |
| union / literal union `type R = A \| B`, `type K = "a" \| "b"` | legal | usable in `is` inside the body |
| recursive `type N = { next: N \| null }` | legal | self-reference resolves in the local scope |
| generic alias `type Pair<A> = { a: A, b: A }` | legal | instantiated where used, as at module scope |
| nominal `type Id = new i32` | legal | see the escape sub-ruling |

The name shadows an outer one for the rest of the block — the shadowing spelling in D1045's
table is the case the build is graded on, because it is the one that is WRONG today rather
than merely refused. Nothing about the type's REP changes: a local struct is the same
structural shape it would be at module scope, and two local declarations of the same shape in
two functions are the same type, exactly as two module-scope ones are.

**And a local type may name the enclosing function's type parameters.** The owner's second
question. `type P = { a: T }` inside `f<T>` is legal and is substituted per instance the way
every other node of the body is — the monomorphizer already lifts an arrow lambda that names
`T` (D426, closed 2026-08-30), and a local type is the same obligation on a different node
kind. Measuring the precedent found that the NAMED-function spelling of D426's own witness
still refuses at emit while the lambda runs (D1046); it is filed beside D1045 rather than
under D426 because the rule the owner agreed to — a body-scoped declaration sees the
signature's type parameters — is the one rule all three node kinds owe, and the build closes
them together.

**Two sub-rulings. The first is the owner's (2026-09-02, shown the example and answering
"seems like it should obviously be an error"); the second is vl-b7's recommendation and
stands unless the owner objects.**

* **A local NOMINAL type does not escape through an inferred return type — ERROR.** `type Id
  = new i32` inside `fresh` and `return Id(7)` with no return annotation would infer a type
  that no caller can NAME — the checker refuses it at the return, as it does any unnameable
  inferred type: `` return type `Id` is declared inside `fresh` and no caller can name it;
  annotate the return or move `Id` to module scope ``. A local STRUCTURAL type escapes freely
  as its shape, because the shape is the type and the caller can spell it. The asymmetry is
  the whole point of `new`: nominality is a name, and a name that goes out of scope takes the
  nominal identity with it.
* **Nothing else escapes either, and nothing needs a rule for it.** A local type used only
  in a local binding, argument, or `is` never reaches a signature, so the question of what a
  caller sees does not arise.

**Interim, shipped first: the DECLARATION refused loudly.** Until scoping was built, the
checker's body walk rejected a `TypeDecl` where it stood with `` a `type` declaration is
module-scope only for now (D1045 — ruled legal, not yet built); move `P` to module scope ``,
at the declaration's line, on every spelling — so the three faces collapsed into one message
that named the rule and the row. This was clause-2 hygiene, not progress on `runs`, and it was
scheduled that way: the loud refusal was small and landed ahead; the scoping build was the
ROADMAP item. Measured 2026-09-02 on seed 42604b65; witnesses under D1045 and D1046.

**BUILT (#2391), 2026-09-02 — and the build settled three things the ruling left open.**
The interim is removed with it.

*Where the name is resolved: the MODULE MERGE'S mechanism, one scope in.* The ruling said
"lexically scoped" and left the resolution open; a scope CHAIN in the checker was the obvious
reading and is the wrong one, because a type name in this compiler is answered by more than
one producer — the checker's `cUserTypes`, canon's rendered spelling, and the emitter's
per-name tables — and a checker-only chain would have them agreeing about the TYPE and
disagreeing about the REP. The merge already faced the identical problem (two modules may each
declare a `Pair`) and answered it by RENAMING: `typecheck.tyToStr`'s header says in so many
words that `Pair$m1` and `Pair` are different types to the tables that hold them. Two FUNCTIONS
may each declare a `P`, so the same answer serves — the parser mints a body-scoped declaration
under a unique name (`P` → `P$b7`), spells every reference in its lexical extent at that name,
and HOISTS the declaration node into `progStmts`. The hoist is what makes the rest free, and
it was measured rather than assumed: the checker's passes 0a–0d and every emitter registry
build (`collectS`, `collectU`, `gaeCollectDecls`, `resolveFlatLayouts`, …) read
`root.progStmts` and only `root.progStmts`. `demangleMsg` strips `$b<digits>` beside
`$m<digits>`, so nothing user-facing changes. **In the PARSER**, because recursive descent is
lexical by construction — "the rest of this block" and "the enclosing function's type
parameters" are both already on its stack — and because `parseTypeAtom`'s IDENT arm is the ONE
substitution site every type-position name in the language reaches, which makes the coverage a
property of the grammar rather than of a list of positions.

*Type-parameter capture is a GENERIC ALIAS, and only of the parameters actually mentioned.*
`type P = { a: T }` inside `f<T>` is minted `type P$b7<T> = { a: T }` and referred to as
`P$b7<T>`, so the per-instance substitution is the one the language already performs for a
module-scope `Pair<A>` applied at a type parameter — measured to run at two pins before the
build started, which is what made this a reuse rather than a new mechanism. Capturing every
live parameter unconditionally was tried and refused on a measurement: a local `type Id = new
i32` in a generic body would become a GENERIC newtype, which pass 0a does not support, so the
declaration would silently stop being nominal. The capture set is therefore decided by a
bounded token lookahead over the rest of the declaration — the answer is needed BEFORE the
body is parsed, because a recursive `type N = { next: N | null }` spells its own name while
the body is being read and must carry the same arguments every other reference does.

*What the ruling got wrong, and the residue it did not name.* **(a)** The ruling's sentence
"nothing about the type's REP changes … two local declarations of the same shape in two
functions are the same type" is true of ASSIGNABILITY and had to be checked for the REP; it
holds, because two same-shaped module-scope declarations under different names are already
mutually assignable and share a heap type (measured before the build). **(b)** D1046 was
UNDER-FILED as a loud emit reject: two further spellings of a nested named function naming
`T` — a return-only `T`, and a fully concrete signature capturing a `T`-typed local — were
`vl check`-clean INVALID WASM, which no narrowing of `checkParams`' message could have
reached, since that floor reads parameters only. **(c)** A residue the ruling's table does not
cover: a RECURSIVE local type inside a GENERIC function that mentions the type parameter
becomes a recursive generic alias and inherits the pre-existing module-scope refusal
`recursive generic type … is not supported — its expansion has no finite type name`. The
module-scope spelling refuses identically, so the local spelling inherits the gap rather than
introducing one. **(d)** The build also had to reach `vl fmt`, which the ruling never
mentions: the formatter prints an `Ident`, an `is` check-type and an `as` target from the NODE
rather than the source span, so a parser-side rename leaks into a file `vl fmt -w` writes
back — `TV$b1.size`, `11 as Id$b1`, neither of which re-parses. Demangled at those three
prints, with the scan given one home in the zero-import leaf (`tyname.demangleSpelling`).

## A failed assertion is located at the MATCHER, not at `expect` (owner, 2026-09-02) — BUILT (#2386)

The owner asked why a failure's location points at `expect` rather than at `toEqual`. Because
the track-caller ruling above anchored on `expect` by an UN-CONSULTED design choice: `expect`
was the only surface that took `caller`, and its `__callsite__` naturally reports the `expect`
token. The header at `std/test.vl` says so, and no one asked which token an author wants.

**Ruled: the matcher.** The failure is the matcher's — `toEqual` is the thing that decided
`false` — and on a multi-line spelling

```vl
expect(build(cfg))
  .toEqual(want)
```

the `expect` line is the setup and the `.toEqual` line is the assertion; Jest and Vitest
report the matcher's line for the same reason. When this was ruled that spelling did not
parse (`expected an expression but found DOT`, measured 2026-09-02) and the ruling said only
the COLUMN would move; the leading-dot continuation shipped the same day (#2382), so **the
LINE moves too** and the multi-line case the ruling exists for is live.

**How it landed (#2386).** Each matcher — `toEqual`, `toBeTrue`, `toBeFalse`, and `not`'s
continuation, which IS one of those three — takes a trailing
`caller: CallerLoc = __callsite__`, and the receipt drops the `caller` it carried from
`expect`. That is the one-hop rule applied one hop later: the matcher is the surface that
reports, so it is the surface that asks. `not()` itself takes NO caller and needs none — it
decides nothing, so the matcher after it is the one that reports, measured. std-side only, no
compiler work: `__callsite__` as a defaulted trailing parameter of a UFCS `self`-function
already anchors on the METHOD token at both spellings.

**The forwarding surface moved with the anchor, and that was the one open choice.** The
ruling's text said the receipt drops `expect`'s `caller`; it did not say whether `expect(v,
caller)` should survive as a forwarding surface. It did not. Two places to hand in ONE location
need a precedence rule between them — an `expect` caller versus a matcher caller — and the
only available answers are bad ones: a forwarded `expect(v, caller)` silently losing to the
matcher's own filled default is worse than not offering it. The one-hop pattern is now
`expect(v).toEqual(1, caller)`, which is one hop, still explicit, and still ordinary code.

**Measured on the built change, 2026-09-02.** A one-line `expect(x).toEqual(y)` at column 5
reports **column 15**; `expect(x).not().toEqual(y)` reports the final `toEqual`; the
two-line spelling reports the `.toEqual` LINE; `toEqual(expect(3), 4)` reports its own
`toEqual` rather than the nested `expect`; a helper forwarding its own `caller` reports the
helper's caller, and one that does not reports its own matcher in its own file; a passing
assertion renders no location. **The ruling's "column 14" above was off by one** — that is the
DOT's column, and the anchor is the method-name token after it. The arithmetic slipped in the
prose, not in the compiler.

**Cost, re-measured the way the track-caller entry above sets:** ten million passing
`expect(7).toEqual(7)` run 0.42–0.43 s anchored at `expect` and 0.41–0.45 s anchored at the
matcher, i.e. inside the noise — one `struct.new` either way, just at a different call. Size
went DOWN 10 bytes unoptimized on a one-assertion module (6,353 → 6,343: the receipt lost a
field and `not` lost a copy) and is byte-identical at `-O3` (`cmp`, 416 bytes both ways).

The editor's location line (`testDiscovery.ts`) is unchanged as a WIRE FORMAT — only its doc
comment moved, because it named the `expect` token as the anchor and that is now false.

**`std-api-reviewer`: approve-with-changes, and every finding was documentation.** Two are
worth recording here because they change the entry above. First, the strongest argument for
dropping `expect`'s `caller` is not the one the header first made: "no honest answer for
which wins" reads as taste, when in fact the obvious precedence rule (*an explicitly passed
`expect` caller beats a default-filled matcher caller*) is **UNWRITABLE** under defaults v1 —
a default is filled at the CALL, in the caller's frame, so a callee cannot tell a supplied
argument from an omitted one, which is §"Default arguments v1"'s own ABI finding read one
consumer later. Second, the review caught that this entry's supersession banner sat 80 lines
below the heading of the ruling it supersedes, so a reader grepping `CallerLoc` landed on the
old signature as current fact — the repo's own "claims about the tree" failure, committed by
the PR that created the staleness. The banner is now the first thing under that heading. Two
further corrections it forced: the two SIZE paragraphs quote absolutes from different
seed-days and different programs, so only their DELTAS compare (they read as a 30%
regression otherwise), and the `wasm-opt --closed-world -O3 --gufa -O3` command this file
recorded **refuses this tree's output** without `--all-features`.

**It was blocked by a compiler defect, found while measuring the move — closed the same day.**
A UFCS call that OMITS a defaulted tail argument was refused `no field 'toEqual' on
Expectation` in any module build that merges a `self`-function-bearing module — which
`std:test` is, so EVERY test file. The direct spelling and the supplied-argument spelling ran.
Filed as D1044 with an eight-row ablation and closed by #2371 (the merge's UFCS registry
matched the DECLARED parameter count exactly where its consumers match an arity range).
**That defect was the whole of the compiler-side cost**: with it closed the move is a std
diff and nothing else — every matcher call in every test file is a UFCS call omitting a
defaulted tail argument, so D1044 was not a blocker beside the feature, it was the feature's
only mechanism failing.

## A leading `.` on a new line continues the chain (owner, 2026-09-02)

**Ruling.** A NEWLINE followed by `.` or `?.` continues the postfix chain of the expression
before it:

```vl
expect(build(cfg))
  .toEqual(want)

items
  .filter(keep)
  ?.first()
```

The owner's framing: *"for long chains, allowing the `.` on the next line is basically required
or we have to deal with long lines."* Long chains are otherwise one line or nothing.

**Why it is free here, and the exact rule.** VL's NEWLINE is a real token, and no legal
statement starts with `.` or `?.` — `.5` is already a parse error at the DOT (lexer.vl, the
NUMBER arm) and there is no other leading-dot form — so the rule reinterprets ONLY programs
that are parse errors today; no existing program changes meaning. That is the same argument
JS, Swift, Kotlin, Rust and Ruby rely on (Go cannot, because its semicolon rule fires at the
trailing paren). The rule is deliberately tight, and these three edges are part of it:

* **`(` and `[` do NOT continue.** A line starting with `(` is a legal parenthesised
  statement today and a line starting with `[` a legal array-literal statement; admitting
  either as a continuation is the classic ASI hazard and would change existing programs.
* **Leading-dot is the ONLY form.** Go-style trailing-dot (`expect(x).` ⏎ `toEqual(y)`) also
  fails today (`expect("IDENT")` meets NEWLINE) and stays refused: two spellings of one thing
  is exactly what `fmt` would then have to canonicalise.
* **Comment lines between links work for free** — the lexer consumes `// …` up to the newline,
  so a commented-out link is just NEWLINE tokens.

**The formatter is the real half of the build (vl-b7's recommendation, standing unless the
owner objects).** `format.vl` is AST-driven and prints member chains inline, so without a
chain-break policy `vl fmt -w` re-joins the lines and `lint-self.sh`'s `fmt --check` makes the
form unusable in this repo. The policy is the deterministic one the formatter already uses for
lists — **fit-or-break**: a chain that fits within `fmtWidth` prints inline; one that does not
prints one `.link(args)` per line, indented one level, from the first link. `expect(x).toEqual(y)`
fits and stays on one line; a long builder chain breaks. No author-break preservation: the
formatter's output is a function of the tree and the width, as everywhere else.

**Build.** Parser: in `parsePostfix`'s loop (`parser.vl`), on NEWLINE peek past the run of
newlines and continue iff the next kind is `DOT` / `QUESTION_DOT` — a few lines. Formatter:
the fit-or-break chain layout. Fixtures: a leading-dot chain across 2 and 3+ links, one with a
comment line between links, `?.` as a continuation, a line starting with `(` and one starting
with `[` still parsing as their own statements, and `fmt` round-tripping both a fitting and a
breaking chain. The LSP is untouched (no new token kinds). A consequence for the matcher ruling
above: with the matcher on its own line the failure's LINE moves, not just its column — which
is the case where anchoring at `expect` would have sent an author to the wrong line.

## One name may not bind two IMPORTS, and the test is on the resolved DECLARATION (D1120, 2026-09-02)

`import { area } from "./a"` beside `import { area } from "./b"` is refused —
`Duplicate binding "area": … imports it from both "./a" and "./b"` — at the SECOND
import's name token, in the wording `modCheckDupBindings` already uses for a declaration
colliding with an import. The two halves of the duplicate rule were split for no reason:
import-vs-declaration was diagnosed and import-vs-import was not.

**Ambiguity, not redundancy, is what is refused.** The test is `modMergedTargetOf` — the
resolved merged target, the exact key `modBuildRename` pushes — not the specifier text. So
the same name imported twice from the same module, or through a re-export chain landing on
the same declaration, is redundant and still RUNS; only two DIFFERENT declarations under one
name are refused. Pinned both ways:
`tests/cases/modules/duplicate-import-same-declaration/` and
`tests/cases/modules/err-duplicate-import-two-modules/`.

**Why it is a rule and not a lint: the meaning was reader-dependent.** The merge's rename map
held two rows under one key and its readers disagreed about which won — `modRenamed` (VALUE
references) took the FIRST, `modRwTsName`/`modTypeRenamed` (TYPE positions) took the LAST. So
`tag` resolved to one module and `Tag` to the other in the same program, decided by which pass
asked. That is not a program whose behaviour a warning can make correct.

**The price, measured: exactly one corpus case, repo-wide.**
`tests/cases/modules/duplicate-import-first-vs-last/` was the only pre-existing program that
imported a local name from two specifiers (every other duplicate-local import in the tree —
126 of them, all in `compiler/*.vl` — repeats ONE specifier, which stays legal). That case
existed to pin the FIRST/LAST disagreement, "declared rather than fixed" in its own words,
because nothing had ruled on the shape that produces it. It is now an `@error` pin.

**A consequence to state rather than discover.** A duplicate rename key is now unreachable by
any compiling program — import-vs-import is this rule, import-vs-declaration is
`modCheckDupBindings`, and the injected template row's `from` is a name no program can spell.
`modRenameFirstBySid` and `modRenameLastBySid` are therefore no longer separated by any
witness, and collapsing them would redden nothing. They are kept: a collapse now needs its own
argument, since the case that used to supply the counter-example cannot.

**ADDENDUM (owner, 2026-09-02): the error is confirmed, and the REDUNDANT half now LINTS.**
Shown the diagnostic the same day it landed, the owner's words were "that's a good error" —
so the rule above stands as filed. On the half it deliberately leaves running, the ruling was
**"imports from the same source twice should lint"**: `duplicate-import`, a `warning` reading
`` Duplicate import `area` from "./a" (remove one) ``, anchored at the SECOND occurrence's
name token — the same anchor `unused-import` uses, so the LSP's remove-import quick-fix
serves it with a one-line dispatch change. Redundant is not ambiguous, and it is not silent
either.

**The lint keys on the SPECIFIER TEXT where the error keys on the resolved DECLARATION, and
that difference is the whole design.** The error asks "do these two bindings mean different
things?", which only the merged target can answer. The lint asks "did you write the same
specifier twice?", which is a question about the source and which a per-file, parse-only pass
can answer at all — `lint.vl` has no module graph and runs on every keystroke. Requiring all
THREE parts to agree (source text, imported name, local binding) is what keeps the two rules
from overlapping: `import { area as a } from "./a"` beside `import { box as a } from "./a"`
agrees on source and local but not on name, and is the ERROR's domain — measured, it reports
`Duplicate binding "a": … imports it from both "./a" and "./a" — rename one`, naming one
specifier twice because it is one specifier, which is correct and stays as it is.

**A RE-EXPORT CHAIN LANDING ON ONE DECLARATION IS NEITHER, AND THAT WAS THE CHEAP ANSWER.**
`import { area } from "./a"` beside `import { area } from "./b"` where `b.vl` re-exports
`area` from `./a` reaches one declaration through two specifiers. Measured 2026-09-02: no
error, no warning, prints `10`. The owner ruled an error there would be fine but is not worth
analysis that is not free — and keying the lint on the text is what makes leaving it legal
free, since `"./a"` is not `"./b"` and there is nothing to compare. Pinned as a program that
must keep RUNNING: `tests/cases/modules/duplicate-import-reexport-chain/`.

**THE PRICE, RE-MEASURED BY THE COMPILER: 122, AND THEY WERE FOUR WHOLE REDUNDANT BLOCKS.**
`vl check` over `compiler/` and `std/` in DIRECTORY mode — each file its own entry, so nothing
is counted once per importer, which the single-file mode does and which turns 122 into 989 —
found **122 hits, 0 in std**, every one inside a second `import { … } from "./ast"` statement
whose every specifier the first already carried: `format.vl` 32, `lint.vl` 26, `typecheck.vl`
35, `wasmEmit.vl` 29. Four block deletions, no specifier moved, the emitted compiler unchanged
in behaviour. The compiler's own source is now `duplicate-import`-clean, which is the standing
condition `scripts/lint-self.sh` enforces from here.

**The "126" above did not reproduce, and the three-part key is NOT the explanation.** A
by-hand scan of the same tree keyed on (source, LOCAL) alone — the two-part reading the
sentence describes — also returns 122, so the four are not specifiers the narrower key
excludes; they are a number nothing here re-derives. Left standing as filed rather than
silently corrected, because the count is not what that paragraph is for and the discrepancy is
the more useful thing to record: **122 is the number a tool produced from the tree on
2026-09-02, and it is the one to re-derive rather than quote.**

**A SECOND WARNING ON ONE MISTAKE IS A BUG, AND MAKING DUPLICATES VISIBLE EXPOSED ONE.**
Binding-keyed use tracking resolves an occurrence to the INNERMOST binding, so with a value
import written twice the SECOND binding absorbed every use and the FIRST read `Unused import`
— on a line whose name is referenced two lines down. `unusedImports` now skips a binding that
a LATER import binding of the same name shadows: two import bindings of one local name are
the same declaration in any program that compiles (this rule refuses the other case), so the
twin's use is this one's use, and where the name really is unused the LAST binding still
reports it once. One mistake, one diagnostic, at the specifier the fix should delete.

**AND THE NAME-KEYED UFCS FALLBACK IS GONE (D1191, 2026-09-02).** The rule above is about two
imports binding one name; this is the same table's other end. The merge's plain→mangled alias
map was keyed by NAME and global to the whole program, so a row banked by ANY module's
`b.hidden()` answered every other module's `b.hidden()` — and an UN-EXPORTED `self`-function
became callable from a file that never imported it, while the direct spelling `hidden(b)`
stayed `undeclared identifier` two lines away. D1120 built the per-call-site table for the
ambiguity case and left the fallback serving callers that should get nothing.

Measured before deleting rather than guarded: with an instrumented seed counting every reader
whose fallback CHANGED the answer, over `tests/cases` + `std/` (2,684 programs) and the
compiler's own 26-module source through check AND emit, the member-call reader hit it **0
times** and the generic-bound reader (`witnessOf`) **3 times, all in one file, on a name that
file imports**. So the map is deleted and the merge's own per-module scope replaces it:
`ufcsScope*`, one row per (module, plain name) the module binds to a `self`-function, walked
out of the rename map `modBuildRename` already computes. `ufcsAliasAtSite` = the site's row
else the CALLER's module scope; `witnessOf` = the PIN's. Nothing about UFCS is name-keyed
across modules any more, which is what makes "a UFCS candidate must be in the caller's scope"
a property of the resolver rather than of which module the walk visited first.

## An else-less `if` used as a VALUE is `T | null` in every position (owner, 2026-09-02) — D1086, BUILT

**Ruling.** An `if` expression with no `else` has the value of its arm when the condition
holds and `null` otherwise, so its type is `T | null` — at a binding, in return position, as
a `??` operand, as an argument, everywhere a value is consumed. In STATEMENT position it stays
`void`, as today. The checker must give ONE answer: today it types `const x = if c { "hi" }`
as `string | null` and accepts it, but calls the same expression `void` in return position
(`return if c { "hi" }` → `return type mismatch: expected string | null, got void`) and as
a `??` left operand. Those cannot both be right, and the value answer is the one the
language already implements at the position people write first.

**Why this and not "an else-less `if` is never a value".** The alternative (Kotlin's rule:
require `else` to use `if` as an expression, loud check error otherwise) is tighter, but it
takes away a spelling that RUNS today at bindings — a `runs → not-runs` change over the
tree — and it contradicts the Elixir model this language follows for `if` (`if cond, do: x`
is `nil` when the condition fails). `T | null` is what the binding position already means;
the ruling makes the other positions agree with it.

**BUILT (D1086, [inventory](docs/internals/silent-class-inventory.md#d1086)).** The checker
rule is ONE line, not a position table: `checkIfStmtNode` returns `thenTy | null` whenever
the then arm carries a value, and the statement half needs no gate because a statement arm's
`thenTy` is already `void`. The emitter's synthesized else arm is the rep's own null at the
four value-`if` sinks, written by `fbRefNullOfKind` — `fbValtypeNullable`'s value twin, arm
for arm over `VKind`, so a cell's declaration and its null cannot name different heap types.
The 2×12 scope × rep grid grades **48 of 48** running at both the annotated and the
un-annotated spelling (it was 14 of 48 when the build started, not the filed 6 of 24 — the
row's table had gone stale under an unrelated merge), and the position matrix grades 20 of
21. The residue is [D1250](docs/internals/silent-class-inventory.md#d1250): `??` over an
if-expression written IN PLACE, which refuses at the explicit-`else` spelling too and is a
`??` defect this ruling only made reachable.

## UFCS is never implicit: the compiler resolves `x.f(…)` only against names IN SCOPE; the LSP surfaces the import (owner, 2026-09-02)

**Ruling.** `expect(1).toEqual(3)` needs `toEqual` imported, and that stays the rule. The
compiler does NOT look into the module that defines the receiver's type for an exported
`f(self: T, …)` — a type-directed fallback was proposed and declined as "potentially buggy;
for now we don't need it". What changes is the TOOLING: the LSP must be able to find the
free function — completion after `expect(x).` offers `toEqual` from `std:test` and inserts
the import; the `no field 'toEqual' on Expectation<i32>` diagnostic (D1230) gets a quick-fix
that adds the name to the existing import from that module — and the compiler's diagnostic
names the missing import rather than blaming the receiver (D1230's fix, compile-goal track).

**Why.** Implicit resolution adds a second name-resolution source the reader cannot see in
the file (a name from an un-imported module becomes callable), and every such rule is a
place for two answers to disagree. The papercut is real — one assertion needs two imports —
but it is an EDITOR problem: the editor knows the receiver's type and the module that
exports its methods, and can write the import for the author. Revisit only if the explicit
rule proves unworkable in practice.

**Build.** Tooling track (vl-b7): (1) completion — after `.` on a receiver whose type comes
from module M, list M's exported functions whose first parameter accepts the receiver, with
an `additionalTextEdit` that adds the name to an existing `import { … } from M` or inserts
one; (2) code action on the D1230 diagnostic — `Import \`toEqual\` from "std:test"`; (3) the
same for a user module in the workspace graph, not only `std:`. Compile-goal track (vl-07):
D1230's diagnostic text and a stable diagnostic code carrying module + name, so the quick-fix
keys on the code rather than parsing the sentence.

**BUILT 2026-09-02 — BOTH HALVES.** The three tooling items ship, and so does the
compile-goal half: the refusal names the missing import and carries the quick-fix's whole
answer in machine form, so the code action never parses the sentence. The fallback on the old
message shape is therefore retired. ONE diagnostic lists every candidate module, so the
quick-fix emits one code action per candidate rather than answering N squiggles on one token.
Specifiers are spelled the way the file can write them TODAY: the file's own import text where
it already imports the module, and the bare `std:` key where it does not. A RELATIVE module
the file does not import is deliberately NOT offered — its key is a normalized path, and
reconstructing a specifier relative to the entry is `..`-arithmetic that can name a different
module.

Three things the build settled that the ruling could not have known:

* **The candidate set is the CHECKER's, not the host's.** `Expectation<i32>` fits
  `self: Expectation<T>`, and nothing the host holds — a rendered type string — can decide
  that. So the LSP gained one query, `ufcsCandidatesAt`, which asks `declFirstParamIsSelf` +
  `assignable` of every declared `self`-function: literally the pair `ufcsCallTy` applies to a
  written call, so the offered set cannot advertise a call the checker would then refuse.
  Nothing about type matching moved into TypeScript.
* **Reaching an UN-IMPORTED module needs a NAMED import, not a bare one.** `import "std:str"`
  resolves the specifier and merges NOTHING — measured, and the scan comes back empty. One
  ALIASED named specifier (`import { trim as __vlUfcsProbe0 } from "std:str"`) merges the whole
  module while binding a name that cannot collide with the author's, and the declaration's own
  name — what the scan reports — is untouched by the alias. Eleven std modules cost ~20 ms.
* **A MODULE KEY IS NOT A SPECIFIER.** The checker reports `/proj/shapes.vl`; the import
  statement spells `./shapes`. Writing the key would have produced a wrong edit rather than a
  missing one, and only the workspace-module test caught it — `std:` keys ARE their specifiers,
  so every std case passed either way. `importSpecifierForKey` is the inverse of
  `resolveImportSpecifier`, and prefers a spelling the file already uses over any it derives.

Two capabilities fell out of the second one and are worth naming, because neither was asked
for. A CALL receiver — `expect(1).`, the papercut's own shape — now completes at all: the
field scan STRIPS the trailing `.` and re-resolves the receiver as a BINDING, which only works
for a bare identifier, while the UFCS probe APPENDS a property and keeps a real member access.
And the same appended-property trick is what lets the quick-fix ask about
`expect(1 + 2).toEqual(3)` without repairing anything: the diagnostic points AT the member, and
the receiver is that access's object, whatever expression it is.

### A diagnostic code is a bare CATEGORY; its payload rides `data` — 2026-09-02

The first build of the answer above had nowhere to put it. The diagnostic ABI had ONE string
channel (`diagCodeLen`/`diagCodeByte`, `TDiag.tcode`), so the payload was packed into the code:

    ufcs-not-imported;member=toEqual;modules=std:test;recv=Expectation<i32>

`;`-separated, fixed order, `,` between specifiers, `recv=` last because a rendered type was
the one field that could contain those characters. It worked, and the shape of what it cost is
the point. **Every consumer owed a `diagCategory(code)` cut at the first `;` before it could
compare a code at all** — an `===` against `ufcs-not-imported` silently stops matching the day
a payload is added, which is exactly what happened. The framing lived in the values: `recv=`
had to be LAST, `modules=` needed specifiers that hold no `,`, and each new field was another
character some value must never contain. The code stopped being a category and became a
one-off grammar that only its own writer and reader understood.

**So the ABI grew the channel it was missing.** `TDiag` carries `tdata`, exported as
`diagDataLen`/`diagDataByte` beside the code pair, and `CODE_UFCS_NOT_IMPORTED` is the bare
word again. The payload is netstrings — `<byte-length> ":" <bytes> ","` — read as alternating
KEY and VALUE:

    6:member,7:toEqual,7:modules,8:std:test,4:recv,16:Expectation<i32>,

The length is authoritative, so a value may hold ANY byte — `;`, `,`, a `"` from a
string-literal type member, a newline — with nothing escaped and no field order to preserve.
**A REPEATED KEY IS A LIST**, which is how `modules` carries every candidate: there is no
`,`-joined value to re-split, so a specifier holding a separator cannot merge two modules into
one. And the length is a UTF-8 BYTE count, not a JS `.length`, which is why the TS decoder
(`compiler/diagnostics.ts` `decodeDiagData`) takes bytes: `{a: i32, tag: "a;b,c|d" | "éè"}` is
31 characters and 33 bytes, and a reader that sliced the decoded string would be two bytes
wrong on a real type name.

Three decisions inside that are worth keeping:

* **`diagCategory` STAYS, and nothing depends on it.** It is a tolerant reader against the
  next packed code, kept because the mistake is cheap to make again — not a fallback anything
  calls.
* **A malformed payload decodes to `{}`, never a partial read.** This is a channel between two
  halves of one toolchain, so disagreement means a seed/host mismatch; a quick-fix acting on
  the readable prefix would write an import from a module the compiler never named.
* **The quick-fix stopped asking the checker anything.** It used to re-run `ufcsCandidatesAt`
  per lightbulb and convert module KEYS back to specifiers in the host. The compiler decided
  both at the raise, so `onCodeAction` is now synchronous.

`--json` deliberately carries neither the code nor the payload for a COMPILE diagnostic
(`compiler/cli.vl`, unchanged): the payload is an editor's answer, and the fix is an edit no
batch reporter performs. Adding it would store a field nothing reads.
