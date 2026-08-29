# VL — Design Decisions

Decisions where the **rationale isn't recoverable from the code**.
Implementation detail lives in the code, git history, and `docs/`; this file is
the "why we chose X over Y." Keep entries terse (≈2–4 lines) — the decision and
rationale, not a code walkthrough. Append new entries under the relevant
section. Roadmap items reference these by their tag (e.g. A15, B14).

_(Consolidated from ROADMAP.md, 2026-06-05.)_

## Types & semantics

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
- **`==`/`!=` are structural (by value) by default.** `{x:1} == {x:1}` is `true`
  — consistent with numerics and strings and VL's value semantics.
  Function-valued fields compare _by reference_ (same function + same captured
  env): "data by value, functions by identity." A custom `==` overrides. (A15)
- **Referential identity gets its own spelling.** `is` is reserved for
  type-narrowing, so an O(1) `ref.eq` identity check would be `===` or
  `identical(a, b)` — deferred. (A15)
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
  total functions are bare* (`print`/`toString`/`fromCodePoint` vs
  `__trap__`/`__store_i32__`). Shadowable because `min`/`max`/`abs` are the names
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
refusal the pin dropped, an ACCEPTANCE it dropped. (D42, #TBD)

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
the NUMERIC tail and emitted `i32.add` over two refs. (D44, #TBD)

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
prescribing the thing that produces it.** (D46, #TBD)

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
