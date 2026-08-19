# Workboard — the itemized queue

The ACTIVE queue, ranked. `ROADMAP.md` owns strategy and the long tail; this file
owns what is scheduled, what is in flight, and what was measured away. One line
per item, each with an anchor and a measured population, so nothing here needs
re-derivation before it can be picked up.

**Priority bands, as set by the owner:**

1. **Destringify types** — stop representing types as raw strings; stop parsing or
   building strings to represent them. Efficient, type-safe data structures instead.
2. **Webcraft asks** — the consumer-driven requirements.
3. **Everything else.**

Performance is a standing concern across all three bands, compile time and runtime
both. So is the language's chief design aim: **near-zero annotations, fully typed,
likely-error behaviours blocked**. An item that forces an annotation the inference
could have supplied is a defect against that aim, not an ergonomics nicety.

---

## The rule this board exists to enforce

Every number here carries its denominator, and every claim carries an anchor.
This programme's recorded history is that **three consecutive slices found the
filed unit or number wrong**, and that ranking by the wrong unit inverted the
order (#1327: 80.3% of "reaches" were memo hits, so 15,901 reaches were 3,031
parses). Three classes are kept apart on purpose:

- **MEASURED** — re-derived on a current base, with its denominator.
- **BRIEFED** — filed but not verified since the base moved. Re-measure before scheduling.
- **REFUTED / EXHAUSTED** — measured away. Recorded so it is not re-opened.

A measured negative is a result. "No rung here" closes an item as legitimately as
a fix does.

---

## In flight — re-weighted to the owner's priority bands (2026-08-17)

After a long run in band 3 (silent-class correctness), the queue is re-balanced so each band has a
live slice. All three were re-derived on the tip before briefing.

| band | item | verified on the tip |
|---|---|---|
| **3 — soundness** | ~~**`boolean` is silently assignable to `i32`**~~ **REFUTED — MY CONTROL WAS INVERTED** | It is **spec'd feature A7b**, pinned by `tests/cases/types/boolean-to-i32.vl` (five `@log` oracles over binding, argument and return) and named at `CHANGELOG.md:107`. I read "the bare literal `const b: i32 = true` is rejected" as proof the coercion was accidental; `boolean-literal-to-i32-reject.vl` says the opposite in prose — *"`let x: i32 = true` is far more likely a mistake than an intended coercion — write `1`/`0` — so the literal form stays rejected"*. **The literal rejection is the deliberate guard that makes the feature safe, not evidence against it.** Removal was measured anyway so the number is on record: **1 of 1970** corpus files (the pinning fixture) and **0 of 27** `compiler/*.vl`, a 6-line deletion at `typecheck.vl:6268` if the design ever changes. **A real defect was underneath it** and shipped as #1459 — see below |
| **3 — object literals** | **two defects, TWO roots — proven, not assumed** | shipped as **#1460**. **A** (`typecheck.vl` `objShapeAdapterless`'s ObjLit arm): a **shortened mirror inside #1456's own exemption** — the header already said a field the destination lacks has no lowering "under ANY source form", but the arm carried the field-VALUE leg and not the dropped-FIELD leg, so it never reached the shared `objFieldNameSetsEq` decision and `emitObj` walked the DESTINATION's field list, never visiting the excess field. **B** (`emit_classify.vl` `anonFieldCode`): a **syntax-only ladder** — NumLit/StrLit/lambda/Ident-naming-a-function/arithmetic BinExpr/numeric ArrayLit/nested ObjLit/map-typed Call, everything else `-1`, leaving the WHOLE shape un-interned. **One root wearing two messages** (`ref valtype with no interned shape` for a module-global, `object literal but no struct type declared` for a function-local) — which is why it read as two defects. **The independence proof is a single probe**: a CONSTANT excess field (`{ legs: 4, purr: 1 }`) interns fine, so B cannot apply, and it still silently drops — I verified that cell on master myself before integrating. Grid **48 → 288 of 360 correct, 240 newly accepted, 0 regressions**; A rejects **3 of 1970** corpus files, all three self-indicting (one's own header had filed this defect as *"KNOWN, MEASURED, AND DELIBERATELY NOT PINNED HERE"*). Nine sabotage legs, nine exact by name |

**A prediction of mine that was REFUTED, recorded so it is not re-run.** I hypothesised the boolean→i32 hole was rep-equality leaking into assignability, since `boolean` and `i32` share a rep. That predicts `i32[] ← boolean[]` is also accepted. **It is not** — both the literal and variable forms are correctly rejected. So the array path already carries the arm the scalar path lacks, which makes it the likely reference sibling rather than a second victim. Also refuted: "inferred vs annotated" is *not* the axis — `function g(x: boolean): i32 { return x }` has an explicit annotation and is still accepted. The axis is **literal vs non-literal**.

## Landed this cycle

| item | PR | result |
|---|---|---|
| **the checker's internal absence marker reached users** | #1472 | shipped, closing **E8**. `<none>` now renders `_` (E7's shipped vocabulary for a hole — same sentence to a reader); **`<error>` deliberately STAYS**, a measured non-change with all three alternatives refuted: `_` misdirects because the reader already has `unknown type 'nosuchtype'` BY NAME, suppression is refuted by a CONTROL (`function mk(): i32` is rejected identically, so the gate is not a cascade — only its render was polluted), and rendering the source name is impossible because `TY_ERR` is a SINGLETON arena entry keyed by index. **The corpus is not the population**: 4 corpus occurrences of 300 error-producing / 1,137 diagnostic-producing / 2,004 files, but **74 CONSTRUCTED cells** show `<none>` reaching **12 distinct message templates** and 8 shapes, while `<error>` reaches **exactly ONE** template and only inside a function type, because an errored type is assignable both ways and every assignability check absorbs it. `<?>` is 0 of 74 and 0 of 13,510 — unreachable, confirmed not assumed. **A pin that stopped ONE TOKEN SHORT is how the leak survived**: the fixture pinned `got` and the marker began at the next token. Byte-identity **2,004/2,004** with the shared-`tyToStrAt` hazard measured rather than assumed; 2 of 13,510 diagnostic lines moved. Three sabotage legs, three exact — **and one exposed a real hole in the LSP grader**, whose corpus sweep observes the FILTER rather than the producer, which is why the corpus fixture is the pin |
| **every function-typed union arm shared ONE box tag** | #1471 | shipped, closing **D6 — the last live silent population on the board**. `unMemAtomKind` answered value-atom kind 11 for EVERY `TyFunc` whatever its signature, so both arms boxed under one constant and `x is F` was a constant TRUE. **51 RUN-WRONG + 1 wrong-branch trap → 0** of 112 cells. **Shares ROOT A with #1340 but reaches a different BRANCH, and membership does NOT transfer**: #1340's arms are gated on a tested type with literal MEMBERS, empty for a `TyFunc`, so the function shape was never a candidate and fell to the bare tag compare — the concrete form of "shared root is not one fix". A closure's signature is **not in the value at all** (the fat pointer is `{env, table index}`), so there is nothing to take a membership test over. **What transferred was the CORRECT column's own shape**: `F[] | G[]` always discriminated because `refArrSlotTag` keys on the element's interned reflist SLOT, so a bare function arm now tags on the slot its canonical render interns at. **The census's own dismissal was wrong on one half** — it ruled out "a `$fnsig` id in the box tag" as a closure-struct layout change, but the box tag is field 0 of the UNION BOX and no layout changes: *the fix was inside the sentence that excluded it*. **The dimension I flagged as most suspect was checked and was clean** — every cell ran in both directions and both fail identically on master. A sabotage prediction was WRONG (34/36/3 against a predicted 36/36/0) and being wrong is what identified the three corpus files interning ≥2 closure signatures. Byte-identity **1966 of 2002**, and all **36 movers attributed by a third build**, every one still building rc 0 |
| **a wide-scalar PARAMETER decided the width of everything inside its argument** | #1470 | shipped. `emitCallDirect`'s argument spine seeded `pendingI64`/`pendingF32` from the CALLEE'S PARAMETER, then delegated to plain `emitExpr` for every non-bare-literal shape — so the hint **rode the whole argument subtree** and every integer literal anywhere inside took the wide form while its own slot was still i32. These flags are a property of ONE LITERAL POSITION, never of the tree around it. **`idi(1 + 2)` was check-clean invalid wasm** — about as ordinary as code gets. **32 of 128 cells, 94 → 126 correct, 0 backward**; byte-identity **2006/2006**, which also refutes #1469's flag that this fix would move corpus bytes. Sabotage predicted 1 fixture / 2 failing tests and justified the prediction IN ADVANCE from the byte A/B (if 2006/2006 are identical, no pre-existing file CAN move) — actual exactly that pair. Shares a decision site with `numerics/f32-context-call-argument.vl` but reaches the OPPOSITE branch: that one is the enclosing context leaking INTO the argument, this one the argument's own parameter context leaking into the argument's i32 SUB-POSITIONS, which the existing top-of-spine clear cannot reach because the spine re-seeds per iteration |
| **a generic call's argument pin had two shortened ends** | #1469 | shipped, closing both cells #1467 filed. Each root confirmed by an **in-compiler probe**, not a reading (`monoArgTyName` wrapped to log its answer beside the annotation and the recorded type, gated on a `zz`-prefixed enclosing name so it stayed inert during the self-compile). **The two roots point in OPPOSITE directions**: the `Index` arm cut the `[]` off an array pin that was already CORRECT and then re-guessed the element, accepting it only when `isSName` claimed a struct; while the nullable arm's annotation ladder correctly DECLINED and the rep cascade answered anyway, so the pin — which becomes the instance's parameter annotation — dropped its own `| null`. **Not a shared root, proven by a cross-product rather than a reading**: the Index peel moves 73 element cells and **0** nullable; `monoNulAnnName` moves 0 element and **40** nullable. Against D5 they land on opposite sides and each names its BRANCH: cell 2 shares D5's root AND its branch (D5's fix could not close it because that ladder declines nullables BY DESIGN), cell 1 shares only the decision SITE and reaches a branch `monoAnnPinName` was never wired into. Grids **119→192 of 260** and **64→104 of 144**, both **0 backward**; byte-identity **1,999/1,999**; sabotage predicted 2, measured 2 off a saved artifact. **Two controls relocated the axis** — a concrete forwarder and the no-forwarder spelling both moved, so it was never about generic forwarding — and 2 of the moved cells were runtime TRAPS that were correct on a value and trapped on `null`, the same dropped `| null` in a rep that survives it |
| **`tyToStructStr` source-spells — and the `->` WAS the classifier** | #1468 | shipped, closing Band 1's last follow-on. **The dependency ran BACKWARDS from the filing.** Four sites asked `strContains(elem, "=>")` to mean *"the element is a closure"*, and the unparseable `->` was the only thing keeping a closure FIELD invisible to them — a coarse substring test giving the right answer for the wrong reason. `emit_base` already carried this exact repair TWICE; the bare-ELEMENT corner had four hand-written copies. Re-keyed to one `nameIsClosureElem`, so the `srcSpell` bit is DELETED and `tyToAliasBodyStr` retires. **The hazard was one site, not four**: of 9 per-site cells, eight move **0 of 1,990** and only `nodeArrayElemName`'s TyObj element moves anything — three of #1463's four filed hazards are free, and per-leg it is the **arrow leg alone**. Round-trip **42.4% → 73.2%**, residual 117 with **0 carrying `->` and 0 carrying `?`** (~100 are the canon pass's unquoted literal-union vocabulary, a different language). Byte-identity **0 of 1,990**. Two grader-is-live legs predicted before running, both exact — one of them proving **the corpus channel is blind to the cell its fixture witnesses**. Fixed a master-side defect on the way (an inferred array of closure-valued MAPS, where the `=>` belonged to the map's VALUE) |
| **the last two silent families** | #1467 | shipped. **The silent class of inventory-2 is now ZERO of its 76.** D5: `monoArgTyName`'s ANNOTATION channel had no map/Set arm, while the recorded-type channel is **structurally blind inside a generic body** (the recorded type of `x` IS the type parameter, and `buildLocals` is post-mono so every fallback table is empty) — the substituted annotation was sitting there unread. **D5 DOES share D4's root and the inventory was RIGHT** — what was wrong was my assumption that D4's fix closed it: D4 landed in the recorded-type branch, which by construction cannot answer there. So **"shared root" does not imply "one fix"**, and the inventory's other shared-root claims are not impeached. D6: `arrLitIsF32` **did not exist anywhere in the tree**, and it bites with NO generic in sight — `const a: f32 = 1.5; const xs = [a]` was check-clean invalid wasm, which I verified on master. **Two of the five dimensions I held fixed were hiding cells**: a `const y: T = x` forwarder fails for EVERY non-i32 rep (8 extra cells, I re-verified with `string`), and the rep is 6 map/Set spellings not 4. Grids 146→198/234 and 56→65/65, **0 backward**; byte-identity 1,990/1,990; sabotage predicted 3, measured 3. A **refuted prediction changed the fix**: the f32 arm alone turned the cell silent→LOUD, exposing that the family was missing from three sites, not one |
| **a union variant's INLINE-shape field had no collector floor** | #1466 | shipped, and **my briefed hypothesis was refuted on both counts — which is exactly what briefing it AS a hypothesis was for.** (1) **Shared root REFUTED by a decisive measurement**: the path-A fix moves all 9 of path B's cells ZERO, message for message, and #1464's own CHANGELOG had already recorded path B as a separate leftover. (2) **My axis was wrong, and the inverted control was inside my own repro**: a struct-typed variant field is NOT unsupported — the DECLARED-NAME spelling has always lowered, at 1 and 3 fields, depth 2 and depth 3. I verified that on master myself. The real axis is the field type's **SPELLING**: `collectU` is the first emit pass, so the struct table does not exist yet — an inline shape's only resolution needs it, a declared name resolves off the arena. The inline-ARM recorder never had the floor; only `collectVariantFields` lacked it. **My two original probes used different spellings and I folded their distinct failures into one root.** **Path B is TWO floors, neither about field types** — depth 1 with a flat i32 field reproduces both: an un-annotated literal fieldset-twinning a variant (`collectAnonShapes` skips it), and a **module GLOBAL** annotated with a variant name (storage class is the axis — local and param lower; I re-verified). Both left unfixed **on measurement**: deleting path B's guard lowers every cell but reddens **7 of 1,524** `@run` rows including one that PINS a variant as a first-class value. **It also found and repaired a pre-existing defect**: `collectA`'s deferred code-15 intern discarded its own return, and the intern DEDUPS by wasm code while the consumer looks up BY NAME, so `{b: boolean}` landed on a `{b: i32}` row. Byte-identity **1,522/1,522**; two sabotage legs, both exact (3/2 and 1/4) |
| **B8 — the monomorphizer re-parsed a type name it had just recorded** | #1465 | shipped, and it **re-grades B8 rather than closing it**. `synthTypeRef` already records `(node, name, pin)`; two `monoMakeInstance` sites re-recorded the same node one line later with the same name and the same pin (`monoBuildPinCol` is `pinKinds`' only producer and its body IS `pinKindOfName` — 705 comparisons, **0 disagreements**). Bank covers **710 of 710** re-records and the mint column partitions exactly: 450 index-identical and **none** minting, 260 disagreeing and **239 minting**, because `T.tys` is not hash-consed so the second parse appends a TWIN ROW. **4,540 → 3,941 parses (−13.2%), −234 duplicate arena rows**; predicted 599 from the split table before running, read 599. **Byte-identity 1,988 files × 4 channels including a sha256 of the emitted wasm: 0 rows moved**, head its own fixpoint at −48 B. Both sabotage legs are INVERTED CONTROLS, which is the right instrument for a refactor whose danger is a dead grader: dropping the pin moves 3 of 339, and extending the conversion to the original-node arm makes 1 of 339 emit an invalid module — simultaneously proving the grader live and showing the containment at 111 is principled. **Terminal condition re-filed**: 3,796 of the residual 3,941 are emit-time names with no tree BY CONSTRUCTION, so B8 ends in a **producer conversion, not a descent deletion**. `unionMemberGenAppShape`'s 32 are refuted as filed — its sites sit inside the pass that rewrites the names it is passed, so a root-fed resolution would claim an application the name no longer is |
| **a union-annotated global's struct layout came from its object literal** | #1464 | shipped, settling #1462's leftover face-2 pin. **Two filings were wrong before this one** — the board's ("a union arm carrying a struct-typed field") and mine ("a field-name collision"). The axis is a **FIELDSET TWIN** plus a **storage class**: the field-name SET identical to some other struct's — order irrelevant, field types irrelevant, and the twin need not be the field's own type — AND a module global annotated with a union alias and initialized by an object literal. Param, local, and global-from-a-call all work. Root: `structIndexOfLet` fell through to the INITIALIZER when the annotation named no struct, and an object literal answers that query BY FIELD-NAME SET, so it returned the twin's row. `paramStructIndex` already held the annotation-only discipline, which is why params were fine — the storage axis falls out of the root. **One root at two depths**, confirmed: `field access receiver is not a struct` for `u.v.v`, `ref valtype with no interned shape` for `const g = u.v`; one guard clears both, and I verified both. Byte-identity **2,075 of 2,078** with the 3 movers being exactly the fixtures (rc 1 → rc 0); sabotage predicted 6, measured 6 by name off a SAVED artifact. The mis-teaching fixture was **corrected and converted to `@run`/`@log 5`**, its false "the spelling is not the axis" claim deleted after re-measuring all three spellings |
| **the display renderer emitted three spellings VL cannot parse** | #1463 | shipped, closing **B2e** and with it the last in-flight Band-1 row. Round-trip **1,596 → 2,085 of 2,089** hints over 1,905 corpus files, re-derived because the filed counts predated #1457. `arrElemRender` **confirmed** as the shared home exactly as filed — called from both EMIT renderers' `TyArray` arms and nowhere else, while the display arm was a bare `elem + "[]"`; three sibling groupings (TyFunc-result, union-function-member, nullable-function-inner) were in the same state. **The grouping leg was under-filed by me and is not cosmetic**: `A | B[]` parses successfully to a DIFFERENT type, so master emitted `cannot assign A | B[] to 'bad' of type A | B[]` — a type unassignable to itself. It now reads `cannot assign (A | B)[] to 'bad' of type A | B[]`, which is true. **It caused a regression and fixed it**: reaching the shared home made `T.tys[-1]` reachable — the hole an empty `[]`'s element carries — and TRAPPED the compiler on `lambda-empty-array-literal-return.vl`; `arrElemRender` is now total. Found a **second home**: 25 hand-written completion `detail` strings spelled `->` into the same column, so half a popup disagreed with the other half. Sabotage predicted from directive text before any sabotage existed: 196/121/106 vs **193/119/99**, every over-count explained, **zero unpredicted reds**. Byte-identity **1,618/1,618**. **503 corpus directives across 262 files** moved, each gated on canon-equivalence, 26 flagged and left untouched. `tyToStructStr` deliberately byte-frozen — source-spelling it moves 5 modules' bytes and turns 3 into loud emit rejects, so it is its own slice |
| **a fused `>>` banked a `>` credit three type loops did not consult** | #1462 | shipped. **Both filed axes were wrong, mine included.** The board said "generic alias application as a union member"; I re-filed it as "nesting depth"; it is **the lexer's fused `>>` token**. `Box<Box<i32>> | i32` parsed as `Box<Box<i32>|i32>` — the compiler prints it, and I read it off the diagnostic myself before and after. Genericity and depth are only the conditions under which a `>>` gets WRITTEN. `expectTypeGt` banks extra `>`s in `pendingGt`; while a credit is outstanding the argument list is still open, but `|`, `&` and `[]` read the raw next token. The `,` loop **already consulted the credit**, which is exactly why multi-ARGUMENT applications never showed this. **Why one face was silent and eleven loud**: with both arms folded into one type there is no union, so the value takes a plain-struct rep and `is` const-folds to FALSE (`i32.const 0` in the disassembly, no `{tag,value}` box). **The new control names the axis**: `Box<Box<i32> | i32>` closed with a PLAIN `>` banks nothing, so its `|` must still extend the argument — the credit discriminates, not the token. A **second, independent root** stands (`wasmEmit.vl:4625`, a union variant's struct-typed field has no emitted read), proven separate by staying green under the sabotage. Sabotage predicted 6, measured 6 by name; byte-identity 11/11 of every file that can bank a credit |
| **`??` over `boolean | null` lowered to a wasm `select`** | #1461 | shipped. The niche is an i32 cell (`0`/`1`, `2` for null) and an i32 sentinel has no `br_on_null`, so all three arms lowered as `select` — **one opcode that evaluates BOTH operands unconditionally**, so the default always ran. The **sibling ladder sat immediately below in the same file**: the `K|null` litunion arm, same rep, same blocktype, same call-stash slot, already branching, its comment already pricing the trade at "three bytes more per site" — measured at **exactly +3/site**. Axis is the **LHS source, not the position**: `emitCoalesce` has exactly one call site, so position cannot select the arm. 8 sources, **7 broken → 0**; the 8th (fused `m[k] ?? d`) already branched and is the unmoved control. Positions 14/14 → 0, reps 1 of 9 → 0. **Other-construct sweep came back EMPTY and is reported anyway**: 12 short-circuit constructs, 12/12 correct, byte-identical output — backed statically by 10 remaining `select` sites, all over already-materialized locals and constants. Byte-identity 1967/1978, and **all 11 movers contain a `boolean|null` `??` site**. Two stale comments calling the divergence "deliberate"/"an open ruling" corrected |
| **an `i32[]` element printed `true` where the same expression in a binding printed `1`** | #1459 | shipped, and **it began from a premise of mine that was REFUTED**. I briefed `boolean`→`i32` as a silent soundness hole; it is spec'd feature **A7b** with an `@run` fixture carrying five `@log` oracles over the exact three positions I listed, plus `CHANGELOG.md:107`. **My control was INVERTED, not weak** — I read the bare-literal rejection as proof the coercion was accidental, and the fixture prose says the opposite: the literal form stays rejected *because* `let x: i32 = true` is likelier a typo, which makes it the guard that keeps the feature safe. The agent measured the removal anyway rather than arguing: **1 of 1970** corpus files (the pinning fixture itself) and **0 of 27** `compiler/*.vl`, the arm-removed compiler still its own byte-identical fixpoint — so removal is cheap, just not ours to make, and it was not made. **The real defect was underneath**: `emit_classify.vl:8886` `listElemIsBool` consulted the declared element name only as a POSITIVE claim (`== "boolean"` → true) and then walked to the initializer regardless, so annotation and initializer disagreeing — exactly where A7b fires — let the walk outvote the annotation. `const e: i32[] = [t]` printed `e[0]` as **`true`** while `e[0] + 0` printed `1`: one expression, two formats, `vl check` clean, valid module. A **shortened mirror** — one arm of a two-way decision spelled with only the true half. I reproduced `1 1 true` on master and `1 1 1` after, and re-ran three of the seven controls myself; **one flipped, six held**. Sabotage exact (predicted 1, got exactly 1 of 1901); the inert leg rebuilt byte-identical to pristine. It also caught a **fixture that could not fail**: `boolean-to-i32-reject.vl`'s `@error` still named `of type bool`, a spelling removed in #682, and directive matching is a folded SUBSTRING — so it passed against `of type boolean` and would have kept passing if the message regressed back to `bool` |
| **the declaration-fill done-set was a linear SCAN** | #1458 | shipped: **266 ms → 83 ms** at N=16000 type declarations, and the claim worth making is that the quadratic is *removed*, not reduced — the fixed build lands on the **semantically-gutted probe's own numbers** (19/39/83 vs 20/39/79), delta-ratios **2.06 / 2.14** against a broken 2.6 / 3.2. I re-measured the after-column myself at integration with `VL_PUMP_GC=null` and load 5.8 on 24 cores. Byte-identity **1962/1962**, with **102/1962** cells moving against the gutted probe, so the grader is live. **Its fixture's pin had to be repaired rather than retargeted**: it pinned `no field 'b' on {a: boolean}` and its own comment said that structural spelling "is the whole pin, in two halves" — #1457's nominal rendering landed in between and the message now displays *neither* half. Retargeting the text alone would have left the fixture green while gutting what it tests, so each half was moved somewhere that carries it: absence-of-`b` to the first error **existing at all** (a broken done-set deletes that error rather than rewording it), and `boolean`-not-`Flag` to a new `const bad: string = r.a` whose mismatch prints the resolved type verbatim |
| **every surface a person reads rendered types by their STRUCTURE** | #1457 | shipped. Filed as generic-alias rendering; the measurement found the **display renderer has no nominal arm at all**, across **4 families**. At integration it collided with #1456 exactly as the standing rule predicts — **nine** `@error`/`@error-at`/`@hint` pins across three of #1456's fixtures embedded rendered type text (`{legs: i32, purr: boolean}` → `Cat`, `{legs: i32}` → `Animal`, `{pet: {legs: i32}}` → `Shelter`). Each slice was green alone; only the combination moved the text. One pin changed for a non-obvious reason worth keeping: in `object-shape-identical-alias-flows.vl` **only `asAnimal` went nominal** while `oneBeast`, `beasts` and `seven` stayed structural — that is correct, not partial coverage, because those three are initialized from object/array **literals**, which have no nominal identity to render, whereas `asAnimal`'s initializer is declared `Beast` and carries the name |
| **object-shape provenance** | #1456 | shipped |
| **a narrowed read had TWO representations** | #1455 | shipped: invalid wasm **132 → 0**, a `cast failure` **trap → correct**, 230 of 1436 cells moved **all one direction, 0 newly rejected**. **My framing was half right and the reachable half was wrong**: the narrowing ORIGIN is not the axis, the **CONSTRUCT** is — `if x != null { print(x ?? 0) }` and its `is i32` twin emit the **byte-identical** invalid module with nothing written and nothing to retire, so a fix keyed on the assignment kind would have left two thirds red. Retirement is a real *second* root (the one that **traps**), and a **third mechanism was in the population that I never named**. **The corpus caught an over-reach that got the right answer for the wrong reason**: the first cut moved 13 modules, every one producing correct output but *not because the rule held* — the opposite `is` there would have been a silently wrong branch — and tightening restored **1951/1951** byte identity, which is what proved the over-reach. A green sabotage leg was **proven redundant rather than papered over** (both call sites sit inside gates that already route through the retirement-aware lookup): *"I did not manufacture a fixture for a shape that cannot occur."* |
| **a captured array with REFERENCE elements could not compile at all** | #1454 | shipped: **628 cells → correct, 0 regressions**, and `vl build` now writes a module on exactly the correct cells and no others (250 → 878 of 976). **My filed axis was too NARROW by three whole element families**: I said "nested arrays", but the axis is a **ref-ELEMENT** array — `S[]`, `U[]`, `((i32) => i32)[]` and `{[string]: i32}[]` all fail at depth **ONE**, while scalar lists are never affected. I verified the decisive pair myself: a flat `S[]` captured fails on master where `i32[]` prints `7`. Two more inversions: `global_ann` is **not a capture** (120/120 correct, so it belongs in the controls) and the **ANNOTATED** spelling was the broken one. Mechanism: a **shortened mirror** missing the ref-list companion table, and fixing only the write end leaves 4 cells at check-clean invalid wasm — **both ends are one mechanism, measured by sabotage**. It **proved a shared HOME by shared blast radius** (sabotaging it breaks the param and capture positions together, which is also what explains its one raw prediction miss — 240 cells' own controls went vacuous; restricted to the valid cells the prediction is cell-for-cell exact). It went **one better than the inventory on a grouping question**: where the sweep could only claim a shared OUTCOME for four capture rows, this proves one is the **same shape of defect in a different function**, so its fix is the exact mirror. A **green sabotage leg found a hole in its own generator** (no rebinding read form) and the shape is now in a fixture. Byte-identity **2040/2040 with a structural reason** — the change adds no intern call, only reads rows the intern pass already banked. It also fixed the **self-contradicting floor**, but only after verifying all five remaining positions genuinely lower |
| **a `boolean`-element list printed `0` instead of `false` inside a generic** | #1453 | shipped: silent cells **48 → 0**, invalid wasm 19 → 4, correct 286 → 352, **0 newly rejected**, and the 66 byte-movers are **exactly** the 66 cells whose grade improved. **FOUR OF THE FIVE AXES I FILED WERE WRONG**, each verified by me afterwards: two roots not one, and the silent class in a different function; the **param** branch was fine and the axis is **storage class**; `const y: string = "aa"; gid(y)` is **correct at module scope** and fails only inside a function — *and my stated control (drop the annotation) also passes at module scope, so it discriminated nothing*; **flat `boolean[]` is broken too** while `i32[][]` is correct, so the axis is the **`boolean` leaf at any depth**; and the **value is right** (`x[0][1] == false` → `true`), only `print` is wrong, because `boolean[]` shares the i32 list rep exactly and nothing distinguishes it but a NAME. The root was separated by a **targeted probe-sabotage**: forcing the pin to `boolean[]` changed nothing while forcing it to `string[]` broke the program, proving the arm was reached and its answer irrelevant. It also **collapsed a shortened mirror whose duplication turned out to be load-bearing** — the grid found 8 forwarder cells still wrong when the direct call was already right — reported a sabotage leg that came back **GREEN** and *added the fixture line that reaches it* rather than dropping the leg, and found three defects in its own grader, one of which had mis-binned **81 cells** because `$(...)` strips trailing newlines |
| **the second discovery sweep** — 5,180 cells | #1452 | **THE SILENT CLASS HAS INVERTED.** Nullable cells **2,944 → 0 silent**; plain cells 2,236 → **76**. The exact inverse of inventory #1, where nullable reps held nearly every silent cell — the nullable-rep programme has done its job, and briefs should stop reaching for nullable axes first. It also closed the axis I had flagged as likeliest to hide another eval-count defect: **evaluation counts inside `is`/`match`/place-narrowing are 98 of 100 with 0 wrong counts** over 50 forms. Further measured negatives: multi-module **230/230** across five import kinds, **`-O` and `-O3` both 4,118/4,118** with the optimised module rebuilt and run, capture depth beyond one level **not an axis**, no set literal exists, and struct-field assignment, `flat` records and the brand rules all hold. Nine sabotage legs, nine exact hits, plus one **reported miss** of its own bookkeeping. Its grader initially binned `vl check` dying *inside* `vl-compiler.wasm` as "just a hint" — the exact direction the brief warned about — caught before any conclusion. And it flagged a **contradiction in my brief** (commit the harness vs keep `_scratch/` untracked); it followed the gate and made the doc self-contained, which is what future briefs should ask for |
| **the compiler-trap class** | #1450 | **172 cells → 0.** Three shapes, **TWO roots**, proven by building a **named** compiler and matching one shape's 13-frame backtrace against another's function-index for function-index. Both roots were the recurring **shortened-mirror** class: one read an array type's element row without declining the `-1` hole an empty `[]` leaves — the file guards that field at **18 of 22 sites** and the faulting function was **the only member of its own thirteen-function ladder without it** — and the other returned a map SHAPE slot where a STRUCT TABLE row was expected. It corrected the inventory's axis (the map's **VALUE**, not its key, and broader than "string-valued"), and **reported a sabotage leg that came back GREEN**, explaining the deliberate redundancy rather than hiding it. **Its real `ci-native` failure exposed that my gate list covered three of six suite groups** — see the playbook |
| **the aliased-write predicate was quadratic on TWO axes** | #1449 | **810 ms → 10 ms.** It **corrected my axis attribution**: I filed `findFnDeclIn` and gutting it changes that workload by ~2%. The cost was the write-effect summary BANK. The separating experiment holds every axis fixed but one — 3,000 guards against **one** callee is 60 ms and **unchanged by the fix**; against **3,000 distinct** callees, 380 → 120 ms. `findFnDeclIn` is quadratic on a different axis (per call *inside the body being summarised*). **Both candidates I proposed FAIL OPEN**, 5–9% faster and unsound, so exact `(root, name)` keying shipped. **A measurement can be right about the magnitude and wrong about the mechanism** |
| **combined-master verification after three concurrent slices** | — | #1446, #1447 and #1448 were each verified in isolation, then two of them collided on `wasmEmit.vl` (resolved by merging master in; only `CHANGELOG.md` truly conflicted). **The combination was then verified as its own step**: all eight probes from the three slices correct on merged master, corpus **1869 / 0 / 7**, align **1877 / 0**, lint rc 0. Worth doing as a habit — three slices each green alone is not the same claim as three slices green together |
| **the `is`-narrowed READ, the map-view for-in receiver, and forward alias declaration order** | #1446, #1447, #1448 | three slices, each of which **corrected something it was handed**. #1446: the capture FRAME was correctly typed and the **READ** had no rep — the third consecutive slice briefed as a guard defect that was a read defect — and `emitUnionBoxPush`'s intended floor was **DEAD CODE**, shadowed by an earlier return, which is why its comment promised "a clean reject, not invalid wasm" while the sweep saw silence. 661 cells, invalid wasm **185 → 31**, 0 regressions, and the 86-cell null-comparison class **fixed rather than floored** (48 → 104 of 104). It also re-attributed the compiler trap to the map's **VALUE** type. #1447: the receiver ran twice and the loop walked the **second** map while consulting the **first** one's tombstone filter, so a shrinking factory printed `z` instead of `p,q` — a wrong VALUE, not a wasted call; 186 wrong-count and 72 invalid-wasm cells to zero, corpus 26 modules smaller and 0 larger, and it **contradicted** the i32-key trap claim. #1448: the "value consumers correct, print wrong" split held **only for `boolean`** — every other payload loud-rejected — and it was not five consumers but **eleven** diagnostic families; oracle parity 254/360 → **360/360**, and the 90 identically-rendered diagnostics are **not** a separate root, since both sides really were the same type so acceptance is the fix |
| **aliased-write invalidation** for property-path narrowings | #1444 | shipped, and it **REFUTED the premise I briefed** with one probe: `if o.v != null { o.v = null }` rejects with **no read at all**, because the assignment's TARGET type leaks out of the narrowing overlay — so the direct write was blocked by a type-identity accident, **nothing ever retired a path narrowing**, and invalidation had to be built from scratch rather than extended. `callInvalidatesNarrowedPath` is the one home, three ordered legs (intrinsic never invalidates — the leg that makes the rule usable; opaque invalidates everything and fails closed; a known body consults a per-`(parameter, field-sub-path)` write summary). **The BROAD rule was built and refused on measurement** — both rules fix the identical 242 unsound cells and the whole difference is collateral: broad loses **94 of 106 correct grid cells** and **2 of 1908 corpus files**, both correct code, both blaming `print` for a write it cannot perform. **THE FASTEST FALSIFICATION WAS SILENT**: 110k lines of `compiler/*.vl` build clean under *both* rules and the corpus was clean for the shipped one, so the discriminating population had to be CONSTRUCTED — never read a clean self-compile as evidence a rule is right-sized. 348 cells: all **242 REJECT-intent → loud check reject, 0 of 106 correct-intent cells move**; corpus verdicts 0 of 1908 changed, **0 bytes moved** over 1576 modules. **Keeping TRAP and WRONG-VALUE apart is what exposed the rep axis**: the two BOXED reps print a wrong value (6 each) where five scalar/ref reps trap (7 each) and two composite reps loud-reject at emit. Sabotage partitions exactly 110 + 18 + 76 = 204, the free-variable leg reddening capture **and nothing else**. Left measured and unfixed: the `const p = o` alias hole (needs may-alias), a pre-existing FALSE reject from the same overlay leak, and a global `let g: string\|null` written inside any function emitting **invalid wasm with no guard anywhere**. **Does NOT unblock #1440's `while`-body gate** — invalidation is a statement-order rule that deliberately accepts read-then-call, right for `if` and unsound for a re-executing body; the missing half is a back-edge pre-pass, for which this predicate is already the right shape |
| **`==` over a nullable niche** had no null guard | #1442 | shipped. The filed diagnosis held and was **narrower in three ways**, one of them my own error: I dismissed the `string \| null` half after probing it and getting the right answer, because **my probe used two NON-NULL strings** — with a null present it **traps**. 200 cells: correct 83 → **150**, check-clean invalid wasm **94 → 0**, **TRAPS 21 → 0**, 0 regressions, and the newly-accepted table is **empty**. Root: a classifier that **sees through a niche and expects the read site to recover** (`exprArray` deliberately claims `i32[] \| null`), so every consumer must insert the recover or emit invalid wasm. `null == null` semantics were **read off four existing reps** rather than invented, and list `==` was verified **DEEP** before writing a guard that could have degraded it to `ref.eq`. Five sabotage legs predicted (52/32/20/8/3) and all five measured **exactly**, 0 cells into any other class. Byte A/B caught an intermediate commit where **48 corpus modules changed bytes for a compare none of them performs** — invisible to pass/fail |
| **the `is`-narrowed READ of a nullable numeric litunion** | #1443 | shipped, and it **overturned the diagnosis I briefed**. The `is` TEST was never broken — it emits the correct membership ladder; the **narrowed READ had no rep**, because an `is`-narrow banks the tested SPELLING while `!= null` banks the base scalar's own NAME (which is exactly why my `!= null` control passed). **It also refuted #1439's own declined measurement**: #1439 said this rep "keeps its loud floor" and priced a fix at "8 cells LOUD → invalid wasm", but that was a patch at **one** consumer; moving the shared predicate `nodeTyIsUnionAlias` moves all three and measures **strictly better** — +72 main-grid cells and the return grid **120/480 → 480/480**. So **a declined measurement is only as wide as the patch that was measured.** 2776 cells: **+1000 forward, 0 to a worse column, 0 into either silent class**; 365 newly-accepted programs, every one correct on its runtime input. Seven sabotage configs; **S2 moved 8 cells FORWARD**, proving a build-verdict grader would have mis-scored it. 1575 of 1575 corpus modules byte-identical. **Closes N2**, and rewrites the now-wrong residue comment in #1439's fixture |
| **print double-evaluation** — `print(<litunion atom>)` ran its argument once per MEMBER | #1441 | shipped. The filed "re-read the receiver" diagnosis **held exactly**, and the member-count axis proves it rather than suggesting it: **2 members → 2 evaluations, 3 → 3, 4 → 4, and the `K\|null` niche → members+1**. The value was always right, which is why it hid — a sibling fixture of the same shape passed the whole time because its callee has no side effect. Two homes for the atom→string widen collapsed to one (`emitStashAtomId`); the hand-copied per-member chain is deleted. 1800-cell grid: silently-wrong **20 → 0**, and **20 of 1800 moved, all WRONG → CORRECT, nothing else in any direction**; a second 70-cell grid using a global counter instead of a print marker agrees exactly (17 → 0). **Two alternatives built and rejected on numbers**: the loud-reject floor breaks **42 of 1904 corpus files that build today** (option 1's RC-DIFF is 0), and a byte-preserving conditional stash is behaviourally identical but keeps two homes, adds an unwritten slot invariant, and retains 26.8 KB of redundant emitted code. Corpus **−33,140 bytes over 119 files, every one smaller, none larger** |
| **while-body narrowing** — a `while` BODY is a narrowing scope, like an `if` arm | #1440 | shipped. The filed diagnosis ("a check error, not an emit one") was **half right — BOTH layers were missing it**, and that was proven rather than assumed: the loop-body **post-guard** shape (`while true { if e == null { break } … e+1 }`) is check-clean **invalid wasm** on master with no checker change at all, because emit's `blockAlwaysReturns` counts only `RetStmt` while the checker counts `RetStmt`/`BreakStmt`/`ContinueStmt`. 202 + 18 cells: correct **59 → 133**, check reject **75 → 5**, **invalid wasm 4 → 0**, silently wrong **0 → 0**, 3 down-moves all loud→loud matching the `if` twin. **The mutation axis resolved better than expected**: the `if` oracle does not invalidate the fact at a write, it makes the falsifying write ILLEGAL and scope-wide, so for a bare name there is nothing to invalidate. Two gates measured, and **the grid missed the `is` axis while the corpus caught it** — where the `if` arm is NOT a valid oracle, because it rejects the variant flip a loop terminates on. A lockstep guard was instrumented with `emitFail` (3 constructed hits, **0 of 1902 corpus files**, 0 in self-compile) and **deleted rather than shipped as dead code** |
| **null-rep** — three shapes, one message, **THREE roots** | #1439 | shipped. `emitNullLitNode` was **not** the defective table — my briefed framing was refuted: its arm set is complete, its fallthrough is loud, and a box's `null` is a `struct.new`, not a `ref.null`. The three roots are `forInElemKind`'s `.values()` sub-ladder (missing the three arms its LIST sibling already had), `forInLoopVarUnionName` answering from a first-match-**by-name** AST scan (now pinned per slot, retiring a 60-line scan), and a nullable numeric litunion being **one type with two reps**. 988 cells over 3 grids: **+52 forward, 0 backward, 0 into either silent class**; check-clean invalid wasm **10 → 0** and **8 → 0**. Two down-moves recorded rather than shipped, one of them a counterfactual built and reverted because the call-result classifier is a **third** name-keyed home. I verified all four claims independently, and found that my own first same-named-loop probe used the **wrong spelling** (two union iterables — that one already passed; the defect needs the first loop over a NON-union iterable) |
| **B1** checker-side parse census | #1354 | **CLOSED, measured negative** — 17,832 of 17,834 are tree walks |
| **B1a** `is` triple resolution | — | **SHIPPED** — the mint-free half is exactly the bare-NAME half, so it is separable; 12,931 of 12,931 taken on the compiler's own source, arena unmoved on 1,777 files |
| **B2** TRANSP residue | #1373 | shipped; found a THIRD down-cell the filing lacked |
| **B3** mint column | #1372 | **BLOCKED-REP behind B5** — 206 of 220 mint; B5's blocker is now RE-ATTRIBUTED (canon pass, not mono) and awaits an owner ruling |
| **B4** `recordMvValTyIx` | #1366 | shipped; 725 calls, 0 parses, 0 mints |
| **B9a/B9b** routings + endpoint | #1375 | shipped; the endpoint row was **mis-identified**, divergence deliberate |
| **B9** W13 floor | #1372 | re-derived: **12, not ~60** |
| **C1** union box melt | #1363 | shipped; 1.36x default / 1.68x `-O` |
| **C2** backing-pointer LICM | — | **CLOSED, measured negative** — anchor stale; emitter reaches 1 of 7 reads (2.9%); binaryen's `licm` is top-level-only; the axis is the inlining budget, not the view count |
| **C6** `match` binding in value position | #1367 | shipped; unblocked `if` too |
| **C9** webcraft doc staleness | #1351 | shipped |
| **C10** names section | #1351 | **resolved** — consumer passes `--names`; default flip costs the seed +5.3% |
| **D1** litunion alias `is` | #1353 | shipped |
| **D2** numeric literal unions | #1365 | shipped; a fourth rep with its own lowering |
| **D1c** RAW `string \| null` receiver `is` a literal | — | shipped; **the owner ruled a null receiver answers FALSE.** 104 cells, correct **31 → 83, 0 regress**: traps **11 → 0**, `vl check`-clean invalid wasm **3 → 0**, membership rejects **47 → 9**; one guard in the compare both spellings share; 1838 corpus modules **byte-identical** |
| **D5** storage-vs-identity exemption | #1362 | shipped; 6 UP, 0 DOWN |
| **E1** generic fn as a value | #1364 | shipped; closed a live invalid-wasm emit |
| **E2** inferred map VALUE type | #1359 | shipped; the axis was the value, not the key |
| **E2r** inferred map through a call / a literal field | — | shipped; **139 of 220 oracle cells fixed, 176/176 byte-identical to the annotated twin, invalid-wasm 36 → 0** |
| **E2s** inferred map in a LIST element / through a PARAMETER write | — | shipped; grid re-derived at **330 oracle cells** (15 positions), **215/220 on E2r's own subset**, **259/259 byte-identical to the annotated twin**, invalid-wasm 0 · silently-wrong 0 · traps 0. The i32-keyed `Set()` residue was **already closed by E2r itself** — re-verified as a measured negative, 30/30 `Set` cells correct on both key reps |
| **E2k** map-key annotation removes a capability | — | shipped; **the filed shape is REFUTED and the defect is bigger than filed.** E2's 192 was measured against the BASE-KEY twin (a different program). On the same program, ann/inf agreed in **208 of 208** pairs on master — a newtype key was refused in BOTH spellings, so this was never "an annotation downgrades", it was "VL cannot use a newtype as a map key at all". Cause: `mapKeyTySupported` was `k == TY_STR \|\| k == TY_I32`, an ARENA-INDEX compare, and a brand is a second index over the same `Ty`. Grid **976 cells** (16 key spellings × 7 positions × 7 ops × ann/inf): **226 newly accepted, 0 regress, 0 silently-wrong, 0 invalid wasm (452/452 valid under `wasm-opt -O3`)**; ann/inf byte-identical **100/100**, derived-vs-base-key byte-identical **325/339** (the 14 are an `as`-in-a-global-initializer const-fold, reproduced with no map in the program). Per-key parity now EXACT: `newI32` = `i32` = 54 OK/7 pre-existing emit gap, `newStr` = `string` = 59 OK/2. Reject parity **0 of 299**. Litunion keys deliberately still refused (a named string litunion reps as an i32 atom while its key spelling stays `K` — admitting it is a silent wrong hash). A type VARIABLE in the key slot is refused for `i32` too — key-blind, pre-existing, untouched. `maps/newtype-key-annotation.vl`, `maps/error-newtype-over-unsupported-key.vl` |
| **E3** `unconditional-recursion` lint | #1368 | shipped; half (a) left as a language ruling |
| **F5** `modScan` re-scan | #1371 | shipped; **-4% CPU** on the self-compile |
| **G2** closure-unpack hoist | #1374 | **REFUTED** — the filed 10.6x is P2's saving counted twice |
| **H2** perf gate phase 1 | #1370 | shipped; SHAPE_TABLE, 22 → 35 tests |
| **H4/H5** doc truth-up | #1358 | shipped |

Also landed: #1344 (brand-only union arms — owner-confirmed narrowing), #1345
(`vl test` scheduling witness), #1348 (comment policy), #1349 (dependabot),
#1350 (this board), #1355 (four dead agent-environment claims), #1356
(`modTypeRenamed` — behaviour difference REFUTED), #1360 (fourth dead playbook
gate), #1369 (A5b/A5c/A5d literal-inference rows).

**Cycle scorecard: 9 filed claims refuted or corrected by measurement**, five of
them numbers or units, four of them framings. Two were the orchestrator's own.
C2 contributed a framing (the descriptor reload was filed as "two views of one
width, GUFA cannot fold" and is really "the inlining budget did not melt the
descriptor") and a stale anchor.

---

## THE BRANCH, GATED AS A WHOLE AGAINST MASTER (2026-08-19)

43 commits. The full battery run once from a clean tree, as the PR gate:

| gate | result |
|---|---|
| working tree | clean |
| native fixpoint | byte-exact, 1,251,334 |
| self-lint + fmt | clean |
| `deno task test` | **2,159 / 0** |
| `cases_wasm` (shared instance) | **1,939 / 0** |
| LSP bundle | rebuilt |
| structural-identity harness | **0 merges / 0 splits / 0 length mismatches** |
| **corpus A/B vs MASTER, 2,010 files** | **2 rows moved** |

**REVISED — THE REP FUZZER CAUGHT ONE OF THEM, AND IT WAS MINE.** The gate above was run before
`scripts/rep-fuzz-check.sh`, which is the harness this project built for exactly this class. It
failed:

```
✗ NEW / WORSE   + MISMATCH  p2r ((i32) => {f: boolean}[] | {w: i32}) | f64
✗ STALE         - REJECT    p2r ((i32) => {f: boolean}[] | {w: i32}) | f64
```

**REJECT → MISMATCH is the "silently worsen" transition the harness exists to refuse**, and MISMATCH
is never baselineable. The shape compiles on my branch and gives the WRONG ANSWER: in
`if t1 is {f: boolean}[]` the narrowing takes the else branch and prints `OTHER` where `false` is
correct.

The cause is the interner's element-dedup enabling — unifying the refinement's two vocabularies
through `shapeFieldElemName` so five dead codes could match. It makes previously-un-repped
compositions resolve, and for this shape the resolution is unsound.

**NOTHING ELSE SAW IT.** 2,010 corpus files byte-identical, 2,159 suite cases green, 1,939 wasm cases
green, native fixpoint byte-exact, the structural-identity harness 0/0/0. The rep fuzzer alone.

**Reverted** — the element comparison stays on the raw field text, the merge-alias with it. The
`@emit-error` fixture it had retired goes back to `@emit-error`, and the fuzz shape is pinned as
`closures/error-narrow-reflist-arm-of-closure-result-union.vl` so the next attempt at that merge
fails in the corpus first.

**What the constant-false actually is, then.** Not an oversight to be tidied away: it is the thing
standing between a name-keyed row table and an unsound merge. The measurement that found it (5 codes,
1,365 comparisons, 0 matches) stands; the conclusion that it was safe to fix does not.

**FINAL STATE OF THE BRANCH AGAINST MASTER, both channels, every row accounted for:**

| channel | rows moved | what they are |
|---|---|---|
| emitted-wasm sha256 + exit code | **1 of 2,010** | `statements/bare-return-void-early-exit.vl` — master has no lowering for a bare `return` in a void function; the void ruling's terminator half |
| diagnostic text | **5 of 2,010** | three are FIXTURES THIS BRANCH ADDS (the two container-element storage-class pins and the bare-return one); the other two are **reject-tier MOVES** |

The two moved rejects are the C8 container-element rule doing its job. Master refuses them late and
vaguely — `emitProgram: value-union closure RESULT is not yet representable` — while the branch
refuses them at CHECK time with a source-located message naming the actual cause:

> *a value of type `string[]` flowing into `(f32 | string)[]` … changes how the ELEMENT is stored:
> type-valid (the element type widens) but not yet supported by codegen … Build the container at
> `(f32 | string)[]`, or declare the source as `(f32 | string)[]`*

Same verdict, earlier and legible. **Every other row of 2,010 is byte-identical to master on both
channels**, across a branch that rewrote the rep key layer end to end, added a hash-consed structural
identity, enumerated a struct row's identity, re-ordered the shape-descent grammar three times, and
moved the arena hand-over from 37.3% to 98.7%.

Gates: suite **2,160/0**, `cases_wasm` **1,940/0**, native fixpoint byte-exact at 1,251,256,
self-lint + fmt clean, structural-identity harness **0/0/0**, `rep-fuzz-check` **exact ✅**.

## THE CALLER HAND-OVER DOES NOT GENERALISE — measured on the next two sites (2026-08-19)

`structIndexOfLet` took the arena rung at 15 disagreements in 8,201 corpus cells (0.18%), 0 on the
self-compile, and a clean rep-fuzz run. The obvious next move is the other node-holding callers from
the census — `emit_classify:11391` (`structIndexOfType`'s TypeRef arm, 9,474 self-compile calls) and
`:18066` (a Param's declared type, 13,724). Both hold a node. Both were dual-run before conversion:

| site | corpus: arena answers | agree | **disagree** | rate |
|---|---|---|---|---|
| `structIndexOfLet` (SHIPPED) | 8,201 | 8,186 | **15** | **0.18%** |
| `:18066` Param type | 15,922 | 15,881 | **41** | 0.26% |
| `:11391` TypeRef arm | 528 | 469 | **59** | **11.2%** |

**`:11391` IS NOT SHIPPED.** It disagrees on more than one call in nine — two orders of magnitude
worse than the site that worked — and it sits directly below an arena rung that already ran and
declined (`repSlotOfTy(nodeRepTyIxOf(tyIx))`, the REP sidecar, where mine would read the DECLARED
one). Two different sidecars answering two different questions is not a rung, it is a coin flip with
a byte channel that cannot see it.

**`:18066` IS SHIPPED, because its 41 disagreements were one NAMED class.** I nearly filed it with
`:11391` on the rate alone; dumping the witnesses instead shows all 41 are
`nm={f:K0|null} arena=7({f:K0|null}) name=1` — a DUPLICATE row carrying the same spelling — and
`repStructSlotsTwin(7, 1)` answers **1** on every one. Twins share a heap type and a field-code
layout, so either row emits the same module, and the project's own predicate says so rather than my
reading of it. On the compiler's own source the arena answers 294 times with **0** disagreements.

Gated on **`rep-fuzz-check` exact ✅** as well as corpus A/B 0 of 2,010, suite 2,160/0, `cases_wasm`
1,940/0, fixpoint byte-exact at 1,251,256.

**Which sharpens the lesson rather than softening it: a disagreement RATE is not the decision, the
CLASS is.** 0.26% and 11.2% would have sorted the same way as 0.18%, and both times the answer came
from asking what the disagreeing cells WERE — twins at one site, two different sidecars at the
other. Ranking by the rate would have shipped neither or both.

**A FOURTH CALLER, AND THIS ONE IS EXACT.** `emit_classify:7383` resolves a union ARM's struct row
by spelling. The arms there are CUT from a union set name, so no node holds one — but
`unionMemberTysOf` appends the row's member types in exactly `splitUnionAtoms` order, the same
pairing `internShapeArms` uses, so the arm can be asked for by TYPE through the D-UNION seam.
Dual-run: the arena answers **63 of 76** corpus reaches with **63 agree / 0 disagree** and no
arena-only answers. **That is the 0-disagreement standard the rest of the programme ships on** — no
twin tolerance needed, because the seam pairs arm to member rather than resolving a spelling twice.
Gated on `rep-fuzz-check` **exact ✅**, corpus A/B 0 of 2,010, suite 2,160/0, `cases_wasm` 1,940/0,
fixpoint byte-exact at 1,251,362.

**So the caller hand-over is three sites in and the pattern is legible**: a caller converts when its
question IS "what type does this denote" — an annotation's node (`structIndexOfLet`, the Param type)
or a union member the arena already pairs (`:7383`). It does not convert when the question is
something narrower that the declared type cannot answer (`:11391`'s rep sidecar). That is a rule you
can apply to the next site without re-deriving it.

**FOURTH SITE, and the rule picked it out without a new derivation.** `letIsStruct` asks "does this
annotation denote a struct" — the rule's shape exactly — and `typecheck.nodeTyIsStruct` is the
checker-side twin already written for it, whose own header says it *"under-approximates … so callers
keep the name test as the fallback"*. This is a caller taking it up on that.

Dual-run over the corpus: the two agree on **1,871 of 6,437** reaches, the arena answers true where
`isSName` does not on **24**, and `isSName` answers true where the arena does not on **0** — a strict
superset. The 24 are spellings `isSName` structurally cannot claim: a generic APPLICATION
(`Box<Box<i32>|i32>`), a canonicalized INTERSECTION (`Node&{v:i32}`), an inline SHAPE
(`{a:{k:i32},b:{k:i32}}`, `{f:(boolean|null)[]|null}`), a field holding an application
(`{v:Pair<i32,string>}`). Every one is a struct, so the arena is right and the NAME under-reports.

Corpus A/B **0 of 2,010** — the fall-through (`exprStruct` on the initializer) was already answering
those 24 — so this is the same answer reached from the type instead of from a spelling plus an
initializer walk. `rep-fuzz-check` **exact ✅**, suite 2,160/0, `cases_wasm` 1,940/0, fixpoint
byte-exact at 1,251,384.

**So the conversion that worked was SPECIAL, and saying so is the result.** `structIndexOfLet` asks
"what struct does this binding's annotation name", where the annotation IS the node whose type the
checker recorded — the two derivations are the same question by construction, and the 15 residual
cells are structural twins. The other callers ask narrower questions (a rep slot, a param's variant
eligibility) that the declared type does not answer. **One caller converting cleanly is not evidence
that callers convert cleanly**, and after the rep-fuzzer caught the interner merge on this same
branch, a 11.2% disagreement rate is nowhere near shippable on byte-identity alone.

## THE CALLER CENSUS IS CLOSED — every site judged by the rule, with its number (2026-08-19)

The rule the conversions produced — *a caller converts when its question IS "what type does this
denote"* — has now been applied to every site the `structIndexByName` / `isSName` census turned up.
Six sites, four converted, one refused, one measured away:

| site | traffic | verdict | evidence |
|---|---|---|---|
| `structIndexOfLet` | 168,665 (65%) | **converted** | 15 of 8,201 disagree, all structural twins (`repStructSlotsTwin` = 1) |
| Param declared type `:18066` | 13,724 (5%) | **converted** | 41 of 15,922 disagree, all ONE class, all twins |
| union ARM `:7383` | 14,795 (6%) | **converted** | 63 of 76 answered, **0 disagree** — the seam pairs arm to member |
| `letIsStruct` | — | **converted** | strict superset: 24 arena-only, **0 name-only** |
| `:11391` rep sidecar | 9,474 (4%) | **REFUSED** | 59 of 528 disagree (11.2%); it sits below an arena rung that already declined, reading a DIFFERENT sidecar |
| param reject ladder `emit_sections:574` | — | **NO CONVERSION NEEDED** | **0** — see below |

**The last row is the one worth having.** `emit_sections:574` is a REJECT ladder, and converting a
reject ladder to accept more is the riskiest change shape in this codebase — it is exactly where the
rep fuzzer caught me earlier this session. So it was measured before being touched: **of every param
the ladder REJECTS, zero have an arena type `nodeTyIsStruct` claims.** The name ladder is already
complete for that site. No rung, no risk, and the reason is a number rather than caution.

(The first attempt at that measurement counted 292 and was WRONG — the counter sat before the
`!isSName` test, so it tallied every arena-true param including the ones the name already accepts,
with `#anon0`…`#anon5` as its witnesses. Moved to the reject point it reads 0. A probe in the wrong
place answers a question you did not ask.)

**So the caller half of the hand-over is DONE as far as the census reaches**: four sites moved to the
arena, one refused with its number, one shown unnecessary with its number. What remains name-keyed —
`sNames` as the row's stored spelling — is not a caller problem; it is the row layer, and its
identity is already structural.

## WHY `sNames` PERSISTS — it is not a lookup key, it is the DECLARED-ROW filter (2026-08-19)

The one thing left name-shaped after the caller census is `sNames[si]`, the row's stored spelling.
Its last structural reader is `repSlotCacheSync`, which opens `cUserTypes[sNames[si]] ?? -1` — a
name→type resolution at the row layer, and the obvious next thing to remove.

**The sidecar strictly dominates it.** Measured over the corpus before touching anything: of 2,185
rows, `sTyIx[si]` and `cUserTypes[sNames[si]]` agree on **602**, **0 differ**, **0** resolve by NAME
where the sidecar is empty, and the sidecar covers **1,446 more** rows the name cannot resolve at all
(inline shapes, `#anon` literal rows). On those numbers the swap looks free.

**It is not. It breaks 8 of 2,010 files, one of them into a hard failure.** And the reason is the
whole point: those 1,446 extra rows are exactly the ones `cUserTypes[sNames[si]]` was EXCLUDING.
The line reads as "resolve this row's name to its type"; what it actually computes is **"is this row
a DECLARED type"** — and the slot cache it feeds (`repSlotByDecl`, the twin tables) is built on that
distinction. Widen it to every typed row and inline shapes start merging with declared structs
through the twin layer.

**So `sNames` is not a lookup key that survived by inertia.** It is the row's declared-ness marker,
and there is no structural test standing in for it: "declared" is a fact about where the row's
spelling CAME FROM, not about its type.

**I then said the fix was "an explicit declared-ness column, cheap to make". I built it, and it is
not.** Two attempts, both measured against `cUserTypes[sNames[si]] >= 0` over 2,185 corpus rows:

| attempt | agree | name-only | column-only |
|---|---|---|---|
| label each of the 5 mint sites by WHAT IT INTERNS | 597 | **5** | **3** |
| bank the NAME's own `cUserTypes` answer AT THE MINT | 597 | **5** | **3** |

**Identical disagreement, which is the whole finding.** If labelling by provenance and banking the
name's own answer are wrong in exactly the same 8 cells, the answer is not a property of the mint at
all — **it CHANGES after the row is minted.** And it does: `cUserTypes` is add-only during emit
(`resolveAnnot` memoizes new spellings mid-pass), which is precisely why `repSlotCacheSync` carries
`cUserTypesVer` in its generation stamp. `AB` and `PairA` become declared after their rows exist;
`{d:i32}` and `{g:f64}` were in the table when their rows were minted and are not what the query
means later.

**So the name resolution there is not a re-derivation to be cached — it is a RE-READ, and it is
re-read because the answer moves.** That is the end of this line, and it is an explanation rather
than a shrug: `sNames` persists because the row layer has to ask a question whose answer depends on
state that grows after the row does.

Reverted (both attempts); 0 of 2,010 back to the shipped tip, fixpoint byte-exact at 1,251,384.

Reverted; 0 of 2,010 back to the shipped tip, fixpoint byte-exact at 1,251,384.

**That closes the destringify question I could answer by measurement.** The type spelling is gone
from the arena, the checker, the rep keys and four of the five hot callers; where it remains, it
remains because it carries a fact the type does not — provenance, not structure.

## Band 1 — destringify types

**State of the programme.** The EMIT side is at its floor: **1,846 `annotResolve`
parses**, and the whole name-shortcut route is **EXHAUSTED as of #1334**. All three
surviving emitter rows are mint-bound — row 4 is 425 of 426 minting, row 2 is 402
of 402, and row 1's arena-neutral remainder is 111 of 126 the `FView`-refuted rung.
There is no fourth rung to add.

**AND THE CHECKER SIDE IS NOT A SECOND FRONTIER — the two numbers the programme
ranked against each other were DIFFERENT UNITS (D-CHECKPARSE).** The checker's
population is `tsToTy` walks over the parser's spelling TREE, not string parsing:
**17,832 of 17,834 are tree walks**, the string parser `nameToTy` is entered **54
times corpus-wide (23 outermost)**, and **0 times over the compiler's own 39k
lines**. The emitter's 1,846 are string parses by construction (`root = -1` at
every site). So "2,963 checker parses beats 1,846 emitter parses" compared tree
walks to string parses.

**On the programme's own question — stop representing types as strings — the
checker is already done: it reads 23 type STRINGS across 1,737 files.**

Two instrument findings worth carrying. The published row re-derives at 3,093 (vs
2,963, +4.4%, `neg` identical at 15) — but it is **17.3% of the real population**:
only 4 checker sites use the memoized `resolveAnnotTs`, while **11 more call
`annotResolve` directly, carry no memo, and parse on 100% of their 14,741
reaches**. Every instrument in the programme sat at the memo, so 82.7% of the work
was never in a column. Controls: 0 unattributed records of 31,911, four
independently-built probe binaries agreeing, `T.tys` grew across 0 of 13,736 hits.

The counter-datum this reinforces: lowering the compiler's own 39k lines, **the
entire emitter parses 24 type spellings and the checker 0**. The open populations
are corpus-wide aggregates over small files.

**A THIRD instrument finding, from B4: a scorecard row is a (population,
CHOKEPOINT) pair, and shipping a rung moves the chokepoint without moving the
work.** `recordMvValTyIx` was filed at 685 `resolveAnnot` reaches and re-derives
at 411 — a 40% fall while the row itself GREW, to 725 calls. Its base predates
both rungs under `fieldElemTyIxOfName` (#1331 rung 1, #1332 rung 2), and the
arithmetic closes exactly: `725 − 40 rung-1 − 274 rung-2 = 411`. Any row censused
before those two PRs now under-reads by whatever share of it is a declared name
or a bare primitive. **Re-derive in CALLS as well as reaches** — a rung-1 answer
is still `cUserTypes[nm]`, which is the terminal condition verbatim.

**A FOURTH, from B3: THE TWO RUNGS ATE THE ARENA-NEUTRAL PARSES, so the mint gate
#1331 refuted as a general rule is now true of nine parses in ten.** Mint-free
emitter parses were **1,342 of 3,031 (44.3%)** at #1331 and are **166 of 1,915
(8.7%)** at `6ef19f67`. The fall is the rungs' own documented take (219 + 12 +
803 + 151 = 1,185 parses; `1,342 − 1,185 = 157` against 166 on a 22%-larger
corpus). A rung that skips the first resolution of a declared name or a bare
primitive is arena-neutral BY CONSTRUCTION — somebody else minted that index — so
the shortcut programme has been harvesting exactly the safe parses, and what is
left is by selection the parses that mint. **Any new row claiming arena-neutrality
must name the mechanism; the base rate is 8.7% and falling.**

**A FIFTH, from B1a: WHEN A ROW'S BLOCKED HALF IS DEFINED BY A RUNTIME PROPERTY,
CHECK WHETHER A STATIC ONE PREDICTS IT EXACTLY — that is the difference between a
row filed PARTLY TAKEABLE and a row shipped.** B1a's takeable half was defined as
"the reads that mint nothing", which is only knowable after the call. It is the
same set as "the spelling tree's ROOT KIND is `TS_NAME`" — 2,878 parses, 2,878
mint-free, 0 minting, and 12,931 of 12,931 on the compiler's own source — one
field of a node the caller already holds. **And a call whose measured `ΔT.tys` is
0 needs no mint-ORDER argument at all**: it is not in the mint stream, so removing
it cannot reorder what is. B3's hazard is real only for a population that mints,
and its own is 206 of 220. The cheapest way to price the half you are refusing is
to BUILD it: B1a's take-all control moves `T.tys.length` on **229 of 1,735 files
while moving 0 wasm bytes**, which is both the gate confirmed and the proof the
arena channel was awake.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| ~~**B1**~~ | ~~Checker-side parse census~~ | `destringify-types-program.md` D-CHECKPARSE | **CLOSED — measured negative.** 3,093 of 17,834; **17,832 of 17,834 are TREE walks**; `nameToTy` entered **54 times corpus-wide**, **0** over the compiler's own source | **CLOSED** | — | — |
| ~~**B1a**~~ | ~~`is` triple resolution~~ | `destringify-types-program.md` D-ISBANK | **SHIPPED, and the takeable half was SEPARABLE.** Re-derived: family **7,187 = 37.9%** of checker parsing (**19,398 = 88.0%** on the compiler's own source); the three READERS are **4,851 CALLS = reaches = parses** (25.6% / 58.7%), bank covers **4,849**, **2,912 of 2,912 mint-free reads index-identical, 0 disagreements**, **1,937 of 1,937 minting reads disagree, 0 agreements**. The split is SYNTACTIC — `tsKind[root] == TS_NAME` is **2,878 parses, 2,878 mint-free, 0 minting** (12,931 of 12,931 on the compiler) — so the mint-free half is gated BEFORE the call. Corpus A/B **0 of 1,777 rows on wasm bytes, `T.tys.length` and diagnostics**; the TAKE-ALL control moves `T.tys.length` on **229 of 1,735** while moving **0** bytes. Reaches 18,972 → 16,096 corpus, **22,031 → 9,100** on the compiler. **+99 B** | **CLOSED** | — | — |
| ~~**B2**~~ | ~~**TRANSP residue** — add `genAppNameOfTy` under `structNameOfTy`~~ | — | **STALE ROW: THE RUNG SHIPPED IN #1373.** `transparentMemberEmitName` and `tyToNominalNameGo` both carry the `genAppNameOfTy` leg on the current tip, and the named blocker is gone with it — a 256-cell generic-alias grid is 256/256 CORRECT on master, its 32 struct-field cells included, so `fieldTypeCode`'s missing application route and the "ONE cell" it cost are already paid. Census re-derived at 13,529 annotations: B2 = 24 (0.18%), B3 = 134 (0.99%) — the plain `Y` → `Box<i32>` rows are gone from both. What the owner still saw is a DIFFERENT renderer: `tyToStr`, the DISPLAY producer, which had no nominal arm at all. See the row below | CLOSED | — | — |
| **B2d** | **the DISPLAY renderer's nominal legs** — `tyToStr` was a shortened mirror of `tyToNominalNameGo` carrying only the newtype arm, so every hover, inlay hint, completion detail and `tErr` message spelled a declared type as its structural expansion | `typecheck.vl` `tyToStr` / `tyToStructStr` | SHIPPED: 1,609/1,609 corpus modules byte-identical, 0 of 1,962 verdicts moved, 113 files' diagnostic TEXT moved; the two renderers' agreement 54.65% → 70.06% exact (71.72% → 92.84% normalized) over 13,039 rows | SHIPPED | — | — |
| **B2e** | **the display renderer emits three spellings VL cannot parse** — the arrow `->` (VL spells `=>`), the nullable suffix `T?` (VL spells `T \| null`) and NO grouping at all (`(A\|B)[]` renders `A \| B[]`). Measured by substituting each `redundant type annotation` render back as its own binding's annotation: **1,298 of 1,877 round-trip** corpus-wide, and 494 of the 579 failures are one of the three: 280 arrow · 113 nullable · 101 grouping | `typecheck.vl` `tyToStrGo`'s `TyFunc`/`TyNullable`/`TyArray`/`TyUnion` arms; `arrElemRender` is the grouping home the two EMIT renderers already share and this one does not | each leg is independently measurable and each moves its own set of corpus `@hint` pins | **BRIEFED 2026-08-17.** Re-verified on the tip after #1457: all three legs still reproduce (`(i32) -> i32`, `i32?`, `A \| B[]`), but **the counts above are STALE** — they were taken hours before #1457 landed nominal rendering, which round-trips trivially, so the agent re-derives the rate as step one. **I under-filed the grouping leg.** It is not a parse *failure*: `A \| B[]` parses successfully to a DIFFERENT type (`A \| (B[])`), so substituting the render back yields `cannot assign A \| B[] to 'u' of type A \| B[]` — **the compiler reporting that a type cannot be assigned to itself**, both sides rendering identically while being genuinely different types. A fourth shape falls out of the same hole: `(i32 \| null)[]` renders `i32?[]`, ambiguous for both reasons at once. Probe note: the nullable and grouping legs only fire the hint when the binding is initialized **from a call** — two of my first probes came back empty for exactly that reason | M | med |
| ~~**B3**~~ | ~~1a-v `pushFieldRow` — per-field-CODE peel table~~ | `destringify-types-program.md` D-FIELDROWMINT | **MEASURED NEGATIVE.** Re-derived at **3,583 CALLS** (2,510 empty-name guard · 185 rung 1 · 215 rung 2 · **673** `resolveAnnot` reaches) / **220 parses** (11.5% of the emitter's 1,915) / **206 of the 220 MINT (93.6%)**, and on the subset `pushFieldRow` can actually reach, **83 of 84 (98.8%)**. The 14 mint-free are 6 generic re-applications + 8 `#anon` failures, 13 of them outside `pushFieldRow` | **BLOCKED-REP** — behind **B5** | — | — |
| ~~**B4**~~ | ~~`recordMvValTyIx` routing~~ | `destringify-types-program.md` B4 | **SHIPPED.** Re-derived at **725 CALLS** (40 rung-1 · 274 rung-2 · **411** `resolveAnnot` reaches) / **0 parses** / **0 arena mints**; dual-write **725 of 725 index-identical**, corpus A/B 1,743 files × 7 channels **0 rows moved**, **+25 B**. The filed 685 reconciles as `725 − 40 − 274`: the row grew, the CHOKEPOINT moved | **CLOSED** | — | — |
| ~~**B5**~~ **Mono-clone `nodeTyIx`** | **THE FILED MECHANISM IS REFUTED — it is the CANON PASS, and the item is renamed `canonTyIx`** | `typecheck.vl` `canonEmitTypeNames` (`n.tyName = c`); reader `emit_collect.vl:3593`; `destringify-types-program.md` D-REPELEMTY §3a | **RE-DERIVED off `494adc0d`: 61 disagree of 1,400 covered / 1,407 reaches / 7 uncovered.** All 61 are PARSER nodes in **five files**; **57 sit on a node whose `tyName` `canonEmitTypeNames` rewrote in place** while `nodeTyIx` kept the pre-canon type; the `@<index>` tell is `repElemKeyGo`'s identity arm over UN-WIDENED `TyLit`s, not a `TyVar` from a clone. **0 come from `emit_mono`** (every synthesis routes through `synthTypeRef` → `recordClonedNodeTy`; TYPED-IR P1 already measured 729/729). **STRUCTURAL FIX BUILT AND MEASURED**: a lockstep `nodeTyIx` write at canon closes **55 of 61 losing 0 agreements** (vs the old `repElemKeyPortable` guard's 59→8 at a cost of 109); residue 6 = 2 shared generic-alias declaration nodes (both routes wrong) + 1 `refArrElemName` MIS-CUT where the arena is right. Suites identical both ways (cases_wasm 1,735/0/7; align 1,742/0/0 gated); wasm sha256 **4 of 1,805** move, all four still oracle-clean. **NOT SHIPPED: `T.tys.length` moves on 61 of 1,528 programs** (monotone append, +0.35%, 0 shrink) — owner ruling. Safer variant: a separate `canonTyIx` column instead of overwriting `nodeTyIx` | **TAKEN 2026-08-19 as the separate-`canonTyIx`-column variant, and the ruling's premise did not reproduce: 0 of 2,010 files move on wasm sha256, exit code or diagnostics; `T.tys.length` moves on 93 of 1,559 (+0.55%, monotone). Coverage 95.2% -> 97.6% at 1,071 agree / 0 disagree.** One unpushed commit if the owner still wants to hold on arena growth alone. B3 and B6's node-bank residue unblock behind it, and D-B6THREAD §2 prices that residue: the same split is **215 of 299 on index / 13 of 299 on key** at `collectAnnShapes`, one peel further out | M | **HIGH** |
| ~~**B6**~~ | ~~Arena-index threading~~ (D-INLINESHAPETY / D-REPELEMTY) | `destringify-types-program.md` D-B6THREAD | **RE-DERIVED, one route SHIPPED, the rest BLOCKED-REP.** The discrepancy was two UNITS of one population: the interner mints **1,064** rows, **14** take the hint and **1,050** reach `resolveAnnot` — `14 + 539 cUserTypes + 1,050 + 130 = 1,733` CALLS. **The "18" is unsourced**: #1334 credits it to #1331, which never censused this site; the only census (D-INLINESHAPETY §1a) says 14, and 14 is what the hint answers on this base. Population left at row 2 = the NODE bank at `collectAnnShapes`: 806 of 874 site-1 mints are node-rooted, **300 uncut**, and threading them MIXES VOCABULARIES — **215 of 299 disagree on index, 13 of 299 on `repCanonKey`** (vs B5's 61 of 1,400 one layer in), 4 witnesses canon-rewritten + 9 `TyLit`-by-index; **132 of 300 MINT**, so it moves the arena too. **SHIPPED instead: the kind-6 vals ref-list slot**, filed blocked on a hoist that does not exist — `vTy` is computed above the whole block. 196 of 200 entries banked, **196/196 key-identical, 196/196 `ΔT.tys = 0`**, both minting entries in the declining 4. `repElemKeyOfNameTy` 3,910 → **3,714 (−196)**, three control rows unmoved; per-file A/B **0 of 1,808 on wasm sha256 AND 0 of 1,808 on `T.tys.length`**; +25 B | **CLOSED** for the shipped route; the node-bank residue stays **BLOCKED-REP behind B5** | — | — |
| **B7** | **W9 — canon `renderEmit(ty, ctx)`** | `typecheck.vl:9524`, `:7985`, `:6723` | **B2 = 176 / 7,201 = 2.44%**; gate 4b admits **4 distinct spellings corpus-wide** | **DESIGN-BLOCKED** — canon is name-in/name-out by contract | L | high |
| **B8** | **W10 — `nameToTyReal`**, the checker's second descent | `typecheck.vl:6184` | a SOURCES problem; the "~150 ops" headline **predates the #1327 unit correction** | OPEN, **re-derive** | L | high |
| ~~**B9**~~ | ~~W13's ~60 single-writing floor~~ | `destringify-types-program.md` D-FLOORREAD | **RE-DERIVED BY READING THE BODIES. It is not 60.** Site population **98 → 38** (five modules at zero); those 38 are **22 distinct operations, 16 copies**; **8 of the 22 re-write a home that exists** — three in files that already IMPORT it (`emit_mono` x2, `emit_classify` x1) — and 2 are declines against one. **Floor = 12**, of which 3 are declines the leaf header records, leaving **9 unhomed grammars with no filed reason**. `tyname.vl` itself is **35 bodies / 16 operations** (the CUT is ten one-line `slice`s) | **CLOSED** | — | — |
| ~~**B9a**~~ | ~~the three FREE routings D-FLOORREAD found~~ | `destringify-types-program.md` D-FREEROUTE | **SHIPPED, and only TWO of the three were free.** `:2194`→`arrElemNameRaw` and `:3438`→`fnRetTextOf` are answer-identical on every input (the second provably: the leading-space skip commutes with the arrow cut). `:2185`→`nameIsArray` ADDS the `']'` conjunct, so it is a strict TIGHTENING; its divergence class (a name ending `[` with no `]`, i.e. a quoted literal such as `"a["`) cannot reach the site — the checker rejects a non-array at a `T[]` param (`expected T[], got "["`), and the tightened reject reuses the site's own message | **CLOSED** | — | — |
| ~~**B9b**~~ | ~~operation 4 is written twice and the two answers DIFFER~~ | `destringify-types-program.md` D-FREEROUTE | **MIS-IDENTIFIED, and the disagreement is UNREACHABLE.** Not one operation written twice: `emit_base.tyGroupWrapsWhole` and `tyname.parenEnclosesWhole` are two NAMED predicates over one ladder, each correct for its own consumers (SPAN tests want never-closes ⇒ TRUE, PEELS want FALSE — a group whose closer does not exist has no final character to give up), and three in-tree headers already say so. The copy was `typecheck.vl:6285`, `parenEnclosesWhole`'s body verbatim; routed to the predicate's home. Reachability: an unclosed paren in a type annotation is a **parse error** (`expected ) but found end of line`) and every synthetic producer wraps balanced text (`"(" + inner + ")"`), so no input reaches either reading of the never-closes case | **CLOSED** | — | — |
| ~~**B10**~~ | ~~Latent defect — only the NEGATIVE memo carries `cUserTypesVer`, so a positive entry survives a `cUserTypes` rewrite~~ | `destringify-types-program.md` D-NWBRANDKEY | **MISDIAGNOSED — closed.** Nothing is stale: `cUserTypes` has FOUR writers, three in pass 0a and one add-only, so no declared name's entry ever changes. The two indices are the newtype BASE and `nwBrand`'s second `addTy` over the same `Ty`, both current, differing in rep key only because only the base owns an `sNames` row. Re-derived at **28 disagreements in 1,034** covered reaches (21/914 memo-HIT), 7 witnesses, all `new` structs; `repRowOfName` reproduces at 0/66, `repNameCanonKey` 0/294. **The proposed stamp, built and run: 0 of 28 moved**, 357 stale hits re-resolved of which **12 re-MINT a structurally identical duplicate** (the arena runaway the memo exists to close), `T.tys` moved on **5 of 1,773** files, wasm bytes **0 of 1,773**. Inertness holds but not for the filed reason — rung 2 answers **225 in 3,083**, yet **0 of 2,607** resolved-key FIND reaches is on a disagreeing name | **CLOSED** | — | — |

**EXHAUSTED / REFUTED — do not schedule.** The name-shortcut route entire (#1334);
row 2 `sTyIxOfNameTy` (0 of 402 arena-neutral, 282 distinct spellings for 402
parses); row 1 `repElemKeyOfNameTy` (residue 15 parses = 0.8%); row 4's canon
recorder (refuted twice, most recently on REP grounds — every disagreement but two
is a `TyLit` read as its `TyPrim` base); the primitive-ARRAY rung (70 of 70 mint);
1a-i's two NODE-holding mints (refuted twice); `nameIsRefArray`; bucket 3 (shipped
#1336); the G class (closed by #1274); LINSOFT (closed); W1–W8, W12, W14.

**Refuted CHECKER-side by D-CHECKPARSE.** `primTyOfName` covers 5,105 with 0
disagreements but buys nothing — `tsLeafTy`'s FIRST LINE already *is* `primTyOfName`,
so there is nothing between caller and answer to skip. `cUserTypes` is refuted much
harder here than at the emitter: **345 disagreements in 3,135 (11.0%)** at 13 of 16
sites, against the emitter's 28 in 1,034, over two mechanisms — the newtype brand and
the transparent alias — plus a **live type-parameter binding** (`tsLeafTy` asks
`tpEnvTyOfName` before `declaredTyOfName`) that the emitter cannot have. The first of
those mechanisms is the emitter's too: D-NWBRANDKEY shows every one of its 28 is a
`new` struct's base-vs-brand pair, not the stale memo B10 filed.

**Standing soundness rule.** A newtype over a struct separates arena-index identity
from rep identity; any future rung here must be graded against it. **The fuzzer is
structurally blind to it** — the grammar emits no `new` type (820 covered fuzz
reaches, 0 key disagreements), so fuzz agreement is not evidence for this class. The
hand-built population is
`tests/cases/memory/newtype-struct-reflist-key-population.vl` (two same-shape
newtypes, their plain declared twin and a bare inline shape, at four ref-list element
positions) plus the `newtype-struct-*` cases in `tests/cases/maps/`.

---

## Band 2 — webcraft asks

**State.** More closed than the requirements doc reads. All of P0, plus P1.1, P1.4,
P1.5, P1.6 shipped; P1.2's fusion half and `T.size` and the `Rows<R,A>` brand
shipped (#1317 / #1329 / #1335); `match` phase 2a and 2b shipped. What remains is
small and concentrated.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **C1** | **P1.3 — union box must melt when the payload is READ** | `unboxed-union-rep-design.md` §12.4 / §12.7 | phase 1 **#1322** (78 sites over 76 functions; **wash** at plain `vl build`, **1.76× at `-O`**); if-expr **#1337** (1.67× at `-O`); binding sink (1.36× default / 1.68× `-O`). The `let`-on-two-branches remainder re-derived: **4/4/4 with the payload READ**, and the blocker is Heap2Local's single-definition requirement, not the emitter | **CLOSED — measured negative.** Three sinkable spellings ship; the fourth needs a REP change (escalated, not done) | M | med |
| **C2** | **P1.4 follow-on — backing-pointer LICM** for view descriptor fields | ROADMAP `:409` (the filed `:949` was STALE — it points into `A-infer-map-value`); `buffer-design.md` §M4 | re-derived: `axpy-view` **1.725 ns/elem at `-O3`** vs a byte-identical hand-hoisted twin **0.573** = **3.01×**; split re-derived on one-axis-apart modules as reload **90.3%** / fence **9.7%** | **REFUTED — measured negative.** Emitter can reach 1 of 7 reads (**2.9%**); binaryen's `licm` moves only TOP-LEVEL loop-body statements; the axis is the INLINING BUDGET, not the view count (`scale-seedtwice`: one view, one column, **3.05×**). Route around = `--always-inline-max-function-size=60` (0 reads, 1.736→0.636 ns) at **+82% size / +127% opt time** on the compiler → belongs to **C3** | L | med |
| **C3** | **P1.3 — optimization defaults** | ROADMAP `:353` | three-rung sweep separates `OPT-LOSES` (7 rows) from `O3-WORSE-THAN-O` (`sort-heap` 854/**648**/837). **C2 (#1403) adds a SECOND knob to the same ruling**: `--always-inline-max-function-size=60` melts the view descriptor outright — `axpy-view` **1.736 → 0.636 ns/elem** with the kernel module 113 B *smaller* — but costs the 1.16 MB compiler module **+82% bytes (955,265 → 1,740,871)** and **+127% wasm-opt time (22 s → 50 s)**. `flexible=60` is the cheap half: 1.199 ns, +28% compiler size. So the rung default and the inline budget trade the same way — a big runtime win for consumer kernels against build cost on large modules — and should be ruled on together, not separately | **RULED 2026-08-18 — DONE as a ruling, doc work remains.** Both knobs answered the same way: `-O3` STAYS the release rung (12 of 46 rows materially better vs 4 worse; `sort-heap` is the named exception, not the default-setter), and the inline budget is a **build flag, never a default** (same shape as C10 — a fixed tax on every module for a win only some want). Residual work is documentation, not code: the `-O` column into `bench/results/summary.md` (`grep -c 'vl -O \|'` → still 0) and `sort-heap`'s shape into `cli-design.md` | S in code | moves published guidance |
| **C9** | **webcraft doc staleness** — P1.2, the `wasm-opt` soft-no-op clause, `match` phase 2 | `webcraft-requirements.md` :309/:371-396, :446, :806 | the three blocks it named were already corrected; what was still live was **P1.3's advice**, which told the consumer *"there is no source workaround… do not restructure sim code"* while **three of the four spellings now sink** (#1322 one-site-per-function 1.76x at `-O`; #1337 the if-EXPRESSION arm 1.67x; the BINDING sink 1.36x default / 1.68x `-O`). Only a `let` ASSIGNED on two branches still reads 4/4/4. Corrected, and the guidance INVERTED: prefer a `const` bound to an if-expression over a `let` written on two branches. A16's stale 81/42 population corrected in the same pass | **DONE** | S | none |
| **C10** | **Names section** — the ask says "keep emitting"; it is **opt-in and off by default** | `emit_sections.vl` `gEmitNames`; `--names` | default build **167 B, no names**; `--names` **258 B**. Flipping the default costs the seed **+60,297 B (+5.3%)**: 1,137,213 → 1,197,510 | **Resolution: consumer passes `--names`.** Do NOT flip the default | S (doc) | none |
| **C5** | **A16 — litunion correctness in MIXED unions** | `webcraft-requirements.md:823` | ~~81 of 244 grid cells broken, 42 silent wrong answers~~ — **REFUTED as a live number**: all three exemplar shapes the requirements doc nominates are correct on the tip, plus six more, **9 of 9 in a correct outcome column** | **CLOSED — no half worth scheduling.** The two owner rulings gated the REPRESENTATION feature, and measurement had already concluded it should not be scheduled as a memory feature (a standalone litunion and all four keep positions already rep as an interned i32 atom; the mixed-union store already costs exactly one `struct.new` against an interned global, so no encoding allocates less). With the correctness half gone too, nothing remains. **Caveat: 9 probes is not a 244-cell grid** — re-derive before anyone schedules against it | M | — |
| **C6** | **`match` residuals** — a binding arm cannot be a `const` INITIALIZER | ROADMAP `:1196` | was `emitProgram: if-expression arm is not a single value`; the grid says the BINDING broke value position, not `match` (statement + tail already lowered it, the `if` twin failed identically) | **DONE** — the if-expression arm gained a PRELUDE, so `match` AND `if` both lower in binding-init and `return` position; argument position + a TOP-LEVEL binding stay loud rejects | S–M | low |
| **C7** | **B15a — default / optional params** | ROADMAP `:991` | **the `$fnsig` sequencing constraint was NOT live** — `fnSigKeyOf` keys off the DECLARATION's parameter list, never a call site's arg count; the call normalization runs before mono/collect and classifies its callee with `emitCall`'s own `fnIndexOfInScopeChain` | **DONE** — `p: T = <literal>` and `p?: T` (sugar for `p: T \| null = null`) parse/check/lower; a function VALUE keeps full arity. Literal-only, annotated-only, trailing-only, no type-param mention. UFCS stays exact-arity by ruling | M | none |
| **C8** | **Readonly fields / A9 variance** | ROADMAP `:780`, `:782` | **the SILENT half is CLOSED and the boundary is pinned in both directions (#pending).** My filed axis was wrong **twice over**: not the array element — a **BARE binding breaks identically, no container involved** — and not width-vs-depth, but the source's shape **PROVENANCE**. A PINNED value (parameter, callee return, field read, annotated binding) cannot reach any different shape; an **UN-ANNOTATED binding of an object literal is re-interned at the destination row**, so reorder, a widened field type and even a **NESTED dropped field all WORK there** — same type pair, opposite verdicts. Only a **top-level dropped field** is unconditional, and that is exactly what now rejects. **My stated discriminating control was itself broken** (`const a: Animal = someCat` never worked), so "must keep working" was vacuous — the second slice running where my control did not discriminate. 337 cells: check-clean invalid wasm **124 → 79**, program traps **17 → 5**, **63 moved, 0 regressions**; width at a direct container boundary **100% closed** (54 → 0). Corpus **0 verdict changes** and **1,609/1,609 modules byte-identical** — nothing in the corpus exercised the hole, corroborating "not even pinned as xfail". **It hit the stop-and-report condition on its first cut and did not ship it**: that version rejected two correct working corpus files, which is what forced the provenance measurement. The full variance feature remains **BLOCKED** and untouched — no emitter file, no adapter, no WasmGC subtype declaration. 55 residual cells (43 depth, 10 field-nested width) are left check-clean invalid wasm **on purpose**, because the identical program with an un-annotated literal source works, so rejecting them would reject working code | **SILENT HALF CLOSED** (objects, #1456) **+ the CONTAINER-ELEMENT half closed 2026-08-18**; **RULED 2026-08-18** — inferred surface, no annotation in v1, and the filing's "which programs start failing" framing is REFUTED by measurement: that population is empty of *working* programs (all six subtype-container shapes already reject loudly or already emit invalid wasm). The feature splits — the **Writable** half is a free win (check-clean invalid wasm → loud reject), the **Readable** half was never blocked on the ruling at all but on REPRESENTATION (`i32[]` → `(i32\|null)[]` is sound, the checker agrees, the emitter has no conversion between two WasmGC array types) | L | high |

**Open question for the consumer, not for us.** A16 asks webcraft directly whether
the mixed-union enum pattern is real or hypothetical; it is unanswered and is the
cheapest thing in this band to resolve. Same for the `getF32At` scalar accessors
(**zero compiler lines, 3.0× on the fenced two-view kernel**) — filed RECOMMENDED
AGAINST *until a consumer actually asks*.

**Non-asks — do not build:** exceptions/async, separate compilation, UTF-8 strings,
WASI, std math/trig, in-language GC knobs, SIMD (not requested), branch hinting.

---

## Band 3 — everything else

### 3a. Correctness

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **D1** | **Litunion with no alias of its own** — `u is A` over `A \| B` always answered FALSE | `overlapping-arm-defects.md` "the litunion remainder" | **CLOSED.** The receiver is a member STRING, not an atom (`(param (ref $1))` in the disassembly) — the filed classifier gap did not exist; the string rep had no `is` lowering. Added the string-equality membership ladder | S–M | **LOW** |
| **D1a** | **Narrowed CONSUMPTION of a string-repped litunion** — `if u is K { const r: K = u }`, or passing the narrowed value to a `K` param | same section, "D1a is CLOSED" and "the narrowed-consumption re-grid" | **CLOSED — already, by #1380's `emitStrToAtom` and #1409; the re-grid found the residue is not narrowing at all.** 1,156 cells (10 receiver reps × 6 guard forms × 8 destinations, a 20-origin grid, 7 place receivers in situ, subset/alias-identity/nullable/closure/generic shapes): **0 silently wrong, 0 invalid wasm attributable to the narrowing**. Every invalid-wasm cell in the grid reproduces with the `is` DELETED — they are D1d/D1e/D1g below. What the re-grid did find is one live defect ON the consumption path: a CALL in an atom-typed destination pushed its own atom context into the callee's ARGUMENTS (216-cell spine grid, **137 invalid-wasm → 0**, two commits). Pinned by `call-arg-rep-belongs-to-the-callee.vl` (behavioural) and `narrowed-litunion-consumption-forms.vl` (coverage — it passes on master too) | **CLOSED** | — | — |
| **D1d** | **A nested function / lambda that CAPTURES a narrowed union binding, or captures a litunion ATOM** | measured beside D1a | **NOT a litunion defect and NOT a narrowing defect — measured both ways.** `function p(u: string \| i32) { if u is string { function g() { print("C:" + u) } g() } }` is `vl check`-clean invalid wasm (`expected (ref $type), found (ref $type)` — the box vs the string), and so is the litunion ATOM with **no narrowing anywhere**: `function p(u: K) { function g() { print("C:" + u) } g() }`. A struct union takes the loud floor instead (`field access but no struct type declared`). The capture FRAME is typed from the declaration while the body reads assume the narrowed/atom rep. 28 of 900 D1a grid cells, every one of them reproducing with the guard deleted | OPEN — capture-frame typing, a rep decision | M–L | med |
| **D1e** | **An un-annotated (monomorphized) param is assignable to a `K` slot with no narrowing** — `function p(u) { const r: K = u }` | measured beside D1a | **CLOSED by SOLVING the parameter from its usage** — the owner's third option, strictly better than either branch of the filed escalation: nothing is lowered by a fallback tower and no new rejection is invented. `const r: K = u` requires `u` assignable to `K`, so a quiet body probe (pass 1.6) reads that constraint and records `K` as the parameter's type; `unannotParamTy` is the ONE producer every reader goes through, and `recordedParamPinName` is its emitter-side twin (read by `synthParamAnnots` AND the monomorphizer's pin, which used to derive a second answer from the argument type). The filing missed that the VALID-member case was broken too — `p("a")` was invalid wasm, not just `p("zz")` accepted. 840-cell grid (12 constraint shapes × 8 constraining types × 5 argument shapes, plus a 5-form axis) against the annotated twin as oracle: **all 660 flow-constraint cells at parity, from 583**; 100 cells master accepted now reject and the annotated twin rejects all 100; 24 cells master wrongly rejected now run. Corpus A/B over 1,846 files: 0 output changes, 0 verdict changes, 1 message change. `inference/unannotated-param-solved-from-usage.vl`, `soundness/unannotated-param-solved-nonmember-reject.vl`, `inference/unannotated-param-solved-composite-and-nested.vl` | **CLOSED** | — | — |
| **D1h** | **A hole parameter with NO constraining usage, receiving a litunion argument** — `function p(u) { print(u) }` + `p(av)` where `av: K` | measured beside D1e | **LOUD as of D1e, silently wrong before it.** Nothing in the body constrains `u`, so there is nothing to solve and the parameter stays a hole; master pinned it from the argument, lost the type at the `"i32"` catch-all, and `print(u)` printed the raw atom id **0**. D1e's parameter pin makes the wasm parameter the atom, and the print floor now fires (`print of a nullable literal union — narrow it first`) because `nodeLitUnionMemberTexts` reads the NODE's recorded type — still the hole — while `exprIsLitAtom` reads the parameter's ANNOTATION. Two readers, one question: the member texts have to consult the parameter pin too. 10 of 840 D1e grid cells | OPEN — one classifier's second input | S | low (loud today) |
| **D1i** | ~~**`u == kk` against a litunion alias is invalid wasm, and holes are not involved**~~ — `const kk: K = "a"` + `function p(u: string) { print(u == kk) }` | measured beside D1e; `wasmEmit.vl eqAtomOperandOk` / `emitStrEq` / `emitUnionEqOther` | **CLOSED — and the filed 16 was 52 in one grid and 126 in a second.** The atom `==` forced its litUnion context on BOTH operands, so a plain-`string` side pushed a `(ref $array)` under the `i32.eq`. `eqAtomOperandOk` is the single bound on "can this operand be lowered as an interned id" (an atom, a member `StrLit`, a string-repped litunion — and NOT a union box, which it refuses on an `exprUnion` line placed in front of the banked-type test, because the checker banks a PURE litunion type at a `K \| i32` operand of this very compare). A mixed pair falls through to the string compare, where `emitStrEq` now emits both sides through `emitStrValue` — the boundary `emitStrConcat` already used — so the ATOM widens. **The direction is forced, not chosen**: `emitStrToAtom`'s tower makes the last member the unconditional default, so narrowing a non-member `"z"` would answer EQUAL to that member — invalid wasm traded for a silent wrong answer. The union-BOX pairing needed four more sites that each read a NAME where a REP was meant (the per-operand exclusion, the litunion-arm gate, `unionEqAtomOf` naming an atom under the box's STRING arm, `emitUnionEqOther`'s kind-2 widen + `exprIsUnionStrEq`'s matching frame reservation). Grids: 490 `==` cells (7 flavours × 7 receivers × 5 operand shapes × 2 ops) **52 invalid-wasm → 0**; 1,053 form/operand-shape cells (7 guard spellings × map-read / element / if-expression / const / literal operands) **126 invalid-wasm → 0, 28 loud → 14**. 0 silently wrong before or after, both grids. `eq-litunion-atom-against-string-operand.vl` | **CLOSED** | — | — |
| **D1j** | ~~**`u is Z` over a NUMERIC litunion answers the wrong branch for a hole parameter**~~ — `type Z = 0 \| 1` + `function p(u) { if u is Z … }` + `p(1)` | measured beside D1e; `wasmEmit.vl isNumRecvBaseName` | **CLOSED — and the filed 2 cells were 24.** The receiver half of the membership test asked `nodeNumScalarBaseName`, which reads the type the CHECKER banked at the node; an un-annotated parameter has no annotation node to bank one on, because `monoArgTyName`'s `"i32"` catch-all is the one arm of the pin that deliberately mints none. So the arm declined and the guard fell to `monoStaticIsResult`, which const-folds a literal tested type to FALSE. `isNumRecvBaseName` composes the bank with `monoArgTyName` — the same `fnIx`-scoped answer that fold reads — so the arm claims exactly the receivers the fold would otherwise decide, PER INSTANCE. A nullable receiver is refused on the same line and for the same reason that fold refuses one. The filing found the `if` spelling at one member set; the grid found all six guard spellings (negated, `is`-as-a-value, `while` guard, both short-circuit positions), the GENERIC `<T>` receiver as well as the hole, and i64/f64 member sets — **24 silently-wrong cells → 0**. The hole-receiver guard emits a body **byte-identical** to the `u: i32` control's (13 instructions). The `string` instantiation of the same generic still answers NO, which is what keeps the receiver half honest. `is-numeric-litunion-hole-receiver.vl` (log mismatch on master: 12 lines) | **CLOSED** | — | — |
| **D1k** | ~~**A union BOX named by a declared ALIAS answers `is` TRUE for every string it holds**~~ — `type W = K \| i32` + `function p(u: W) { if u is KS … }` where `KS ⊂ K` | found while gridding D1i/D1j; `wasmEmit.vl unionCarriesLitUnionArm` / `unionStrArmCountOf` / `isValueUnionOfSet` | **CLOSED — unfiled, and the worst class on the board when found: `vl check` rc 0, `vl build` clean, the wrong branch.** Every predicate deciding "does this box carry a literal-union arm" answers by splitting the SPELLING it is handed at top-level `\|`, so an alias splits to the single atom `"W"` and answered NO — the alias-annotated receiver fell past the membership arm into the box-tag compare, whose `tag == 2` is TRUE for every string in the box, while the INLINE `K \| i32` spelling of the identical box was correct one line away. The exemption it landed on ("one string-repped arm, so the tag decides exactly") is sound for the FULL arm and false for a proper subset of it. Four predicates now resolve the alias through `unionMemberSetOf` before asking, and the box-tag soundness FLOOR counts its string arms the same way so the arm and the floor cannot disagree about which shapes have a lowering; inside `emitUnionLitIs` / `emitUnionConcreteEq` the arm SPELLINGS are resolved once while the interned member SET stays keyed on the receiver's own name — without that the newly-claimed alias found no arm able to hold a quoted literal and const-folded the compare to 0, the opposite wrong answer. Three box shapes were affected (`K \| i32`, `K \| string`, `K \| K2`) plus two spellings that failed LOUDLY for the same reason (a bare literal through the alias, and a NUMERIC litunion arm under one). The alias receiver now emits a body **byte-identical** to its inline twin (19 instructions). `is-litunion-arm-box-alias-spelling.vl` (log mismatch on master — the silent half, with the inline spelling as the in-file control that does not move) + `is-litunion-arm-box-alias-loud-spellings.vl` | **CLOSED** | — | — |
| **D1f** | **Two narrowing positions the checker does not reach** — a `while` GUARD's body, and an ELEMENT place | measured beside D1a | **LOUD, both.** `while u is A { const r: A = u }` is `cannot assign "x" \| "y" \| "z" \| "w" to 'r'` — the guard's narrowing does not enter the loop body, though an `if` narrowing DOES survive into a `while` nested inside it (measured, both directions). `if xs[0] is A { const r: A = xs[0] }` is rejected the same way while the FIELD place `if so.g is A { const r: A = so.g }` is ACCEPTED at all six destinations — so `overlapping-arm-defects.md`'s "the checker does not narrow a member-path or element receiver" is now half stale: only the element half holds. 11 + 5 cells | OPEN — checker narrowing, no codegen involved | S–M | low |
| **D1g** | **A monomorphized instance pinned to the ATOM rep receives a string-repped litunion argument** | measured beside D1a | `function ident(v) { return v }` + `const av: A \| B = "x"; const r = ident(av)` is `vl check`-clean invalid wasm: the instance is emitted `(param i32) (result i32)` — the atom — while `av`'s slot is `(ref $array)`, because the un-named flattened `A \| B` keeps the STRING rep at `RC_ROOT`/`RC_FN_PARAM` (`ctxKeepsLitUnion`) and the instance signature does not consult that. No narrowing involved; the ANNOTATED callee (`ident(v: A \| B)`) is correct. 5 cells | OPEN — the instance signature must agree with `nodeTyIsLitUnionAlias`, not with "is a litunion" | M | med |
| **D1b** | **`string` receiver tested against a litunion** — `function f(s: string) { if s is A … }` | same section | **CLOSED.** The filing was a third of it: a 233-cell grid found **82 silently-wrong cells, not 16** — the plain `string` receiver (const FALSE, every origin and every test form), the un-annotated monomorphized param, AND a value-union BOX whose one string-repped arm is not the tested type (`string \| i32`, const **TRUE** — the opposite sign, unfiled). One membership ladder shared with the bare-literal spelling (`emitLitMemberEq`) took **82 → 0**: 77 correct, 5 to the loud non-place floor. Fixture `is-litunion-over-string-receiver.vl` scores 15 wrong lines without it | **CLOSED** | — | — |
| ~~**D1c**~~ | ~~**RAW `string \| null` receiver tested against a litunion** — `function f(s: string \| null) { if s is A … }`~~ | `overlapping-arm-defects.md` "D1c is CLOSED"; `wasmEmit.vl emitNulStrLitEq` / `litMemberRecvIsNulString` | **SHIPPED — the OWNER RULED (a null receiver answers FALSE), and the filed 16 was 52.** Re-gridded as its own population, **104 cells** (5 receiver types × 4 tested-against spellings × 6 test forms × 9 receiver origins, each at a MEMBER, a NON-MEMBER **and a NULL** input): correct **31 → 83, 0 regress**. Two halves, failing two ways: the BARE LITERAL (22 cells) **traps 11 → 0** at a param/local/field/global — where the read recovers with `ref.as_non_null` — and `vl check`-clean **INVALID WASM 3 → 0** at a call result / map read / list element, where nothing recovers and a `(ref null $array)` reached `__str_eq__`; the MEMBERSHIP ladder (82 cells) was a loud emit-reject, **47 → 9**, and its refusal was CORRECT while the compare it delegates to still trapped. **ONE home**: the guard is `emitNulStrLitEq` inside `emitLitMemberEq`, the per-member compare both spellings share — `br_on_null` over ONE raw read (`m["k"]` types `string \| null` and is not a place; a re-read would re-probe), and `litMembershipRecvOk` now asks the same `litMemberRecvIsNulString` predicate rather than carrying its own answer. Silently-wrong **0 → 0** on both halves. A second, smaller fix fell out: the `string \| null` `??` arm declared a non-null block type unconditionally, so `(p ?? q) is "m"` and `(p ?? q) != null` were wrong for a NULLABLE default (the latter answered **TRUE for two nulls**). Soundness both directions: the THEN branch narrows non-null, the ELSE branch and a negated then-branch do NOT and a value use there is still a type error. **All 1838 pre-existing corpus modules build BYTE-IDENTICAL to the branch point** — reject parity 0 of 300 error-directive cases. The two spellings' emitted opcode sequence is identical (type indices normalized). Residue 21, all LOUD and at parity with a non-nullable receiver: 5 call/`??` receivers keep the multi-member re-readable-receiver floor, 2 are the atom-repped `K \| null` element/call, 12 are the checker's newtype-brand reject. **Measured, filed, NOT fixed**: a `for x in xs` loop var over `(string \| null)[]` still traps on a null element in both spellings, unchanged — the checker types `x` as `string?` but banks no nullable node type for the reference, so the guard's narrowing signal false-positives; the narrowed oracle for that shape does not compile either. A nullable string CAPTURED by a nested function is a pre-existing loud emit-reject, unmoved. `literal-unions/is-nullable-string-receiver.vl` (reddens on master), `error-is-nullable-string-else-not-narrowed.vl` (boundary pin — passes on master too) | **CLOSED** | — | — |
| **D2** | **Numeric literal unions** — `tyIsLitUnion` requires every member `litKind == "str"` | `typecheck.vl:18621`, `:19019` | the litunion machinery is **string-only by construction** while VL models str/flt/int literals | OPEN — **do NOT bundle with D1** | M | med |
| **D2a** | **A NUMERIC litunion under `\| null`, tested with `is`** — `type N = 1 \| 2`; `let p: N \| null = 1`; `if p is N` | in flight | **I had this filed as "12 cells, LOUD". That was WRONG** — re-measured on the tip today, its primary verdict is **check-clean INVALID WASM** (`vl check` says "no errors", then `type mismatch: expected i32, found (ref $type)`), which puts it in the silent class and raises its priority. Six measured shapes, all `vl check` rc 0: the named `let` → **invalid wasm** (offset 238); the inline single-literal `is 1` → **invalid wasm** (offset 206), so it is not about the alias name; the **PARAM** position → **LOUD** (``emitProgram: `is` names a type that is not a union variant``), so the verdict is position-dependent and there are two decision sites. **Three controls constrain it from three directions**: the *string* litunion's `is` under `\| null` is CORRECT (rep axis), the *`!= null`* test on the same numeric type is CORRECT (test-form axis — and it is #1439 that made it so, via `nulNumLitUnionBaseName`), and `i32 \| null` is a BOX, so the mismatch signature is a box reference reaching an unboxed-scalar slot — the same signature #1439 fixed at `w.f != null`. Hypothesis handed to the agent: the `is` path is a **third consumer** never wired to `nulNumLitUnionBaseName` | IN FLIGHT | — | — |
| **D3** | **ROOT A** — `emitIs` compares ONE tag | `wasmEmit.vl:1877`, `:1832` | **49 of 64 cells**, but **not re-derived since #1343/#1341** — treat as an upper bound | OPEN | L | med-high |
| **D4** | **Generic alias application as a union member** — `type U = Box<Box<i32>> \| i32; const u: U = { v: 5 }` is ACCEPTED | suspect `typecheck.vl:9054` | three controls localise it exactly; **defect confirmed, mechanism NOT** | OPEN, mechanism blocked on W9 | M–L | med |
| **D5** | **Struct arms differing only in a shared STORAGE code** — `{a:i32} \| {a:boolean}` | `emit_collect.vl:4498 variantFieldCodesEq` | `boolean`/`i32` share a storage code, so the pair is treated as the layout-equal twin the exemption exists for | OPEN, pinpointed | S | low-med |
| ~~**D6**~~ | ~~**Function-type union arms**~~ **SHIPPED #1471** — every function-typed arm of a union shares ONE box tag, so `x is F` is a constant TRUE across them | `overlapping-arm-defects.md` "D6 … is MEASURED"; `emit_classify.vl unMemAtomKind` (`if t is TyFunc { return 11 }`), `emit_rep.vl scalarTagOfKind` | **MEASURED, 380 cells + 36 controls: 77 RUN-WRONG, of which 72 are this defect** (filed as 4). Two-fn-arm population 158 cells / 72 wrong / 86 masked (every masked cell's inverted twin moves); **all 11 receiver forms flat**, both spellings flat, **0 CHECK-REJECT**. Every non-function partner arm is CORRECT (161 of 166), and `F[] \| G[]` discriminates — the reflist band keys on the element type, which is what proves the emitter HOLDS the signature and only the bare arm's tag discards it. The filed "separate table" is refuted by the disassembly (both arms emit tag `11`). Silent: `const y: F = x` over a mis-narrowed `G` runs; the trap only comes at the call | OPEN, filed not fixed | M–L (table-index membership, needs a deferred elem-segment patch) / S (loud floor — **0 corpus files** carry a two-fn-arm union) | med — the floor costs the 86 masked cells their compile, so it is reject-parity work |
| ~~**D7**~~ | ~~`%` with a FLOAT operand emits invalid wasm~~ | `emit_base.vl:552`/`:591`, `wasmEmit.vl` | **SHIPPED #1382 — REJECTED, not lowered.** Full grid 272 cells: BROKEN **6 → 0**, CLEAN unchanged at 128, REJECT +6. The filed lowering `a − trunc(a/b)*b` is **not fmod** — it disagrees with Rust's `f64 %` on **86,066 of 200,000** random pairs (43.0%), so shipping it would have traded a loud reject for silent numeric corruption. Exact remainder belongs as a float intrinsic later; rejecting stays correct if that lands | **CLOSED** | — | — |
| ~~**D8**~~ | ~~Nested function that CAPTURES~~ | `emit_classify.vl` scalar classifiers, `capturedKindOf` | **SHIPPED #1383 — and the filed mechanism was WRONG.** Not the value ABI's i32 param default: the env field was already `(struct (field f64))` with the right value, and the only wrong byte was a spurious `f64.convert_i32_s` on the **read**. Re-gridded at **352 cells** (a 4th annotation-variant axis the filing lacked); invalid-wasm **52 → 8**, and all 8 residues were D7's `f64 %`, now also closed | **CLOSED** | — | — |
| **D9** | **`s?.f is T` over an OPTIONAL-CHAIN receiver answers a constant FALSE** where the field is a NICHE nullable or a ref-element array | `overlapping-arm-defects.md` "D9 is FILED"; `emit_mono.vl monoArgTyName`'s final line (a bare `"i32"` catch-all), trusted by `wasmEmit.vl monoStaticIsResult` | **MEASURED, 104 cells (13 field types × 2 builds × 4 receiver forms). The filed mechanism is REFUTED**: the `sFieldTypeAt == 16` gate is in `isStrTagUnionNameOf`, which supplies a NAME to a floor the guard never reaches, and this is NOT #1380's remainder either (a niche tested type reaches no membership arm, so `unionEqOperandOk` never runs). The guard is `i32.const 0` in the disassembly. **D9 proper is 12 cells** — 6 field shapes × 2 chain depths, the chain-depth axis FLAT. The CORRECT column is every BOXED field (`i32\|null`, `i64\|null`, `f64\|null`, `string\|i32`, `i32[]\|string`), where `exprUnion` short-circuits the fold. **The blocker is one layer down**: `s?.f != null` — the sibling lowering a fix would route into — is itself WRONG for the string and litunion niches (a stored `null` answers `yes`) and right only for the struct-ref niche | OPEN, **filed not fixed** | M–L (the niche-leaf chain read, a rep decision across 5 niche kinds) / S (loud floor — **0 corpus files** carry an `is` over a chain with a niche field) | low — fails closed; the floor costs 7 masked cells their compile, so it is reject-parity work |
| ~~**D10**~~ | ~~A bound map read of a niche-nullable value emits INVALID WASM with no `is` in the program~~ | `overlapping-arm-defects.md` "D10 is CLOSED"; `emit_collect.vl mapValIsClosure` + `collectFnValUse` | **SHIPPED — and the `\| null` was a coincidence of the witness.** 300-cell grid (12 value types × nullable/plain × 3 read forms × 3 store states × called/uncalled): **3 INVALID-WASM, all `fn`-valued, and one has no `\| null` and no store at all.** The trigger is *the map's VALUE CELL is a closure and the program constructs no closure*, so `fnValUsed` stays false and the bound local claims a heap index no closure struct occupies. An 18-cell position grid moved 8 (6 INVALID-WASM + 2 loud `no interned signature`), 0 DOWN | **CLOSED** | — | — |
| ~~**D11**~~ | ~~A degenerate ONE-member union (two aliases with the same structure) breaks `is`~~ | `overlapping-arm-defects.md` "D11 is CLOSED"; `wasmEmit.vl monoStaticIsResult`, `typecheck.vl tyRenderSoftensLits` | **SHIPPED — and the union was the witness, not the mechanism.** The fold compared a CANONICAL receiver name against the RAW tested spelling, so a transparent alias never matched itself: `type A = i32; function p(x: A) { if x is A … }` printed `no` with **no union in the program**. The semantics question is answered by `types/struct-union-same-shape.vl` — an alias IS its base, so TRUE. 128 cells **77 UP / 0 DOWN**, plus 4 UP on trivial-`is` probes and 2 on newtype controls; every cross-type brand cell still CHECK-REJECT. Still open on the same grid: the MAP twin (10 of 12, D9's `"i32"` catch-all) and the FUNCTION twin (12 loud, D6's decision) | **CLOSED** | — | — |

| **D12** | **A literal-union → `string` materialisation in a function's TAIL EXPRESSION emits INVALID WASM** — `function f(k: K): string { k }`, where `K` is a literal union, compiles clean and produces a module that will not instantiate: *"unknown local N: local index out of bounds"* | the atom→string lowering (the `select` chain over the union's pooled literals) vs. the tail-expression return path; surfaced by F2, which routes every kind spelling through one such function | **MEASURED, 5 spellings of ONE semantics, on the published seed** — BROKEN: `{ k }`, `{ const s = k \n s }`, `{ const z = 1 \n if z == 0 { print(0) } \n k }`, and the un-annotated `function g() { toks[0].k }` (which also mis-infers `string` rather than the union). CORRECT: `{ return k }`, and `{ if k == "A" { return "aa" } \n k }` — i.e. an earlier explicit `return` in the same function makes the tail spelling work, which is what points at a scratch local the materialisation uses but does not reserve. Not F2's doing: it reproduces on master's seed with a 4-member union and no compiler source involved. F2 works around it (`kindTag` spells the explicit `return`, with the reason at the site) | OPEN, **filed not fixed** | S–M | low — fails LOUD at instantiation, never silently |

| ~~**D13**~~ | ~~**An INFERRED (un-annotated) return of a literal union emits a rep the call site does not consume** — `function F(k: K) { return k }` over a `type K = "A" \| …` is `vl check`-clean and produces a module the engine refuses; adding `: K` fixes it~~ | `typecheck.vl variantBoxUnionRetName` (the `psum` arity guard) + its two name consumers, `emit_collect.vl collectFns`' A20 kind ladder and `wasmEmit.vl emitReturnValue`'s `retUNm` seed | **SHIPPED — and it is NOT D12's remainder: it fails with the `return` keyword, and re-measured on top of #1407 it is unchanged. D12's "5 of 9" was a lower bound by an order of magnitude. Measured 236 cells** (return type × returned value × function form × what the CALL SITE does) **+ 18 shapes**: invalid wasm **61 → 0** and **16 of 18 → 0**. Per axis, inferred cells only: the function-form grid **21 of 42 → 42 of 42 correct**; the returned-value grid's twin-OK denominator **35 of 49 invalid → 45 of 49 correct**; the return-annotation grid's inferred row **5 of 8 → 8 of 8**. The CALL-SITE axis is **FLAT** — all 7 uses (print / `==` / `is` / annotated binding / bare binding / argument / discarded) broke and all 7 are fixed — so the filed "the call site determines whether the mismatch appears" is **refuted**: the callee's functype was already the box, so even an UNCALLED and even a DISCARDED result emits the invalid module. The mechanism is one predicate: `variantBoxUnionRetName`'s `members.length < 2` guard counts ARENA members, i.e. BEFORE its own litunion regroup contracts a run of `TyLit` members into ONE alias atom, so a pure litunion arrived carrying a single atom `K` and was recorded as a variant-box union; from there `isUName("K")` is true (every litunion registers as a union NAME) and the callee `struct.new`'d a `{tag, anyref}` box over an atom→string `select` chain whose scratch local the frame never reserved. **The CHECKER chose wrong, not the emitter** — the annotated twin's disassembly differs by exactly the functype result and that chain. **82 of 106 twin pairs are BYTE-IDENTICAL** modules (and 15 of 18 in the second grid); every non-identical pair is a shape whose inferred type genuinely is `string` (a bare-literal return, an `if`-arm join), not a rep disagreement. The `K \| null` niche shipped with it (same family, byte-identical to its annotated twin; it had never lowered — pre-fix it reached codegen and died at *"bare null needs a struct-typed context"*). **The silently-wrong class was hunted for and is 0 of 236 on this base.** On the pre-#1409 base it was **3 of 236** and none of them were this defect: `const r = F(); r is K` where `F` infers `string`, i.e. **D1b**, which reproduced for an annotated `: string` receiver too and which #1409 closed. Still open on the same grid: the NUMERIC litunion (`type N = 1 \| 2 \| 3`) is a loud reject — its members are `litKind == "num"`, which `tyIsLitUnion` excludes by construction, i.e. **D2**. The remaining 23 rejects and 7 traps are pre-existing and unmoved: the `K \| i32` and `K \| null` PRINT floors, and the shapes whose inferred type is genuinely `string`. `literal-unions/inferred-return-alias{,-forms,-sinks}.vl` + `inferred-nullable-litunion-return.vl` | **CLOSED** | — | — |

| ~~**D14**~~ | ~~**Two anonymous object literals with the same FIELD-NAME SET collapse onto one interned shape** — `{ v: 1 }` beside `{ v: "s" }` is `vl check`-clean and emits a module the engine refuses~~ | `overlapping-arm-defects.md` "D14 is CLOSED"; `emit_classify.vl structIndexOfObjCtxGo` / `anonValueFitsField` / `anonFieldCode` | **SHIPPED — and the filing's severity grade was wrong.** The module is NOT unparseable: `wasm-tools print` reads it and `wasm-tools validate` gives *"type mismatch: expected i32, found (ref $type) (at offset 0xc3)"* — a VALIDATION failure. The word came from the wasmtime host, which prefixes every module rejection with *"failed to parse WebAssembly module"* and puts the cause under `Caused by:`. **Across 151 cells the UNPARSEABLE count is 0 both before and after.** Measured **132 generated cells** (7 value types × ordered pairs × 5 field-set shapes × 6 placements) **+ 19 specials** (declared-vs-anon, litunion, union box, niche, newtype, map, struct-list, 3 same-valtype confusion probes), each with a differently-named ORACLE twin: `vl check`-clean **invalid wasm 69 → 0**, `vl check`-clean **SILENTLY WRONG 2 → 0**, loud rejects **22 → 7** (the 7 pre-existing and oracle-matched). Both silent cells are TYPE CONFUSIONS — one literal's field read at the other's type: `{ v: 6000000000 }` beside `{ v: 2147483647 }` read the second at **i64**, so `+ 1` printed 2147483648 instead of wrapping; a declared `{ v: boolean | null }` beside `{ v: 6 }` read 6 as the niche's **null sentinel** and printed `null`. The interner had exactly TWO axes — float (17/24) and i64 (23) — and **code reading and measurement agreed**: every f64-first and every i64-value pair was already correct, every i32 / string / boolean / list / nested-struct pair merged. `anonValueFitsField` is the general (value code, field code) refutation those two arms are special cases of, in **TWO TIERS**: refuting every mismatch on every row broke **15 corpus cases**, because a DECLARED row's codes come from an annotation the checker reaches with values the code does not spell (a bare `{f: 663810583}` adopts to an `f: i64` field; a scalar-element array literal boxes into a `(i64|string|{q:i64})[]` one), while an ANON row's codes were read off a literal and are exact. So the composite codes and the integer-widening pairs refute against anon rows only; an integer into a string field, a string into a plain i32 one and a non-boolean into a `boolean | null` sentinel refute everywhere. **A second, older defect the strictness exposed**: `anonFieldCode` read a `+` ONE LEVEL DOWN, so `"a" + f(x) + g(y)` — whose outermost `+` has a BinExpr and a Call, neither a string LITERAL — coded the field **i32**; silent while the scan was name-only, and it stopped the compiler's own `{ msg: … , at: P.pos }` diagnostics compiling the moment the scan believed the code. **Cost: +2 interned struct types and +18 emitted bytes over 1830 corpus files** (1514 that build), **1828 byte-identical**; the 2 that grew are the anon-twin cases. **Oracle parity 132 of 132 + 16 of 19**, and **121 of 132 colliding modules are BYTE-IDENTICAL to their differently-named twin** (the 11 that differ are i32/boolean pairs, which legitimately share one i32 row). Still open, LOUD and pre-existing: a declared `{ v: K }` litunion-atom field beside an unrelated `{ v: 5 }` / `{ v: "a" }` — a string literal is exactly how a litunion field IS written, so no field-code axis separates them; it needs the checker's recorded node type, which the AMBIGUITY arm consults only at 2+ matches and this is 1. `structs/anon-fieldset-collision-scalar-axis.vl` (unannotated throughout) + `anon-fieldset-collision-silent-reads.vl` | **CLOSED** | — | — |

### 3b. Inference — the design aim

| id | item | witness | status | eff | risk |
|---|---|---|---|---|---|
| **E1** | **An un-annotated function cannot be taken as a VALUE** — `const f = add` errors *"annotate them"*, while `add(1,2)` works | ROADMAP `:1006`; `emit_mono.vl monoInstanceFor` / `monoCoerceFnValueName`, `wasmEmit.vl emitClosureValue` | **HALF SHIPPED — the ANNOTATED-CONTEXT half is closed; the blocker was the EMITTER, not the checker.** `const f = add` already worked; the real population is a 320-cell grid (8 definition forms × 20 value positions × with/without a by-name direct call), of which **60 carried the value-floor message. 36 closed, 24 left.** The mechanism was two predicates disagreeing about "generic": the floor (`fnHasUnannotatedParam`) fires on ONE hole, the instance materializer (`monoInstanceFor`) required EVERY parameter to be one — so a PARTIALLY annotated function was strictly worse as a value than the same function with no annotations, in every position. Also closed: an if-expression arm, an `=` to a function-typed binding, and ORDER-DEPENDENCE (a generic that was also direct-called lost its value use, because the call path spells an i32 pin as the hole it was). **LEFT, deliberately: the 24 cells whose receiving context declares nothing** — an un-annotated HOF parameter, an un-annotated return, a bare `[add]`, a bare `{op: add}`. Those need the callback type inferred from the HOF's own body (E5 territory), not a boundary read. **Also closed, and it was the WORST cell in the family: an explicit `<T>` generic as a value slipped the floor entirely** (`fnHasUnannotatedParam` is FALSE — `x: T` IS an annotation) and emitted at the un-substituted shape: `vl check` clean, then `wasm trap: indirect call type mismatch`. 5 of 10 positions, now bound from the boundary like any other pin, with a substitute-back post-condition so a `T` the boundary binds two ways declines instead of taking first-use-wins. Reject parity: **0 verdict changes across all 1,742 pre-existing corpus cases**, ignored count unmoved at 7. `functions/generic-fn-value-{partial-annotation,conditional-and-assign,after-direct-call,explicit-type-param}.vl` + 2 `error-…` boundary pins | **OPEN for the un-annotated-context half** | M | med (`$fnsig` seam) |
| ~~**E1a**~~ | ~~**An arrow-`const` HOF's declared parameter type does NOT pin a function value, while a `function`-declaration HOF's does**~~ | `emit_mono.vl` — `monoWalk`'s argument-coercion loop read the callee's parameters through the flat name→slot map; an arrow lambda parses to a NAMELESS `FuncDecl` (`parseArrowLambda`) whose name lives on the BINDING | **SHIPPED. Two resolvers, one question**: five lines below the coercion loop, `monoWalk` already resolved that same callee through `identClosureFeSid` — so an arrow receiver presented NO parameter list, `monoFnParamTypeAt` answered -1 for every position, the declared type never reached `monoCoerceFnValue`, and the value floor refused the value. `monoFnFeOfIdent` is now the ONE resolver (scope walk for a name a `FuncDecl` carries, binding walk for a lambda a binding names), used by the argument coercion AND by `monoCoerceFnValueName`'s `Ident` arm. Second seam found by gridding: a BARE-EXPRESSION body (`const mk = (): (i32,i32) => i32 => padd`) has no `RetStmt`, so the declared RETURN type reached the value nowhere — `monoWalkFnBody` coerces the body block, whose value is its LAST statement. **Grid 175 cells** (13 receiver forms × 7 value forms + 12 declaration sites × 7): **130 → 154 accepted, 0 regress**; check-clean-but-TRAPPING **1 → 0** (the `<T>` value through an arrow's implicit return was `vl check`-, `vl build`- and `wasm-tools validate`-clean and trapped); check-clean-invalid-wasm **0 → 0**; silently-wrong **0 → 0**. Soundness sub-grid 24/24 (12 must-reject all reject with a real ERROR, 12 mixed-type all byte-exact). Every one of the 24 newly accepted cells has its fully-annotated twin already accepting with identical output. Reject parity **0 verdict changes across 1,764 pre-existing corpus cases**, ignored unmoved at 7. **Measurement trap found and filed in the fixture**: the instance registry is keyed by function+signature, not call site, so a `function`-declaration receiver ANYWHERE in the module masks the arrow receiver's defect in either statement order — a shared value makes the arrow half pass on a compiler that cannot see an arrow receiver at all. `functions/generic-fn-value-arrow-{receiver,implicit-return}.vl`, `modules/arrow-hof-receiver/` (all three redden without the fix), `functions/error-generic-fn-value-arrow-receiver-mismatch.vl` (boundary pin — passes on master too) | **CLOSED** | — |
| — | **A GENERIC HOF's callback parameter typed in its OWN type parameter refuses every un-pinned value** — `function hof<T>(g: (T,T) => T, x: T, y: T)` takes a fully annotated value but loud-rejects an un-annotated one, a partially annotated one, a `<T>` one, an arrow-`const` one and an inline lambda | `emit_mono.vl` — the boundary is `(T,T) => T`, not a concrete function type, so `monoCoerceFnValue` has nothing to pin with; the T-binding would have to come from the OTHER arguments first | **OPEN, MEASURED: 5 of the 7 value forms, in the one receiver form of 13 that is generic** (25 cells of the 175 grid; the same generic HOF with a CONCRETE `(i32,i32) => i32` callback parameter is 7/7 clean). Loud rejects only — `emitProgram: monomorphize: unsupported argument type for 'g'` or the un-lowerable-`T` parameter message. No invalid-wasm and no wrong-output cell in the position | M | low |
| — | **An INLINE lambda literal is not pinned by a declared type it reaches through an IMPLICIT return or a UFCS receiver** — `const mk = (): (i32,i32) => i32 => (a, b) => a + b` and `((a, b) => a + b).hof(3, 4)` both `cannot infer a type for parameter 'a'` | CHECKER inference, not the emitter: the same lambda through `function mk(): (i32,i32) => i32 { return (a,b) => a+b }`, through a parameter, a `let` annotation, an array element and a struct field is 5/5 clean | **OPEN, MEASURED: 2 cells of the 175 grid**, unchanged by the E1a fix (the emitter never sees them). A loud check error on both sides | S | low |
| — | **A function type is not a legal map VALUE type** — `const m: map<string, (i32,i32) => i32> = …` is `unknown type 'map<string,(i32,i32)=>i32>'` for every value form | `tyname.vl` / the map value-rep ladder; the LIST element position (`((i32,i32) => i32)[]`) is 7/7 clean, so it is the map rep specifically | **OPEN, MEASURED: 7 of 7 cells in that declaration site** (the 7th differs only in reporting a redundant-annotation hint first). Loud reject, rep-adjacent | M | med — rep change |
| — | **The checker accepts a `<T>` function at a boundary that binds `T` TWO WAYS** — `function pairT<T>(a: T, b: T)` passed to a `(i32, string) => i32` parameter is `vl check`-clean and then `wasm trap: indirect call type mismatch` | `typecheck.vl genericFnAssignable`; surfaced while re-gridding E1 | **OPEN, UNFILED, pre-existing (measured on master).** E1's emit side now DECLINES this shape rather than materializing an instance one position contradicts, which preserves master's verdict; the emit-time value floor cannot upgrade it to a diagnostic, because the monomorphizer's PRUNE has already replaced the un-instantiated template with a no-arg stub by then (and an EXPORTED one is rejected earlier by the export-signature floor). So the fix belongs in the checker: an instantiation that binds one type parameter to two different types is not assignable | S–M | low — tightening |
| ~~**E2**~~ | ~~**Inferred i32 map key does not lower** — `m.set(1,"x")` errors while the annotated `{[i32]: string}` twin runs~~ | `typecheck.vl` — the index-write arm pinned `TyArray.aElem` and had no `TyMap` arm; and the unsupported-key gate read only the ANNOTATION | **SHIPPED, but the row AS WRITTEN is refuted: `m.set(1,"x")` on a bare `Map()` runs today** (#1359 closed it — `maps/infer-i32-keyed-value-kinds.vl` is literally that program). The live population is the OTHER write spelling and it is **key-BLIND**: `m[k] = v` did not pin the hole at all, so the string key was refused exactly as much as the i32 key. **Premise-drift claim: HALF held.** The dead constraint is real but it is in the EMITTER-facing gate, not the checker — an inferred key never met `mapKeyTySupported`, so `m.set(1.5,v)` passed `vl check` and died as `emitProgram: map key is not a string` while its annotated twin was a clean type error; `mapKeyTySupported` itself is still load-bearing and correct (the rep has two hashes). Grid **1,728 cells** (6 key types × 4 creations × 2 write spellings × 6 ops × 6 key origins), each twinned against its annotated oracle: **432 → 288** oracle-backed defect cells, **240** inferred programs newly accepted with stdout **byte-identical to an accepting annotated oracle 240/240**, **464** cells move from a codegen error to the actionable check error, **0** regress, **0** invalid-wasm and **0** silently-wrong-output cells found on either side, reject parity **0 of 251**. Pinned key = the BASE type (`m[1]=…` → `i32`, `m["a"]=…` → `string`), matching `.set`. `maps/infer-from-index-write.vl`, `error-infer-unsupported-key.vl`, `error-infer-index-write-conflict.vl`, `sets/error-infer-add-unsupported-key.vl` | **CLOSED** | — |
| ~~—~~ | ~~**An inferred `Map()` does not lower in TWO composition positions**~~ | EMITTER shape ladder, not the checker. THE SUSPECTED MECHANISM WAS HALF RIGHT: `mapShapeOfExpr`'s `Call` arm does short-circuit, but `fnRetMapShapeSid` already had an un-annotated fall-back — the real cause is one layer down, `mapRetExprShape`, whose EVERY rung reads a SPELLING (a param / `let` / return annotation) and an inferred map has none. It is the ONE chokepoint the functype RESULT valtype, the `return Map()` constructor seed and the caller's receiver shape all read, so the three disagreed together. The literal half was as filed: `anonFieldCode` had no map arm, which un-interns the WHOLE shape | **SHIPPED.** Grid re-derived on extended axes — **220 oracle-backed cells** (10 map positions × 5 value reps × 2 key reps × 2 write spellings, + `Set()` in each position), every cell's annotated twin clean on all three compilers. Correct **21 pre-E2 → 37 at E2 → 176 now**; **139 cells fixed, 0 regress**; all **176/176 emit a BYTE-IDENTICAL module** to their annotated twin. **The filed "both are LOUD rejects" is REFUTED**: `vl check`-clean INVALID WASM was **19 pre-E2 → 36 at E2 → 0 now** (the arrow-const factory, the returned inferred LOCAL, and two call hops — axes E2's grid did not carry). Silently-wrong output **0** throughout. Of E2's diagnostic regression, **34/34 cells on this grid now build and run**. Two follow-ons found the same way: an i32-keyed `Set()` crossing a boundary answered the string-keyed mono, and two same-fieldset literals over different map types collapsed onto one interned shape. `maps/infer-through-call-return.vl`, `maps/infer-in-object-literal-field.vl` | **CLOSED** | — |
| ~~—~~ | ~~**A LIST of inferred maps does not lower**~~ | THE THREE `arrLit*` CLASSIFIERS, which are three readings of one question and had an arm for every element rep EXCEPT map. A `Map()` element is no object literal, no nested literal and no lambda, so every first-element probe missed it and the literal fell to the i32 list, where `emitArr`'s guard refuses a map-struct ref. `nodeArrayElemName` had no `TyMap` arm either, and its emit render `{[K]:V}` is character-for-character the synthetic name `parseType` builds for the annotated spelling — so one row serves both. **NOT `mapRetExprShape`'s chokepoint**: same SHAPE of defect (a missing map arm in a per-rep ladder), different function | **SHIPPED.** Population re-derived on 15 positions × 5 value reps × 2 key reps × 2 write spellings + `Set()` in each = **330 oracle-backed cells** (the 220 of #1411 as a subset, reproduced exactly). The filed 22 is the LOWER BOUND: the ref-list element family is **55 cells** — `[Map()]` 22, `[mk()]` (a map returned from a function and stored in a list) 22, `[[Map()]]`'s string-key half 11. **44 of the 55 now run**, all byte-identical to their annotated twin. The remaining 11 advance to `nested arrays are not supported`, which is **map-INDEPENDENT and pre-existing** — `const xs = [[{v:1}]]` fails identically, filed below. `arrLitMapElemName` is the single source of truth. `maps/infer-in-list-element.vl` | **CLOSED** | — |
| — | **An ANNOTATED list-of-i32-keyed-maps INSIDE an anonymous field emits invalid wasm** — `const s: {m: {[i32]: f64}[]} = { m: [Map()] }` is `vl check`-clean and then `Invalid input WebAssembly code … type mismatch: expected (ref $type), found i32` | the field ROW records a map's VALUE name with the KEY erased (`sFieldElemName` holds `V`, not `{[K]: V}`), the exact residue `i32MapSpellingLowerable`'s header already names as needing a key column on both field tables — reached here through a LIST-typed field, one level further out than that header's case | **OPEN, UNFILED, PRE-EXISTING** (identical on `61f60b35`). **WORST CLASS, 6 cells** of the 330-cell position grid (`f64`/`i64`/`string` values × 2 write spellings); the `boolean`/`i32` values of the same shape are a loud `i32-keyed map but its map struct was not collected` (5 more). The STRING-keyed twin of the same spelling runs, which is what says it is the key column | S–M | med — two field tables gain a column |
| — | **An inferred NESTED ref list does not lower** — `const xs = [[Map()]]` + a write through `xs[0][0]` ⇒ `emitProgram: nested arrays are not supported`, while the annotated `{[string]: V}[][]` twin runs | `arrLitIsRef`'s nested-literal rung claims a literal whose INNER literal is scalar-leafed (kind 4/6/7/8) and deliberately leaves a REF inner literal to the annotation-driven `pendingListKind`/slot path (kind 9), which an inferred binding never threads | **OPEN, UNFILED. MAP-INDEPENDENT and pre-existing** — `const xs = [[{v:1}]]` fails identically on `61f60b35` and today, which is what makes it a general inferred-nested-ref-list gap rather than a map one. **MEASURED: 11 oracle-backed cells** on the position grid (the string-key half; the i32-key half has NO oracle, see the row below). A LOUD reject throughout — no invalid-wasm and no wrong-output cell | M | low |
| — | **An anonymous literal field holding a ref LIST does not lower** — `const s = { m: [Map()] }` ⇒ `emitProgram: ref valtype with no interned shape`, while the annotated `{m: {[string]: V}[]}` twin runs | `anonFieldCode` gained a MAP arm in #1411 (code 19) but has none for a field whose value is a LIST of refs, so the whole literal stays un-interned exactly as the map field did | **OPEN, UNFILED. MAP-INDEPENDENT and pre-existing** — `const s = { m: [{v:1}] }` fails identically on `61f60b35`. **MEASURED: 11 oracle-backed cells** on the position grid. A LOUD reject; the same shape of fix as #1411's map arm, one code further | S–M | low |
| — | **An ANNOTATED `{[i32]: V}[][]` is a loud reject** — `emitProgram: an i32-keyed Map/Set is supported as a binding / parameter / return / \`\| null\` / an ARRAY ELEMENT / a closure result / a map value — not inside '{[i32]:f64}[][]'` | `i32MapSpellingLowerable`'s position list has an ARRAY ELEMENT but not a NESTED array element; the string-keyed `{[string]: V}[][]` spelling runs | **OPEN, UNFILED, PRE-EXISTING. 11 cells with NO oracle** on the position grid — which is why the inferred `[[Map()]]` row above measures only its string-key half. Loud reject only | S | low |
| — | **Two anonymous literals with the same field-name SET but different field TYPES emit invalid wasm** — `const a = { v: 1 }` beside `const b = { v: "s" }` is `vl check`-clean and then `failed to parse WebAssembly module: type mismatch: expected i32, found (ref $type)` | `collectAnonShapes` interns one shape per field-name set and `structIndexOfObjCtxGo` matches by NAME, so the second literal builds against the first's rep. The float / i64 / map axes each discriminate; the string-vs-i32 axis does not | **OPEN, UNFILED. Pre-existing and map-INDEPENDENT** — reproduces identically on pre-E2 (`92b5dcfc`), on E2's tip and after this slice. Found while closing the map axis of exactly this collapse, which is the shape of the fix: one more discriminator beside the three that exist. WORST CLASS (`vl check`-clean invalid wasm), narrow population | S | low |
| ~~—~~ | ~~**An inferred `Map()` is not pinned by a write through a PARAMETER**~~ | THREE per-rep ladders, each already carrying every collection rep but map. (a) the hole RECEIVER of a method call is constrained to an ARRAY by `holeArrMethod` (`.map`/`.filter`/`.push`/`.pop`) whose own header names the map surface as its dual — the dual did not exist, so `q.set(k,v)` grew a `{set: any}` STRUCT shape and the call reported `expected {set: _}, got {[string]: i32}`, naming a method the argument has; (b) the hole receiver of an INDEX assumed an array for EVERY index, so `q["a"]=v` was `array index must be i32, got string` — an array is i32-indexed, so a non-i32 index can only be a map; (c) `emit_mono.monoArgTyName`, the monomorphizer's PIN NAME, listed string, five list reps, union, struct and four scalars and fell to the `"i32"` default for a map. **Filed CHECKER-side; the checker was two thirds of it** | **SHIPPED, 17 of 22.** `holeMapDemandTy` mints one open `{[?]: ?}` per hole whose key/value the callee's own operations pin in place (as `.push` pins an empty `[]`), and `holeDemandOk` pins the ARGUMENT from it — which is what clears the `cannot infer` floor. 17/17 byte-identical to their annotated twin. The 5 that remain are exactly the `q[1]` spelling and they are **a design escalation, not a miss**: an i32 index fits `i32[]` and `{[i32]: V}` alike and only the ARGUMENT decides, which is backward flow (E5). Two FLOORS ship with it, both measured rather than assumed: a demand the body left OPEN (a read-only callee) is refused — accepting it produced **10 wasm traps and 1 silently-wrong output** — and an i32-indexed hole refuses a map argument, which otherwise printed a `boolean` map value through the array reading's i32 formatter. `maps/infer-through-param-write.vl`, `maps/error-infer-param-map-not-pinned.vl`, `maps/error-infer-param-i32-index-ambiguous.vl` | **CLOSED (5 cells escalate to E5)** | — |
| **E3** | **`never` for divergent recursion** + an `unconditional-recursion` lint that fires even when the return IS annotated | ROADMAP `:851` | OPEN (current message is a stopgap) | (a) M (b) S | low |
| **E4** | **A13 — operators over holes defer concretization to the call site**, which re-validates under substitution (`binOpDefinedFor`) | `arith-hole-operand-reject.vl`, `equality-hole-operand-reject.vl` | **CLOSED for the binary operators.** The equality arm was the last cell — it returned true for every pair, so `cmp(1,"x")` over `a == b` checked clean and emitted invalid wasm. REMAINING under A13: the *stored-closure* operator case (`vec + vec` via a `"+"` field), blocked on B13 | — | — |
| **E5** | **Return-context inference** — inference flows only forward | `return-context-inference-design.md` | **DESIGN ONLY.** The hard part is the join across `is`-guard arms | L | med-high |
| ~~**E6**~~ | ~~**ONE annotation makes a valid string comparison unwritable** — `function f(a, b: string) { a < b }` called `f("a","b")` is REJECTED *"comparison expects numeric operands, got any and string"*, while the fully un-annotated twin ACCEPTS and prints `true`~~ | `typecheck.vl` — the string-ordering fast path needed `isStringTy` on BOTH sides, so a hole on either side fell to `isNumeric`, which refuses. The hole/hole case defers to A13's call-site re-validation and never reached this arm | **SHIPPED. The filing said 8 of 28; the true population is 24** — the four ordering ops × the two HALF-annotated directions × **three** string-typed spellings (`string`, a string LITERAL type, a string literal UNION — the last two reach the arm through `softenLitTy`, which the filing's `string`-only grid never exercised). All 24 have bare AND fully-annotated twins that accept and print the same value. Fixed by DEFERRING a concrete-string-vs-hole ordering to A13's existing call-site adjudication (`noteBinCstr` → `validateBinCstrs` → `binOpDefinedFor`, whose ordering rule already admits exactly `string`/`string` and numeric/numeric) — the ordering twin of the deferral `+` already makes for `s + h`. **Newly accepted = exactly those 24 plus the same shape reached through a lambda / a nested generic / a `let` init / a loop condition / an uncalled body; every one has an accepting fully-annotated twin, so parity is exact and no non-parity program was admitted.** Reject-parity measured: **0 of 237 corpus `@error` cases changed verdict**; a non-string binding of the hole (i32, f64, boolean, list, object, `null`, `string?`, and through two generic hops) still rejects — now at the call site, naming the ARGUMENT types instead of the hole, which removes an `any` rendering rather than adding one (E7 unaffected; its 5 pins hold). `soundness/ordering-hole-string-operand-{sound,reject}.vl` | **CLOSED** | — |
| — | **`+` over a string LITERAL type is broken in ALL THREE annotated spellings** — surfaced while re-gridding E6 | same arm's `+` tail: `binOpType`'s concat test is `isStringTy(lt) \|\| isStringTy(rt)`, which is FALSE for a `TyLit`, and unlike the ordering arm the `+` path never applies `softenLitTy` | **OPEN, UNFILED, MEASURED HERE: 6 cells.** `function f(a: "a", b: "a") { a + b }` is rejected *"operator '+' is not defined for string and string"* — a message that names two types it then refuses to add. Same for `"a" \| "b"`, and for both half-annotated directions of each. The BARE spelling accepts, so this is the same annotation-removes-a-capability shape as E6 but a **different arm**, and it is NOT E6-parity work: the fully-annotated twin rejects too, so E6's parity argument says leave it, and closing it needs its own owner ruling on whether `+` should soften | S | med — loosening |
| ~~**E7**~~ | ~~**The checker renders an inference HOLE as `any` in user-visible diagnostics** — *"got any and string"*, *"cannot assign (any, any) -> any"*~~ | `typecheck.vl` — ONE line, `tyToStr`'s `TyVar` arm: a `?fn.N` internal name rendered `any` | **SHIPPED as `_`. The filed count of 5 pinned files is EXACT** — measured over the corpus, 5 of the **239** files that produce any diagnostic (of 1,689 scanned) render a hole, and they are exactly the 5 filed, in **7** messages across **2** templates. **The board's other premise is a measured NEGATIVE: hole and error-type were never conflated** — `tyToStr` already spells `TyErr` `<error>`, no-arena-entry `<none>`, an unhandled arm `<?>`, the depth cap `…`, and those markers appear on a DISJOINT 3 files. The producer is a single site; the *upper bound* on affected messages is the **92 of 196** diagnostic call sites in `typecheck.vl` that interpolate `tyToStr`, of which 4 templates are probe-reachable with a hole (`comparison expects numeric operands…`, `operator '…' is not defined for…`, `argument N: expected…, got…`, `cannot assign…`). `_` chosen by elimination from ROADMAP B17's own shortlist: `?` collides with the nullable suffix the SAME renderer emits (`{bar: ?}` vs `{bar: T?}`), `<hole>` wears the angle-bracket shape reserved for ABSENCE while a hole is PRESENT (and would invite adding it to the LSP's `ABSENT_TYPE_MARKERS`, deleting informative hints from correct code), and every bareword (`unknown`, `unsolved`) repeats `any`'s category error — `unknown` worst of all, being a real TypeScript type name. A restructured sentence cannot generalize: the hole nests inside composites (`(_, _) -> _`), where only a compact token fits. `soundness/hole-renders-as-blank-reject.vl` | **CLOSED** | — |
| **E8** | **Internal absence markers leak into CLI diagnostics** — `<none>` and `<error>` reach users on the diagnostic channel; the LSP's `ABSENT_TYPE_MARKERS` filter guards EDITOR surfaces only | `typecheck.vl` `tyToStr`; LSP filter in `tests/lsp_undisplayable_type_test.ts` | **MEASURED, 3 named files of 240 diagnostic-producing**: `soundness/hole-is-guard-return-join-reject.vl` → *"expected string, got `<none>[]`"*; `sets/error-add-non-boolean-value.vl` → *"unknown property 'add' on `{[<none>]: <none>}`"*; `types/unknown-type-in-map-value.vl`. Surfaced BY E7's census and explicitly out of its scope — E7 measured that hole and error type were never conflated, so this is the *third* marker class, not a regression of that fix | OPEN, live | S | low |

### 3c. Performance — compile time

Standing baseline: `__str_eq__` **25.19% self**; the whole string layer **33.6%**;
self-compile 1,950 ms / 510.8 MB. The `__str_eq__` split is **19.10% identifiers vs
6.08% type names** — which is why *destringify is a correctness programme, not a
speed one*: the profile has not moved across slices since `8d2471e`.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **F1** | **Checker scope chain** — sid-indexed cell + undo log | `perf-program.md §9.7` | **2.83% self**; phase 3 gave **−4.5%** and 2,466,975 → 479,079 probes | **BLOCKED on coverage** | M | med-high — deleting the chain deletes the self-compile's only exerciser of two emitter arms. **Build `tests/cases` coverage FIRST** |
| **F2** | ~~**TOKKIND enumeration** — `kind: string` → i32 code~~ — **SHIPPED, and NOT as a 570-site rewrite. The vocabulary IS a literal union**: `type TokKind = "IDENT" \| …`, whose values the emitter already represents as i32 ATOMS. `Tok.kind: TokKind` makes every one of the ~570 sites an `i32.eq` **with the source text unchanged** — they were already spelled as the union's members. Effort was S, not L | `perf-program.md §10.9` | census re-derived: **561 sites over 8 files** (not 570/7 — 4 of `parser.vl`'s and 4 of `lexer.vl`'s are in COMMENTS, and `fuzzgen.vl`'s 2 are `"NULL"` in generated program TEXT); **44 `.kind` READS** (not 47 — 49 occurrences, 5 of them in comments) over 5 WRITE sites plus the lexer's 84 producers; `tok.kind` crossing the boundary **REFUTED as a value, CONFIRMED as a spelling** — it reaches the host inside `expected …` diagnostic TEXT. Cost re-derived at **1.68%** of a self-compile (structural attribution, 8 interleaved guest profiles/leg). Measured after: `vl build` **−1.76%** median (−1.09…−2.35), `vl check` **−9.4%** (−8.4…−10.4), `vl fmt` **−5.1%** (−3.4…−6.8), floor control flat; `__str_eq__` from `parser.vl` **−84%**, `parseProgram` inclusive **−33%**; 2,815 → 2,385 `call $__str_eq__` sites; seed **+1,721 bytes** | **DONE** | S | low — the checker is a COMPLETE ORACLE (a non-member spelling is a hard type error) and the string is minted from the atom by ONE renderer |
| **F3** | **`modRenamed` sid-index** | `perf-program.md §16` | re-derived 1.80% self / **3.94% inclusive**, plus a SECOND reader (`modRwTsName`, 1.89% incl) the row never named; the merge rewrite **−81.3%**, 12.3M compares → 96K probes | **DONE** | M | med |
| **F4** | ~~**`fnStmtsPosOf` index at the writers**~~ — **no index was built**: 80.3% of its calls ask for the function `emitCodeSection` is lowering, and the rest are classifiers whose callers already spell `fnStmts[fe]` | `perf-program.md §17` | re-derived **3.09% self → 0.01%**; a 1,600-frame ladder **48.9% → 3.7% self, −49.8%** of the compile | **DONE** | S | low |
| **F5** | **`modScan` re-scan + `coalesceMixOp`** | `driver.vl:1798`, `parser.vl:1232` | 7.0 + 1.1 samples/run | OPEN, sized | S–M | low |
| **F6** | ~~**`vl check` allocates MORE than `vl build`**~~ — **the gap is GONE and its SIGN is inverted**; the filed number was not a RUSAGE artifact, it described an engine that was replaced four days later (`36eb2e15` gave `cli_pump` a collecting collector, for an unrelated correctness reason). "The LSP's own path" was also wrong — `lsp/src/wasmChecker.ts` instantiates the seed in V8 and never touches the Rust host | `perf-program.md §18` | re-derived **282.8 MB vs 504.6 MB — check is 56% of build, −221.8 MB**. The ALLOCATION excess is real and untouched (`VL_PUMP_GC=null` → 680.0 MB, **+175 MB**), it is just no longer resident | **DONE** (measured negative) | S | none |
| **F6b** | ~~**the `.cwasm` cache key omits the ENGINE CONFIG**~~ — every cache path now carries an engine tag (wasmtime's own `precompile_compatibility_hash`), so `check`/`fmt`/`test` and `build`/`run` hold SEPARATE sidecars and both stay warm. Distinct paths, not a discriminant inside one file: a discriminant makes a mismatch a miss, and alternating would still recompile every time. The embedded seed's `seed-<VL_SEED_KEY>-<engine tag>.cwasm` is keyed the same way, and `prune_seed_cache` counts SEEDS rather than files so a two-configuration workload cannot evict a live one | `perf-program.md §18.2`, `main.rs` `engine_cache_tag` | one-line program, same box: alternating `check`/`build` **1,853 ms → 6 ms**; the two sidecars (10,596,480 B null-collector / 10,719,368 B pump) now coexist instead of overwriting each other | **DONE** | S | low |

### 3d. Performance — runtime

`perf-landscape.md`'s §1/§3/§4/§6/§7 **now carry the `1d3a8559` sweep alongside the
08-02 tables**, each moved row marked. Current distribution is **16 WIN / 15 PAR /
7 LOSS / 7 PRIORITY-LOSS**; median `vl/deno` **1.00** (was 1.04), median `vl/rust`
**2.29×** (was 2.49×). Quote `bench/results/summary.md`, which labels itself
**PRELIMINARY** — it re-ranks the landscape, it does not settle it.

**The loss COUNT is 14 on both sweeps.** The PRIORITY tier went 9 → 7;
`dispatch-table` (3.34 → 1.00) and `mutual` (2.37 → 1.22) left the loss list,
`map-i32` and `nbody` slid in across the 1.25 threshold. **Not one Python red alert
cleared** — six rows carried the flag on 08-02 and the same six carry it now, which
is the standing argument for G1/G3.

| id | item | measured | status | eff | risk |
|---|---|---|---|---|---|
| **G1** | **P7b — cache a string's hash** (the landscape splits **P7a** shipped / **P7b**) | **RE-PRICED: an ideal zero-cost cache is 1.88× at ~97-char keys, 1.33× at ~33, and 1.00× — nothing — at ~9.** The filed 4.6× was `long-key / short-key` and charged the whole length slope to the hash; measured, only **0.82 of 1.31 ns per code point** is the hash, the rest is `__str_eq__`. `__str_hash__` is **4.06%** of a self-compile (not 4.75%), so the compile-time ceiling is 1.042× | **DESIGN ESCALATION, not started.** "Clears 3 of 4 Python red alerts" is refuted by construction — all four §4.6 benchmarks key on ≤9-char strings, where the ceiling is 1.00×. Site now pinned: `string` IS `aTypeIdx`, and a side table is impossible (WasmGC has `ref.eq` and no reference→integer), so the only homes are a struct wrapper or an in-array header — both rep changes, subsumed by G3/P12. **What the re-pricing DID find and ship**: a map insert hashed its key twice — `map-string` **1.09×**, `set-ops` **1.07×**, insert-dominated **1.55×** long-key / **1.14×** short. `perf-program.md §19` | L/XL | med-high |
| ~~**G2**~~ | ~~**P2 follow-on (a)** — hoist the closure unpack out of loops~~ | **re-derived 1.12×**, not 10.6× | **CLOSED, measured, not taken.** The 10.6× was the FUNCREF libcall, which P2 (#1326) already deleted — the ladder row and the shipped row are one saving counted twice. Residual is two ordinary field loads, **0.26 ns/call** measured against 0.29 predicted; `wasm-opt -O` already does the hoist wherever the closure is scalar-replaceable, and the `.map` variant is inside the noise floor. `perf-program.md §13.7` | M | low |
| **G3** | **P12 — UTF-8 bytes for `string`** | **27.7×** on the compare; VL's `string` is 4 bytes/code point | OPEN | XL | high — `memory-gc-design.md §2.2` argues 4× denser but strictly *less* scannable under WasmGC |
| **G4** | **P13 — linear-memory backing for scalar arrays** | **3.41×** on matmul's kernel | OPEN | XL | high |
| ~~**G5**~~ | ~~**P10 — `const` → immutable global**~~ | **the fold happens WITHOUT it** — binaryen deletes the `(mut i32)` cell and inlines the bound anyway | **CLOSED, measured, not taken.** The mutability bit carries no information binaryen does not already derive: `simplify-globals` reads "no `global.set` anywhere" off the whole module — and VL exports functions and `memory`, never a global, so that view is always complete. Mutable-vs-immutable inputs optimize to **byte-identical** modules at `-O` and `-O3`; at the default rung the CPU A/B on a pair differing in that ONE byte is a wash. `perf-program.md §12.10` | XS | low |
| **G6** | **P6 — fuse `a/b` and `a%b`** | **1.99×** | **BLOCKED on a sign/edge grid** — `rem_s(INT32_MIN,-1)` returns 0 while `div_s` **traps** | S + grid | high as filed |

**REFUTED — do not re-file.** P4b BMH (refuted on three of its own numbers: table
build is 295 ns not 88; the gate is wrong; at its own 3.13× it still loses to
CPython by 1.43×; and `array.fill` has no emitter at all). P11 (**ruled upstream
#1325**; bare `wasm-opt -O` carries `mixed-width` identically). P9 (5.6% at the
default rung, **exactly zero at `-O` and above**; two supporting claims refuted
in-file). `flat` records as a compiler perf lever (targets the wrong half). **G2**
(the closure-unpack loop hoist: filed at 10.6×, re-derived at **1.12× / 0.26 ns per
call**, because the 10.6× was P2's own funcref libcall read a second time —
`perf-program.md §13.7`). **P10** (`const` → immutable global: the fold it was
filed to enable already happens on the MUTABLE cell, because binaryen infers
immutability from the absence of writes and VL never exports a global —
`perf-program.md §12.10`).

### 3e. Hygiene

| id | item | status |
|---|---|---|
| **H1** | **F5 — settle VL vs Vital** | OPEN, real. ~13 live sites; `lsp/package.json` `displayName` is a published surface |
| **H2** | **F9 — perf regression gate vs the NATIVE binary** | OPEN. Design below |
| **H3** | **F-tiers residue** | OPEN, **row RE-SCOPED in `ROADMAP.md`**. `SELFHOST_DENO_RUN` is gone; the residue is **four** tests executing emitted wasm under V8 via `tests/support/runWasm.ts` — `cases_wasm_test.ts` (the sole behavioral corpus oracle; must be re-hosted, not deleted) + `vl_exported_memory` / `vl_global_promotion` / `vl_reexport_abi` |
| ~~**H4**~~ | ~~**Close F4 / F6 / F7 / F9b**~~ | **DONE.** All four closed in `ROADMAP.md` with their evidence: F7's only `paramater` was the filing row; F4 and F9b are moot together (no compile path builds binaryen IR — and `vl build` already runs wasmtime's `Module::validate`, gated by `tests/vl_build_validate_test.ts`); root `deno.json` has no `build` task, and AGENTS.md documents the build |
| ~~**H5**~~ | ~~**Doc corrections**~~ | **DONE.** `perf-landscape.md` §1/§3/§4/§6/§7 re-derived against the 08-03 sweep with the 08-02 tables kept and marked superseded (and §5's P1/P2 rows, still filed as open, closed with their measured-vs-filed deltas); P7 split into **P7a** shipped 1.135x / **P7b** cache open, with a new `perf-program.md` §15; `A-infer-null` and `A-infer-empty` closed as shipped. **One find:** the `A-infer-empty` residue is NOT the surveyed "inferred i32 key" — the key is fine and the VALUE type is the axis, filed as the new **`A-infer-map-value`** row |
| ~~**H6**~~ | ~~**The corpus lint ORACLE was blind to a diagnostic class the CLI emits**~~ | **CLOSED — harness defect (a), not a native-vs-wasm divergence.** `vl check` runs `compiler/cli.vl` INSIDE the same `build/vl-compiler.wasm` the harness instantiates, so both sides are one artifact; the CLI folds THREE streams (checker errors + the parse-only `lintSrc` + the type-informed `redun*`) and `assertLint` read only the second. **Denominators:** 1,762 corpus cases discovered → 7 skipped, 58 multi-file, 285 error-tier, **1,412 reach `assertLint`** — and all 1,412 are strict-in-both-directions, so all 1,412 were asserting the ABSENCE of a class they could not observe. **637 of those 1,412 (45.1%) carry 1,831 real `redundant type annotation` hints the oracle reported as `[]`**, now declared as 1,754 `@hint` directives (67 exact duplicates folded). Severity coverage is otherwise COMPLETE: the lint stream's `hint`/`warning`/`info` are all observed on the live corpus (414 / 63 / 3 findings) and `error` is the `@error` tier — `redun*` was the ONE unobserved path. **Sabotage witness** (`recordRedundantAnnot` returns early, seed rebuilt, restored from a saved artifact): old oracle **1,756 passed / 0 failed** — fully blind; new oracle **1,327 passed / 429 failed**. The 429 (not 637) is the `let` rule alone; `recordRedundantRet` was left live. **Residue, measured not assumed:** 734 cases now declare a lint directive, 718 adjudicated and **16 still vacuous** — 9 error-tier + 1 multi-file + 6 `EXPECTED_DIVERGENCES`, each a bucket the lint tier documents itself as skipping. The LSP's `unusedExportHints` is a fourth hint stream, but it lives in `lsp/src` and `vl check` never emits it, so it is outside CLI↔oracle parity |

---

## Definition of done

From `docs/internals/agent-playbook.md`, which is the authority.

**Every item:** branch → agent works in a worktree and COMMITS but does **not** push
or open a PR → orchestrator integrates, pushes, opens the PR → CI green on all three
checks → merge → **delete the branch and the worktree**.

**Any `compiler/*.vl` change additionally:**

- `scripts/refresh-compiler.sh` after **every** edit — and check `rc` explicitly,
  because its failure tail reads like success.
- **The seed ladder has TWO legs.** A self-built seed only proves it matches its own
  source. CI bootstraps from published `seed-latest`, which is MASTER's compiler, so
  before opening the PR: save the seed, `fetch-seed.sh`, `refresh-compiler.sh
  --prove-fixpoint`. A failure here with a passing self-built ladder is a
  **bootstrap-ordering** problem, not a defect — split the change.
- `REJECT_CASES` must still reject if the checker got more permissive.
- Adding a corpus case ⇒ run `deno test -A tests/cases_wasm_test.ts` and register any
  divergence in `EXPECTED_DIVERGENCES` **in the same PR**, or master goes red on merge.
- Read the **ignored COUNT** before the pass count: the six `vl build -O` tests
  self-ignore silently when `wasm-opt` is missing.
- New `is <Node>` narrowing or a new `ast.vl` helper ⇒ add it to the import list in
  `tests/selfhost_wasm_emit_test.ts` and run it.

**Comments:** state, never diff. No dates, no PR numbers, no "was X" / "now does".
History belongs in git and in the design docs.

**Measurement:** one file per worker in any parallel sweep (a `>>` above `PIPE_BUF`
tears and silently invents or drops records). Probe records need a sequence number —
`tErr` dedupes exact repeats, which silently turns a count into a distinct-value set.

---

## H2 / F9 — the perf regression gate, in two phases

**What exists.** `bench/run.sh` answers *"where does VL sit against Rust, deno and
CPython"* — 46 benchmarks, four runtimes, stdout verified per case, `taskset`
pinning, a noise-floor probe. Its per-case `meta.json` audits are adversarial about
their own numbers (`arith/i32-accum` records that `rustc -O` auto-vectorises the
loop to SSE2 and that the honest scalar gap is ~1.4x against a 5.4x headline).
CI separately carries DETERMINISTIC pins — `MELT_TABLE` and the loop-shape rows
(`loops, rotated, carried`) in `tests/selfhost_native_release_test.ts`.

**What is missing is a GATE, not another harness.** Nothing catches a regression at
PR time, and the cost of that is already on the record: three perf documents drifted
to numbers stale by up to 4.3x, and the filed-vs-shipped P7 split survived unnoticed,
because nothing re-measured.

**The constraint that decides the design.** `bench/README.md` records this box
swinging **up to 2.5x under contention even with `taskset`**, and the sweep labels
itself PRELIMINARY. A wall-clock gate therefore cannot separate a regression from a
busy runner — the identical ambiguity that made the `vl test` parallelism ratio
unusable. Whatever gates in CI must be contention-proof.

### Phase 1 — extend the deterministic pins (no timing at all) — DONE

`MELT_TABLE`'s pattern already gates emitted-code SIZE and LOOP SHAPE per optimizer
rung, and cannot flake because it measures the artifact, not the machine. Extended
across the hot benchmark shapes as `SHAPE_TABLE` in
`tests/selfhost_native_release_test.ts`: 13 rows, one per `bench/<cat>/<name>/main.vl`
— the same sources `bench/run.sh` times — graded at `-O` and `-O3` on module bytes
(banded, `max(3%, 16B)`) plus exact counts of functions, allocation sites,
`call_indirect`, and, where they are the axis, `return_call` and `ref.eq`. Covers
closure dispatch (`lambda-hot`, `map-filter-reduce`, with `dispatch-table` as the
must-stay-indirect control), tail calls (`tailcall`, `mutual`), string equality and
hashing (`str-eq`, `map-string`, `word-freq`), map probes (`map-string`, `map-i32`),
array/struct element access (`fill-sum`, `binsearch`, `struct-aos`) and the tight
scalar loop (`mixed-width`). Union boxing was already the densest area of
`MELT_TABLE` and got no new rows.

Two design points that are load-bearing if this is ever revised:

- **The new rows skip the `none` rung on purpose.** Every counter is module-wide, and
  an unoptimized module carries helpers the program never calls — `LOOP_TABLE`'s
  `none` row has fired twice on exactly that wrong axis (`__str_eq__`'s unroll, then
  `__str_hash__`'s). `-O`/`-O3` run DCE, so at those rungs a module-wide count is a
  reachability-scoped count. VL's own emission is still graded: the optimizer inlines
  VL's output, so extra emitted work lands in the optimized columns.
- **Bytes are banded, not exact.** An exact byte golden on 13 modules reddens on
  instruction-selection noise and then gets muted, which is worse than no pin.

Bounds worth stating: a shape pin cannot see a regression that keeps the loop shape
and adds work per iteration. It is the reliable half, not the whole answer. The one
row where the byte band is fine-grained enough to notice added per-iteration work is
`arith/mixed-width` (203 bytes, one loop, no allocation).

### Phase 2 — a CPU-time baseline

`scripts/p7-time.sh` is the primitive: interleaved min+median of **user+sys CPU
milliseconds**, with stdout equality asserted across modules before any timing.

CPU time is the load-bearing choice. Measured on this box at **load average ~100**
(four compile-heavy agents running), one module over 2 reps:

```
cpu_min=1906ms  cpu_med=1906ms  wall_min=2384ms  cpu=[1926 1906]
```

**1% spread on CPU time while wall clock carried the contention.** That is the
property a gate needs. Interleaving modules within a rep spreads any residual drift
across both sides of an A/B rather than one.

Sequence phase 1 first: it is cheaper, cannot flake, and its failures are exact.

---

## Band 3f — recovered from the stale-branch triage (2026-08-16)

The repo carried **30 local + 11 remote** non-master branches, 289–1381 commits behind.
All are now deleted; **`git branch --no-merged` was a false-positive machine** because this
repo squash-merges, so 17 of them had already landed. Every branch was triaged against
GitHub PR state and, where a defect was claimed, against a live repro. **None was
finishable as code** — a branch 800 commits behind a moving compiler is an idea, not a
patch — so what was worth keeping is recorded here and the branches are gone.

| id | item | provenance | evidence | status | eff |
|---|---|---|---|---|---|
| **S1** | **`std/testing.vl`** — a general-purpose VL test framework (`describe`/`it`/`expect`/`assert*`) | PR **#313** was closed *specifically because* this was the intended direction instead of a bespoke Rust directive-scraper | **`std/testing.vl` does not exist, and the direction appears nowhere in `workboard.md` or `ROADMAP.md`.** The reason for closing #313 was recorded only in that PR's body, so the successor was never filed | OPEN, **unfiled gap** | L |
| **S2** | **A guarded `UPDATE_GOLDENS` re-pin mode for the emit fixpoint** | branch `claude/maps-rep-align-host` (2026-06-11, 1 file) | **`UPDATE_GOLDENS` appears nowhere in `tests/` or `scripts/`.** Real ergonomics value: golden/shape tables moved in six PRs this cycle and each was re-pinned by hand | OPEN | S |
| **S3** | **LSP interactive hover-verbosity stepping (3.18)** | PR **#84**, closed 2026-06-06 | **STILL BLOCKED, and the blocker is exact**: it needs LSP protocol 3.18, and `package.json` pins `vscode-languageserver: ^9.0.1` = protocol 3.17.5. Re-check when that dependency ships a 3.18-capable release | **BLOCKED on a dependency**, unblock condition recorded | M |
| **S4** | **D-REFARRKIND — the ref-array ladder's three hand-written copies** | branch `recovery-refarrkind` (2026-07-26) | Claimed *"three exported entry points over the same ref-array grammar"* in `emit_classify.vl` (81 mentions there today). **NOT re-derived** — whether the duplication survives is unmeasured. Serves the standing DRY preference | OPEN, **re-derive first** | M |
| **S5** | **Unify map-value ref-list interning via `ensureRefElem`** | branch `refactor/unify-map-value-reflists` (2026-06-24) | `ensureRefElem` spans 5 files / 37 mentions. **B6 (#1396) already shipped `ensureRefElemTy` in this exact area**, so this may be wholly or partly done. **NOT re-derived** | OPEN, **re-derive first**; may be closed by #1396 | S–M |
| **S6** | **VKind → litunion conversion (central-web)** | branch `refactor/c2-vkind-litunion`, an abandoned WIP that *did not compile* (~36 checker errors) | The idea is band-1 destringify, and **F2 (#1402) proved the pattern**: a closed vocabulary becomes `type X = "A" \| "B" \| …` and every comparison becomes `i32.eq` with the source text unchanged. Worth redoing from scratch on that template rather than reviving the WIP | OPEN | M |

**Verified-superseded and deleted, with the check that retired each:**

| branch / PR | retired by |
|---|---|
| `feat/hoist-lambda-bindings` #628 | repro now prints `7` / `hi!` / `4` — an un-annotated `const add = (a,b) => a+b` monomorphizes per call today |
| `feat/closure-union-return-factory` #651 | repro now prints `1` — the union-returning closure factory works |
| `kill-ts-p3-vl-check-dir-exclude` #433 | `vl check <dir>` walks a directory today and `--exclude` is accepted |
| `feat/rep-layer-fuzzer` #666 | **the rep fuzzer landed**: `scripts/rep-fuzz-check.sh` is a `ci-native` gate with a class-tagged baseline whose header forbids ever baselining a soundness class. The baseline is **14 lines, 13 of them comments — exactly ONE real pinned failure (a REJECT)**, i.e. effectively true zero |
| `destringify-program` | the `sTyIx[]` arena-index sidecar is on master (`emit_collect.vl:4400`, `emit_sections.vl:3086`, 6 files) |
| `claude/lsp-wasm-builtins` | `builtinCompletionsFromWasm` is live in `lsp/src/typeFeatures.ts`. The remaining TS imports in `lsp/` are the kill-TS programme's own residue, not this branch's |
| `lane2-formatter-vl` #369 | explicitly *"NOT for merge"* — the deliverable was a gap inventory, not code |
| `backup/destringify-typecheck-homes-preswquash` | a pre-squash backup; its D-PARENDOWN/D-ARRDOWN/D-SHAPEDOWN findings are in `destringify-types-program.md` (12 references) |
| `probe/tcscan` | its own commit says *"never shipped"* — probe instrumentation |
| 17 squash-merged branches | PR state MERGED; the squash is why `--no-merged` listed them |

**The lesson for this board:** #313 and #369 were both closed *with a reason worth keeping*, and in both cases the reason lived only in a PR body. A closed PR whose rationale points at future work should leave a row here, or the successor is lost with the branch.

## Retired by re-derivation on the tip, without spending an agent

The standing rule — **re-verify on the current tip and find the reaching shape with a working
control before briefing** — has now retired six queued rows for free. Each was filed with a real
cell count that a later PR closed as a side effect, so briefing it would have bought a report
saying "already works".

| filed row | filed as | retired by | what the tip actually does |
|---|---|---|---|
| the box for-in loop-var narrow defect | 8 cells, #1436 located the root | **#1437** (narrowing consolidation) | prints `1 / -1 / 2` correctly |
| `1 \| 2 \| null` with `if p != null` | 41 cells, #1438 measured `if p != null` alone failing on master | **#1439** (`nulNumLitUnionBaseName`) | `let p: 1\|2\|null = 2; if p != null` prints `2 / -1`; the NAMED `type N = 1\|2` spelling works too |
| `.map`/`.filter` over `i32[] \| null` | part of #1436's filed 140 | — | runs |
| `.map`/`.filter` over `boolean \| null` | part of the same 140 | — | runs |
| `.map`/`.filter` over `f64 \| null` | part of the same 140 | — | runs |
| a gap in #1438's `??` consumer positions | I raised it myself | **nothing — my probe was wrong** | the default I used was not a MEMBER of the litunion, which `coalesceLitUnionFits` correctly declines. With a member default all three consumer positions work |

The last row is the one worth keeping: **an ill-formed probe reads exactly like a defect.** The
recurring forms in this repo are `main` not being auto-invoked, `as` being numeric-only, `match`
arms needing `=>`, `{}` not being a map, and — the subtle one — a `??` default outside the
literal union's member set.

The inverse also happened today and is the reason the rule says *find the reaching shape*: my
first probe for the same-named-loop-var defect used **two union iterables of different unions**,
which already passes on master. The defect needs the **first** loop over a NON-union iterable.
A probe that fails to reproduce is not evidence the claim is wrong — it is evidence the shape
has not been found yet.

## Band 3g — surfaced by #1441's 1800-cell grid, re-derived on the tip (2026-08-17)

#1441's grid was measured at `ffe1baaf`, which predates #1439 and #1440, so I re-derived each
class on the tip before filing. **Two of the four reproduced; two used a different shape than
the report described**, which is why the report's cell counts are marked unverified here.

| id | item | verdict on the tip | notes |
|---|---|---|---|
| **N1** | **`==` between two NULLABLE LISTS** | **check-clean INVALID WASM**, rep-FLAT across all six element types | IN FLIGHT. Controls: the non-nullable list `==` prints `1`, `== null` prints `0` |
| **N2** | **`return` of a nullable NUMERIC litunion — even a NON-NULL member** | **check-clean INVALID WASM** | `function f(): 1 \| 2 \| null { return 1 }` fails inside `f` itself, with **no `??` anywhere**. **This corrects #1439's own residue statement**, which said *"`return null` over that rep keeps its loud floor"* — a loud floor is not what happens for `return 1`; that is silent invalid wasm, which is strictly worse. #1439 already named the responsible home (`computeRetInference` / `criClassify`, a THIRD name-keyed classifier it measured and declined to fix). OPEN, and higher value than #1439's note implies |
| **N3** | ~~a **numeric** litunion through a `??` receiver, 14 cells~~ | **does NOT reproduce as filed** | `let p: 1 \| 2 \| null = 1; let r = (p ?? 9); print(r)` prints `1`. #1441's cells reached the failure through a **call** whose return type was the nullable numeric litunion, i.e. they were **N2**, not a `??` defect. Merged into N2 |
| **N4** | `==` over `string \| null` / `S \| null` | **REPRODUCES — as a TRAP, and MY dismissal of it was WRONG** | I closed this row after probing it and getting `1`. **My probe used two NON-NULL strings.** With a null actually present the same shape **traps** at runtime, check-clean. I require every agent to grade cells on *"both a present value and a `null`, every cell"* and did not do it myself — **a runtime-behaviour cell graded on one runtime input is not graded.** Closed by #1442, which found the trap column that the filing AND my re-derivation both missed (21 trap cells → 0) |
| **N5** | an **inline** litunion through a **closure-call** receiver — 2 traps + 12 invalid wasm | **not reproduced**; my probe used a NAMED alias and printed correctly | needs the exact inline spelling before it gets an agent — same status as D1h and the 2-struct-union `is` trap |
| **N6** | litunion member texts are not in the string pool, so the atom→string tower materializes each with a 1-element `array.new_fixed` on every print — **N−1 unused allocations per print** | measured by #1441, deliberately not paid down | pooling them in `collectStrPool` renumbers the global index space, so it is an optimization, not a defect. Runtime-perf band |

**The pattern worth keeping**: a grid measured on an older base reports its *findings* faithfully
and its *attribution* unreliably. Three of these five were filed against the wrong axis — the `??`
receiver and the `string | null` operand were both innocent, and the real defect (N2) is one
function away from a residue another PR had already named. **Re-derive the shape, not just the
count**, before spending an agent.

## A control can be INVERTED, not just weak — the sharpest lesson of this cycle (2026-08-17)

The board's standing rule was *"state a control that FAILS in the broken configuration, and check
that it does."* #1459 found the failure mode that rule does not cover: **a control that discriminates
perfectly and that I read backwards.**

I filed `boolean` → `i32` as a silent soundness hole. My control was that the bare literal
`const b: i32 = true` is REJECTED while every non-literal boolean is accepted. That control is real,
it discriminates, and it is reproducible. I concluded "the guard exists on the literal path only,
therefore the general path is missing it." The actual design is the exact inverse: the coercion is
the **feature** (A7b) and the literal rejection is the **guard**, because `let x: i32 = true` is
likelier a typo than an intent. Same observation, opposite conclusion.

**What would have caught it in one step, and is now the rule:** before filing an acceptance as a
defect, *grep the corpus for a fixture that pins it*. `tests/cases/types/boolean-to-i32.vl` is an
`@run` fixture with five `@log` oracles covering the exact three positions I listed in the brief, and
`CHANGELOG.md:107` names the feature. **A behaviour with its own pinning fixture is a decision, not
an accident** — and searching for one costs a single grep against the hours a wrong brief costs.

This is the fourth consecutive slice where the AXIS I filed was wrong while the cells I counted were
right, and the first where the axis was wrong because the *evidence pointed the other way* rather
than because I had too little of it.

## Newtypes measured for the first time — 10 cells, 10 correct (2026-08-17, `fed8693b`)

The board carried newtypes as **0 cells measured**. They are now measured, and the brand holds
everywhere I could reach it. Spelling is `type A = new { v: i32 }` (not a `newtype` keyword — my
first four probes used one and were rejected for that reason alone).

**Brand enforced (correctly rejected)** in every position, each paired with a positive control that
PASSES, so the rejection is the brand and not a dead position:

| position | cross-nominal `A` → `B` | control `B` → `B` |
|---|---|---|
| binding | rejected | prints `5` |
| parameter | rejected | prints `5` |
| return | rejected | prints `5` |
| array element | rejected | prints `5` |
| map value | rejected | prints `5` |
| struct field | rejected | prints `5` |

Also correct: `nominal ← structural` and `structural ← nominal` both rejected, so the brand does not
decay in either direction.

**The controls earned their keep, and one reading was vacuous until they ran.** My first map-value
pair showed the cross-nominal case rejected — which looked like brand enforcement — but the *control
also failed*, so that position was rejecting everything and proved nothing. The cause was my probe,
not the compiler: a map read is nullable (`B?`) and I printed it un-narrowed, giving
`member access '.v' on non-object B?`. Guarding the read makes the control print `5` and leaves the
cross-nominal case correctly rejected. **A rejection is only evidence of a brand when the same-type
flow through the same position succeeds.**

## C5 / A16 — the correctness population that BLOCKED it is substantially gone (2026-08-17, `fed8693b`)

C5 sits on the board as **BLOCKED, 2 owner rulings**, carrying **"81 of 244 grid cells broken, 42
silent wrong answers, all `vl check`-clean"**. That population is what made the row frightening. It
does not reproduce.

`webcraft-requirements.md` names three exemplar shapes. **All three are correct on the tip:**

| doc's claim | tip |
|---|---|
| `const k: K = "aa"; const x: K \| f64 = k` **converts the atom ID to a float** | prints `aa` |
| `if x is K { const y: K = x }` is **invalid wasm** | prints `aa` |
| `K \| string` answers `x is K` **TRUE for a plain string** | correctly answers **false** |

I widened past the three exemplars rather than stopping at them: `K \| i32`, `K \| boolean`, the
`K \| f64` union actually **holding** its f64 arm (correctly takes the f64 branch — the negative
direction, which is the one a broken tag test fails), and a mixed union **as a struct field** are
all correct too. **Nine of nine probed cells are in a correct outcome column.** The ninth is a loud
reject with guidance — `match over a union with literal members is not supported — compare them
with == in an if-chain` — which is a documented limitation, not a silent cell.

**What this does to the row.** The two owner rulings gated the *representation feature*, and
measurement had already concluded that feature "should not be scheduled as a memory feature" —
a standalone litunion and all four keep positions already rep as an interned i32 atom, and the
mixed-union store already costs exactly one `struct.new` against an interned global, so no encoding
allocates less. With the correctness half gone too, **C5 no longer has an unblocked half worth
briefing** and should stop being counted as a blocked correctness risk.

**Caveat kept honest:** nine probes is not a 244-cell grid. The claim is that the shapes the doc
itself nominates as the defect are fixed, so **81/42 is refuted as a live number** and must be
re-derived before anyone briefs it — not that every cell was re-measured. The likely closers are the
litunion/nullable-rep run #1439–#1455. `docs/webcraft-requirements.md`'s A16 paragraph still states
the stale population and should be corrected when C9's doc-staleness pass runs.

## #1462's face-2 pin — I re-rooted it and was ALSO wrong. Settled by #1464 (2026-08-17)

#1462 landed a verdict pin for the defect it could not fix in scope,
`tests/cases/unions/error-struct-typed-variant-field-read.vl`, whose header states the axis as
**"a union ARM that is a struct carrying a STRUCT-TYPED field"**. Measured on the tip, that is wrong,
and the fixture as merged will mis-teach the next reader:

| shape | result |
|---|---|
| `Outer = { v: Inner }`, `Inner = { v: i32 }` — outer field name **collides** with inner's | **emit error** |
| `Outer = { w: Inner }`, `Inner = { v: i32 }` — the *same* struct-typed-field shape, names differ | **works, prints 5** |
| `Outer = { w: Inner }`, `Inner = { w: i32 }` — collision on a different NAME | **emit error** — so it is the collision, not the identifier `v` |
| the colliding shape **outside any union** | **works, prints 5** |
| three levels all named `v` | **emit error** |
| collision, in a union, reading only ONE level (`const g = u.v`) | a **DIFFERENT** message: `ref valtype with no interned shape` |

**Two conditions are required at once: a union arm AND a field-name collision between the outer
struct and its struct-typed field's own type.** Drop the union and it works; rename either field and
it works. The fixture's exemplar inherited `v` at both levels from `Box<T> = { v: T }`, so the field
NAMES were the one variable never moved — which is how a careful cell-by-cell staging still landed on
the wrong axis.

**This is the sixth consecutive slice whose filed axis was wrong while its cells were right**, and
the third where the wrong axis came from an exemplar that held a variable fixed rather than from
too little data. The habit that catches it is cheap: **vary every identifier in the exemplar, not
just its types and shapes.**

Briefed with the re-rooting stated as a hypothesis to confirm or refute, plus an instruction to
correct the fixture header — a fixture that mis-teaches is worse than none.

**OUTCOME: my hypothesis was REFUTED IN BOTH HALVES, and briefing it as a hypothesis is the only
reason that was cheap.** #1464 measured the real axis:

* Not membership — a **FIELDSET TWIN**, the field-name SET being identical. My two decisive cells
  (`{v}` outer vs `{v,k}` inner, and `{a,b}` outer vs `{a}` inner) hold membership but differ as
  sets, and **both work**. I confirmed them myself. The twin need not even be the field's own type:
  an UNRELATED `Other = {n: string}` twinning the arm `Outer = {n: Leaf}` reproduces it exactly.
* **A storage class I never varied.** The identical shape works as a param, as a local, and as a
  global initialized from a CALL. Only a **module global annotated with a union alias and
  initialized by an object literal** reproduces.

Root: `structIndexOfLet` fell through to the INITIALIZER when the annotation was not a struct, and
an object literal answers that query **by field-name set**. `paramStructIndex` already held the
annotation-only discipline — which is exactly why params worked, and why the storage-class axis
falls out of the root rather than needing to be discovered separately. A shortened mirror again.

**The lesson I drew last round was right but too narrow.** I said "vary every identifier, not just
types and shapes" — and I did vary the identifiers, which is how I got a real grid. What I did not
vary was the **storage class** and the **cardinality** of the field sets. The durable form:
**a grid proves an axis only over the dimensions it moves, so name the dimensions you held fixed.**
Every one of my six wrong axes was a dimension I never listed.

## B8 re-derived — and MY re-derivation was wrong in two places. Settled by #1465 (2026-08-17)

B8 (`nameToTyReal`, the checker's second descent) is filed **L / high risk** with a "~150 ops"
headline the row itself flags as predating the #1327 unit correction. Measured on the tip:

* **`nameToTyReal` is 236 lines** (`typecheck.vl:7511-7746`) and has **exactly ONE caller** — its
  own wrapper `nameToTy` at `:7194`.
* **`nameToTy` has 15 call sites, all inside `typecheck.vl`. Eleven of them are RECURSIVE**, inside
  `nameToTyReal` itself, re-parsing sub-spellings back out of the string: union parts, intersection
  parts, negation, a parenthesised group, function parameter types, the return type, the array
  element name, the map key and value names, and a field's type text. The support cast those rungs
  call — `arrElemNameRaw`, `mapSpellKeyName`, `mapSpellValName`, `groupInnerOf`, `parenEnclosesWhole`,
  `fieldTypeTextOf` — is a **type-spelling parser written against strings**, which is the destringify
  thesis's core target rather than an incidental helper.
* **So the real surface is FOUR external callers**, not ~150 ops:

| caller | what hands it a string |
|---|---|
| `annotResolve(name, root)` `:6716` | **already a ladder** — `if root >= 0 { return tsToTy(root) }` first. #1129's D-ASCANON measurement found the tree present on **333,073 of 333,073** reads at the two POSITIONED funnels, so the string route survives only for UNpositioned entries (`emit_rep`'s post-canon re-resolutions) |
| `:6844` | splits a function-type spelling's argument list and resolves each part |
| `unionMemberGenAppShape(member)` `:10976` | takes a union member SPELLING |
| `recordClonedNodeTy(nodeIx, name, pin)` `:21236` | the monomorphizer's clone recorder — and the **only** producer of the indices `monoInferListElem`/`monoInferLocalScalar` consume, which is why those take no names |

**CORRECTED BY #1465's MEASUREMENT — I got two things wrong above.** `nameToTy` has **14** call
sites, not 15, and **10** are recursion. **The external surface is THREE, not four**: the
`applyGenAliasArgs` comma-split at `:6844` is reachable only from `applyGenAlias`, whose one caller
is `nameToTyReal`'s own generic-application arm — an ELEVENTH recursion. I verified that myself at
integration (`applyGenAlias` has exactly one call site, inside `nameToTyReal`'s line range).

**And my briefing advice was refuted by the population.** I said to start from `annotResolve`
because it is already tree-fed at its positioned funnels. It is — and that is exactly why it is at
its FLOOR. The descent is **99.3% emit-time** (4,540 outermost entries under `--codegen`, of which
the checker's own funnels are **0**), so the route I pointed at had nothing left to convert.
`emit_rep`'s post-canon `resolveAnnot` reads 2,099 of them and cannot be fed a tree at all, because
canon `clearAnnTs`-invalidates it.

**A grep-and-`awk` call-graph sizing is a hypothesis, not a measurement.** Mine was close enough to
aim an agent and wrong in the two details that would have decided where it started. The fix is
cheap and I should have done it: count the population in the unit that decides the work — parses at
the outermost entry — not call sites in an editor.

**Re-sized: the risk is concentrated in four sources, and one of them is already 100% tree-fed at its
positioned funnels.** The row's "L / high" grading should be re-read as "four sources to convert,
then a 236-line string parser and its six-function support cast delete". Treat "~150 ops" as retired.
Whoever briefs this should start from `annotResolve`, because its ladder already proves the
tree-first shape works and its remaining string traffic is a *named, bounded* population
(unpositioned entries) rather than an open-ended one.

## BAND 1 — the string parser's population RE-DERIVED, and it has TWO feeders, not one (2026-08-18)

The board's state-of-the-programme paragraph reads the emit side as one population at its
floor ("**1,846 `annotResolve` parses** … there is no fourth rung to add"). Instrumented on
the tip — a throwaway probe counting entries at the OUTERMOST `nameToTy`, attributed to the
three external callers, then bucketed by name SHAPE — that is half the picture.

**Corpus, 1,673 files reporting. 4,134 outermost parses:**

| feeder | parses | share |
|---|---|---|
| `annotResolve` (root < 0) | **2,110** | 51.0% |
| `recordClonedNodeTy` (the monomorphizer, via `synthTypeRef`) | **1,993** | 48.2% |
| `unionMemberGenAppShape` | 31 | 0.7% |

**So `annotResolve` is not the population — it is half of it**, and the filed 1,846
re-derives at 2,110 (+14%). The second feeder is the emitter minting a `TypeRef` from a name
it COMPUTED and then immediately re-parsing that name; `emit_rewrite.vl:1095` is the shape in
its purest form — `synthTypeRef(lt.tyName + "[]", -1)` builds a string by appending `[]` and
`recordClonedNodeTy` parses it straight back.

**Shape × feeder, which is what decides where to start:**

| shape | `annotResolve` | monomorphizer |
|---|---|---|
| **bare identifier** | 174 | **1,146** |
| object `{` | 728 | 124 |
| union `\|` | 564 | 288 |
| array `[` | 255 | 336 |
| function `=>` | 369 | 66 |
| generic `<` | 51 | 33 |

The single largest cell in the whole table is the monomorphizer re-parsing a BARE
IDENTIFIER — 1,146 of 4,134 (27.7%) — and `recordClonedNodeTy` had no rung at all.

### Shipped: the bare-name rung, at the shared leaf

A bare identifier cannot enter any composite arm of `nameToTyReal`, so its answer IS the
shared leaf ladder — and `tsLeafTy` (prim → type-parameter binding → declared name) already
IS that ladder on the TREE route, so the rung routes to an existing home instead of adding a
second copy. `nameIsBareIdent` is one scan in `tyname.vl` beside the other name grammars: the
NEGATIVE of every composite arm at once.

**Dual-run before shipping, the programme's own method** — both answers computed and their
renders compared, on every bare name: **6,161 runs, 0 disagreements** on the corpus, 8 more
on the self-compile, also 0. Arena-neutral by construction (all three leaf rungs are lookups
of an index somebody else minted). Corpus A/B: **0 verdict changes, 0 emitted-byte changes.**

**The rung fires at RECURSIVE entries too**, which the outermost census does not show: a
union's members, an array's element and a field's type are each a bare name in the common
case, so **6,161 leaf resolutions** now answer without entering the 236-line string parser —
not the 1,320 outermost ones alone.

### PERF: neutral, for the third time, and the board's own framing is now measured

Interleaved min-of-5: `vl check compiler/` −0.9%, self-compile +1.3% — inside noise, and the
between-run drift on this machine (4,692 → 5,054 ms for the same binary) is larger than the
effect. That is the **third** independent neutral result today, after the `primName` litunion
and the optimized-seed measurement. The board already says *"destringify is a correctness
programme, not a speed one"* (`:337`, from the `__str_eq__` split — 19.10% identifiers vs
6.08% type names); these three measurements are the direct confirmation, on the work itself
rather than on a profile. **Rank destringify slices by what they make impossible, not by what
they make faster.**

### Left, and now sized

2,814 structural parses remain (852 object, 852 union, 591 array, 435 function, 84 generic).
The two biggest — `annotResolve`'s 728 object and 564 union spellings — are the UNPOSITIONED
entries, which is the population `annotResolve`'s own header names: emitter-synthesized
`TypeRef`s and `emit_rep`'s post-canon re-resolutions. Both want the producer to hand over a
TREE or an arena INDEX rather than a name.

### Also shipped: the HAND-OVER form, and its first site

`synthTypeRefTy(name, pos, tyIx)` / `recordClonedNodeTyKnown(nodeIx, name, pin, tyIn)` — the
producer passes the arena index it already holds, and the parse does not happen at all
rather than being shortcut. `-1` is exactly the old route, so the other 33 `synthTypeRef`
callers are untouched.

First site converted is the programme's own headline shape, `emit_rewrite.vl`'s captured-box
rewrite: it appended `"[]"` to a name and `recordClonedNodeTy` parsed the result straight
back off — **a string built and taken apart in two adjacent statements.** The element's arena
index is on the annotation node the checker already recorded, so the array type is one
`mkArrayTy` over it.

**Proven LIVE by sabotage, not by reading**: handing over `i32TyIx()` instead of
`mkArrayTy(elemTy)` reddens the exercising program with `emitProgram: indexed assignment but
list type not collected`, so the handed-over index is genuinely consumed. Correct version is
byte-identical on that program and **0 verdict / 0 byte changes** corpus-wide.

The name is still recorded as the node's `tyName` for consumers that have not been
converted, so this removes the PARSE and not yet the SPELLING. That is the mechanism the
remaining 2,814 need; each further site is a question of whether its producer holds an index,
not of whether the route exists.

### THE `annotResolve` HALF, MEASURED PER SITE — and BLOCKED-REP is now a number

The filing calls this half blocked at the rep layer. That is inherited, not measured, so I
instrumented each of `emit_rep`'s `resolveAnnot` call sites — counting CALLS and, separately,
the calls that reach a parse (a memo miss at the outermost entry) — over the corpus:

| site | calls | **parses** |
|---|---|---|
| 1 · `repElemKeyOfNameTy`, hand-over absent (`ty < 0`) | 8,478 | **553** |
| 2 · `slotCanonKey`, shape-span arm | 1,084 | **417** |
| 3 · `declTyIxOfName`, composite fall-through | 9,882 | **1,138** |
| 4 · `repRowOfName`, shape-span arm | **0** | **0** |
| total | 19,444 | **2,108** |

Cross-validates the independent census above (which read 2,110 for this whole half through a
different probe), so both instruments agree to within 2.

**Site 3 is the biggest single site in the programme's remaining population — and it is at its
FLOOR for a name-keyed design.** `declTyIxOfName` already runs two rungs (`cUserTypes`, then
`primTyOfName`) and `resolveAnnot` memoizes per spelling, so **9,882 calls collapse to 1,138
parses — the memo already absorbs 88.5%**. What remains is one parse per DISTINCT composite
spelling per program, roughly 0.7 per corpus file. No further rung can go below that: a rung
answers a name faster, and the floor is the number of distinct names.

**So "BLOCKED-REP" is confirmed rather than inherited, and now says something specific**: the
only way under 1,138 is to stop keying by NAME at all — the rep tables carrying an arena index
beside (or instead of) their name column, which is what the `sTyIx[]` sidecar started. Its
callers are the rep tables' name-keyed entry points (`fieldElemTyIxOfName` at intern time,
`unMemAtomTyIx` at union-member registration), so the conversion is per-column, not per-call.

**Site 4 is measured at ZERO calls and is NOT deleted.** Its own header records rung 1
declining 32 times corpus-wide; my probe adds that **0 of those 32 take the shape-span arm** —
they are `#anon` rows and unresolvable spellings, for which `nameIsShapeSpanEnds` is false.
That is corpus COVERAGE, not a reachability proof, and this programme's own D-TOTALITY rule is
that a fall-through is deleted with an argument or kept with its measurement. Kept, with the
measurement.

### THE TYPE ARENA ITSELF IS NOW STRING-FREE FOR STRUCTURE AND KIND

Three raw `string` fields in `T.tys`'s own variants encoded type STRUCTURE or KIND, each with
its closed set written out in a comment over the field. All three are now declarations:

| field | was | now |
|---|---|---|
| `TyPrim.primName` | `string`, 9-member set in a comment | `PrimName` literal union |
| `TyLit.litKind` | `string`, `"str" \| "int" \| "flt"` in a comment | `LitKind` literal union |
| `TyErr.errKind` | `string`, always `"error"` | `i32` |

**`errKind` was WRITE-ONLY.** `grep -rn errKind compiler/*.vl` is two lines — the declaration
and one construction — and *nothing reads it*. It existed because `is` discriminates the arena
union on field NAMES, so the variant needs one field to be distinguishable; it never needed
that field to be a heap string. Every `TyErr` in every program was carrying a string reference
for nothing.

`litKind`: 34 occurrences over 4 files, **25 comparisons whose source text is unchanged**, 9
producers all passing literals through one minter. Its one string-sentinel local
(`let litKind = ""`, "no member seen yet") becomes `LitKind | null` — the same absence idiom
`primNameOf` took.

**What remains in the arena is TEXT, not structure**: `TyObj.objFieldNames` (field
identifiers), `TyVar.tvName` (a type parameter's identifier) and `TyLit.litText` (the
literal's own lexeme). Those are user-authored characters that a type legitimately carries —
none of them encodes a type's shape or kind. **On the programme's own terminal condition —
*stop representing types as raw strings* — the type arena is done.**

0 verdict changes and 0 emitted-byte changes over 2,005 corpus files; full suite 2,159/0;
fixpoint holds; the seed shrank 68 bytes.

### THE EMITTER HALF: SHIPPED, after the last two disagreements were NAMED and gated

The terminal item below says the interner's leaves are names CUT from a larger spelling, so no
caller can bank an index for them. That is true of the CALLERS and it is not the end of the
argument: **the ROOT has a node.** `collectAnnShapes` walks every node and holds `ti`, so the
descent can be given an arena type at the top and PEEL IT IN LOCKSTEP with the name.

I built it. `internShapeDeepTy(nm, ty)` threads the type through the descent — paren peel keeps
`ty`, `nullablePartOf` takes `t.nInner`, `arrElemNameRaw` takes `t.aElem`, `mapValNameOf` takes
`t.mVal`, and union arms / functype interiors drop to -1 rather than guess. The name peel is
untouched and stays authoritative for every key, dedup and stored spelling; the type rides
alongside and reaches only `internInlineShapeTy`'s `sTyIx` hint. Three `tyStep*` helpers, named
apart from the existing `tyPeelNul` because that one answers `ty` itself on a miss while these
must DECLINE (the B9b precedent).

**It works, and the coverage is real: 1,156 of 3,145 leaf calls (36.8%) carry the hand-over**,
where the descent previously had none. Corpus A/B was 0 verdict and 0 byte changes, suite green,
fixpoint held.

**And it is still wrong, which only a dual-run could show.** `sTyIxOfNameTy` short-circuits on
the hint, so the handed index must EQUAL `cUserTypes[nm] ?? resolveAnnot(nm)`. Measured:

| | agree | **disagree** |
|---|---|---|
| ungated | 447 | **11** |
| gated on `annTsOf(ti) >= 0` | 411 | **2** |

The gate is the canon invariant itself — `clearAnnTs` drops the spelling tree on exactly the
nodes canon rewrote in place, so a surviving tree says the name still describes the recorded
type. It removes 9 of the 11. **Two survive, and two is not zero.**

**Two was not a residue — it was a NAMED CLASS, and finding out cost one probe.** The byte A/B
could never have told me: a deliberate sabotage handing arena index 0 at EVERY leaf also passed
the whole suite, because `sTyIx` is weakly consumed. Only the dual-run sees this, which is why
it is the gate rather than the corpus.

Both disagreements were in ONE file, and the witness names the class outright:

```
name={a:K[]}  hint={a: string[]}  unhinted={a: K[]}
name={a:Sx}   hint={a: i64}       unhinted={a: Sx}
```

`generics/type-param-shadows-alias-through-constructors.vl` — a **generic-alias type PARAMETER
shadowing a module-level alias of the same name**. Inside `type ShapeInArrK<K> = {v: {a: K[]}}`
the checker binds `K` to the argument, so the node's recorded type is instantiated
(`{a: string[]}`); the emitter re-resolving the same spelling with no binding in scope reaches
the module-level `type K = "a" | "b"`. Same spelling, two answers — and the interner's key
vocabulary is the second.

**So the second gate is `nameMentionsGenAliasParam`**, over `gaParamNames` (the flat column of
every alias's declared parameters) with a whole-identifier boundary test that now has its one
home in `tyname.nameMentionsIdent` — `K` is mentioned by `{a: K[]}` and NOT by `Kind`.
FUNCTION type parameters need no arm and that is measured, not assumed: the monomorphizer
substitutes them into the spelling before collect runs, which is why the disagreement class was
alias parameters alone.

| gates | agree | disagree |
|---|---|---|
| none | 447 | 11 |
| canon (`annTsOf >= 0`) | 411 | 2 |
| **canon + alias-parameter** | **411** | **0** |

**SHIPPED at 0 of 411.** Corpus A/B 0 verdict and 0 byte changes, full suite 2,159/0, fixpoint
holds, self-lint + fmt clean.

**What it settles.** The emitter half is NOT blocked on B5 after all — that was my reading of
the ungated 11, and the gated residue turned out to be a different, nameable class. The claim
this section replaces (*"the rep-column rewrite is not optional and B5 is its first step"*) was
wrong, and it was wrong because I stopped at a count instead of asking what the two cases WERE.
**A residue of two is not a residue; it is two cases with names on them.**

### THE HAND-OVER IS NOW RECURSIVE: a hinted shape hints its own FIELDS (2026-08-19)

The slice above gave the descent an arena ROOT. It stopped at the shape boundary: the moment
`internShapeDeepTy` reached an inline struct, `internInlineShapeTy` split it into field texts and
called `internShapeDeep(ftxt)` — **unhinted**, because a field text is a cut of the parent's
spelling and a cut has no node. Same argument as the root case, and it fails the same way: the
cut has no bank, but its PARENT does. A `TyObj`'s fields are in the arena, keyed by name.

So `tyFieldTyOf(ty, name)` — the `tyStep*` family's object arm, exported from `typecheck.vl` over
the existing `objFieldType` so the field scan keeps one home — steps the hint into each field, and
the nested-shape arm peels `| null` off the hint exactly when `nonNulBaseOf` shortened the name.
**The hand-over becomes recursive:** a hinted shape hints its fields, whose nested shapes are hinted
in turn, all the way down.

| population (corpus, 1,559 emitting files) | before | after |
|---|---|---|
| `internInlineShapeTy` entries with a hint | 975 of 3,136 (31.1%) | **1,407 (44.9%)** |
| field pre-interns with a hint | 1,357 of 4,510 (30.1%) | **2,017 (44.7%)** |
| leaf `sTyIxOfNameTy` resolutions with a hint | 409 of 1,097 (37.3%) | **526 (47.9%)** |
| `sTyIxOfNameTy` **reaches past the nominal rung** (NOT parses — see the unit correction below) | 816 | **699** |

The field-hintable count rising 1,357 → 2,017 is the compounding, and it is the whole point: the
extra 660 are fields of shapes that only got a hint BECAUSE their own parent was hinted.

**The gate is the dual-run, and the sabotage proves it is live.** `sTyIxOfNameTy` short-circuits on
the hint, so the handed index must equal `cUserTypes[nm] ?? resolveAnnot(nm)`. Compared by render at
every hinted leaf: **526 agree / 0 disagree** — up from the previous slice's 411/0 on the same
comparator. A sabotage handing the PARENT's type as every field's type reddens **77**, with
witnesses naming themselves (`hint={a: () => …, f: string, z: {…}}` against
`unhinted={a: f64, f: f32, z: i64}`). This matters because the byte channel **cannot** see a wrong
hint here: `sTyIx` is weakly consumed, and an earlier sabotage handing arena index 0 at every leaf
passed the entire suite. The dual-run is the gate; the corpus is the control.

**No new gates were needed.** The two collect-site gates (canon's `annTsOf(ti) >= 0`, and
`nameMentionsGenAliasParam`) are applied at the ROOT and are monotone inward — a field text is cut
from the root spelling, so if the root mentions no alias parameter neither does any field of it,
and a surviving spelling tree covers the whole subtree. That is why the disagreement count stayed
at zero without a third gate.

**PERF: neutral on the self-compile, for the FOURTH time, and this time it is exactly zero.**
`sTyIxOfNameTy` reaches `resolveAnnot` **0 times** compiling the compiler's own source — measured
on both sides, before and after — so the 117 saved parses are a corpus-only number. This is B1's
finding again (`nameToTy` entered 54 times corpus-wide, 0 on the compiler) at a different site, and
it is the fourth independent confirmation of the board's own `:337` framing: **destringify is a
correctness programme, not a speed one.** Rank its slices by what they make impossible.

**No fixture, and that is deliberate.** The change moves 0 bytes and 0 diagnostics by construction,
so there is no behaviour a `tests/cases` file could pin — the same reason the root slice shipped
without one. The pin is the dual-run plus its sabotage, recorded here and in the function header.

Verified: corpus A/B **0 of 2,010** on emitted-wasm sha256, exit code AND diagnostic text; suite
2,159/0; `cases_wasm` 1,939/0; native fixpoint byte-exact at 1,230,214; self-lint + fmt clean; LSP
bundle rebuilt.

**What is still unhinted, each for its own reason** — the next slices, sized:

| population | why it is -1 today |
|---|---|
| `internFuncTypeShapes` (116 resolutions) | takes **no type parameter at all**; the arena's `TyFunc` params/result would have to be threaded the same way |
| union arms | the descent DECLINES rather than guess which arm a name belongs to |
| functype interiors | same decline, one layer in |
| roots the collect-site gates reject | canon rewrote the spelling, or the name mentions a generic-alias parameter — by design |
| `internShapeFieldElems` (5) | measured, negligible |

### THE UNION ARMS — and the census that RANKED THEM LAST was reading the wrong unit (2026-08-19)

With the field hand-over in, 571 of 1,097 leaf resolutions were still unhinted. I attributed every
one of them by instrumenting the DROP POINT — the branch that last held a type and passed -1 down:

| where the hint was dropped | count | share |
|---|---|---|
| no root (`internShapeDeep`, the -1 wrapper) | **404** | 70.8% |
| functype (`internFuncTypeShapes`) | 109 | 19.1% |
| unattributed | 43 | 7.5% |
| element / nullable / map step miss | 10 | 1.8% |
| value union | 4 | 0.7% |
| **union arms** | **1** | **0.2%** |

**That table ranks the union arms LAST and it is wrong.** `internShapeArms` reaches the descent
through the -1 WRAPPER, and the wrapper re-attributes everything below it to "no root". A second
probe tagging the wrapper's five CALL SITES splits the 404:

| call site | count | share of the 404 |
|---|---|---|
| **`internShapeArms`** | **357** | **88.4%** |
| `emit_classify:15895` union ref-array arm | 22 | 5.4% |
| `internNonLowerableFieldShapes` (nested / closure) | 21 | 5.2% |
| `emit_collect:4338` `gaeApplyFieldTy` | 4 | 1.0% |

So the union arms are **358 of 571 (62.7%)**, not 1 of 571 — the largest remaining population by a
factor of three. This is the board's standing rule reproduced exactly: *ranking by the wrong unit
inverted the order* (#1327's 15,901 reaches were 3,031 parses). A drop-point census answers "which
branch let go of the type"; the question was "which CALLER feeds the unhinted leaves", and the two
differ by one wrapper frame.

**The seam already existed.** `unionMemberTysOf(set, out)` appends a union row's member types in
`splitUnionAtoms` order — the D-UNION query seam, with a coverage flag of its own — and
`emit_classify:15895` was already calling its bundled form `unionSetArmTys` for its own atoms and
then throwing the types away at the `internShapeDeep(a)` line. Both sites now hand the arm's type
down. The order correspondence holds **by construction, not by convention**: a multi-arm `set`
matches its row through the `unMemberSet[v] == name` leg, i.e. the row whose recorded set spelling
IS this string, so the two splits are the same split; the length equality is `unionSetArmTys`'
second conjunct, asked over the atoms the caller already has.

| | before this slice | after |
|---|---|---|
| leaf resolutions with a hint | 526 of 1,097 (47.9%) | **888 (80.9%)** |
| `sTyIxOfNameTy` reaches past the nominal rung (NOT parses) | 699 | **342** |

**Dual-run 888 agree / 0 disagree**, sabotage (arm pairing rotated by one) reddens **270** with
witnesses that name themselves (`hint=i64` against `unhinted={a: () => …, z: f64}`). Corpus A/B
**0 of 2,010** on emitted-wasm sha256, exit code and diagnostic text; suite 2,159/0; `cases_wasm`
1,939/0; fixpoint byte-exact at 1,230,368; self-lint + fmt clean; LSP rebuilt.

**Across the two slices this session: `sTyIxOfNameTy`'s reaches past the nominal rung 816 → 342
(NOT parses — see the unit correction below), leaf hint coverage 37.3% → 80.9%.** And on the compiler's own source the site parses **0 times, before and
after, on every measurement** — so none of it is a speed result, for the fourth and fifth time.

**What is left, re-derived on this base rather than carried forward:**

| population | count | why |
|---|---|---|
| functype (`internFuncTypeShapes`) | 109 | takes no type parameter; the arena's `TyFunc` params/result would thread the same way — **the next slice** |
| unattributed | 43 | needs its own probe |
| `internNonLowerableFieldShapes` | 21 | reached only under `internFuncTypeShapes`' gate; rides on that slice |
| step misses (elem / nullable / map) | 10 | the lockstep declining on a genuine name/arena mismatch |
| `gaeApplyFieldTy` | 4 | a name BUILT by substitution — no node exists to hold |
| value union | 4 | `registerValueUnionName` is a box registration, not a shape intern |

### THE FUNCTYPE DESCENT GETS THE SAME LOCKSTEP — the terminal item is now 92.8% closed (2026-08-19)

`internFuncTypeShapes` is `internShapeDeep`'s twin for closure spellings and it took **no type
parameter at all** — 109 of the 209 leaves still unhinted after the arm slice, plus the 21 under
`internNonLowerableFieldShapes`, which is reachable only through it. The conversion is the same
shape as the other two, one grammar deeper:

| name step | arena step |
|---|---|
| `annFnDecompose` param texts | `TyFunc.fnParamTypes[i]`, **only** when the arity matches |
| `annFnDecompose` result text | `TyFunc.fnRet` |
| `nullablePartOf` | `t.nInner` |
| `arrElemNameRaw` | `t.aElem` |
| `arrLeafNameOf`'s `[]` RUN | `tyStepArrRun` — the layer count is the length delta halved |
| a field name | `tyFieldTyOf` |

The pairing is positional, so an arity mismatch **declines rather than tolerates**: a function of a
different arity is a different function, not a near miss. Three callers gained a root along the way —
the descent's own functype branch, `internShapeArms`' closure arm (which now holds `armTy` from the
previous slice), and the value-union closure-arm descent, paired by the same `unionMemberTysOf` seam.

Every new helper is LIVE, measured rather than assumed: `tyStepParam` answers **1,784**, `tyStepRet`
**1,895**, `tyStepArrRun` peels a real run **16** times, `internShapeFieldElemsTy` is hinted on
**224 of 273** calls and `internNonLowerableFieldShapesTy` on **37 of 49**.

| | after arms | after functype |
|---|---|---|
| leaf resolutions with a hint | 888 of 1,097 (80.9%) | **1,018 (92.8%)** |
| `sTyIxOfNameTy` reaches past the nominal rung (NOT parses) | 342 | **212** |

**Dual-run 1,018 agree / 0 disagree**; sabotage (params fed the RESULT type and the result fed
param 0) reddens **18** and strands 241 more hints downstream. Corpus A/B **0 of 2,010** on
emitted-wasm sha256, exit code and diagnostic text; suite 2,159/0; `cases_wasm` 1,939/0; fixpoint
byte-exact at 1,231,083; self-lint + fmt clean; LSP rebuilt.

### WHERE THE DESTRINGIFY EMITTER HALF STANDS AFTER THREE SLICES

| | at session start | now |
|---|---|---|
| leaf `sTyIxOfNameTy` resolutions carrying an arena hint | 409 of 1,097 (37.3%) | **1,018 (92.8%)** |
| `sTyIxOfNameTy` reaches past the nominal rung (NOT parses) | 816 | **212** |
| the same, on the compiler's own source | **0** | **0** |

The interner header's original claim — *"the other four callers are not hintable and that is the
measurement, not an omission"* — is now false for three of the four, and the fourth
(`internShapeFieldElems`) is hinted too. What was true of the CALLERS was never true of the tree:
a cut substring has no bank, but every cut has a parent that does, and the parent chain reaches a
node at the root.

**RESIDUAL 79 LEAVES, ATTRIBUTED — and 53 of them are B5.** I ran the probe rather than leaving the
statement at "not yet measured". Every unhinted leaf is tagged with the REASON its root carried no
type:

| reason | count | share |
|---|---|---|
| **the canon gate — `annTsOf(ti) < 0`** | **53** | **67.1%** |
| the root WAS hinted; the type was lost deeper (a union/step/value-union decline) | 17 | 21.5% |
| `gaeApplyFieldTy` — a name BUILT by substitution, so no node can exist | 4 | 5.1% |
| the node has no recorded type at all | 3 | 3.8% |
| the generic-alias-parameter gate | 2 | 2.5% |

At the main collect root the gates reject **2,518 of 20,130** TypeRef visits on canon, 306 on the
alias parameter and 54 for a missing type — but only a few of those roots ever reach a shape leaf,
which is why the leaf figure is 53 and not 2,518.

**And that 53 SPLITS IN HALF — the gate was asking the wrong question.** The gate read
`annTsOf(ti) >= 0`: a surviving spelling tree proves the recorded type still describes the name,
because `clearAnnTs` drops the tree on exactly the nodes canon rewrote. **Sound in one direction
only.** A MISSING tree is not proof of a rewrite — `annTsOf` answers -1 for a second population its
own header names, an emitter-SYNTHESIZED `TypeRef` that never had a tree, and whose recorded type is
perfectly good. Measured at the collect root: of the **2,518** nodes the tree test rejected,
**1,258 were rewritten by canon and 1,260 were not.**

So canon now keeps the column that answers directly — `canonCleared`, the node indices it rewrote,
pushed in the pass's own ascending order and binary-searched by `canonRewroteNode` — and the gate
asks that instead of reading the tree:

| gate | leaves hinted | disagreements |
|---|---|---|
| `annTsOf(ti) >= 0` (the tree proxy) | 1,018 of 1,097 (92.8%) | 0 |
| **`!canonRewroteNode(ti)` (the question itself)** | **1,044 (95.2%)** | **0** |
| no canon gate at all (sabotage) | 1,071 | **10** |

Strictly better: +26 hints, still exact, and the sabotage row proves the gate is load-bearing rather
than ceremonial — its witnesses are the alias transparency canon performs (`hint={a: Id}` against
`unhinted={a: string}`). Reaches past the nominal rung **212 → 181** — and see the unit correction below: these are NOT parses.

**What that leaves for B5: 27 leaves, of which only 10 actually disagree.** I wrote two commits ago
that the emitter half was "NOT blocked on B5" and that stands — every slice landed without it. The
re-priced claim is narrower again: **B5 owns 27 of the 53 remaining leaves (the other 26 were the
gate's own imprecision, now free), and 10 of those 27 are genuine disagreements.** Taking B5 would
move coverage 95.2% → ~97.7%. That is the number the ruling should be weighed against — not the
"970 of the remaining `annotResolve` parses" figure from before these slices, which the slices
themselves have overtaken.

**This does NOT touch the terminal item's other half.** The interner's KEYS are still names, so the
rep-column rewrite is unaffected by any of this — what these three slices removed is the RE-RESOLUTION
of a name whose type the caller already held, not the name-keying itself.

### MY UNIT WAS WRONG AGAIN — "parses" were REACHES, and half the saving RELOCATES (2026-08-19)

I reported all four slices above in a number I called *"`sTyIxOfNameTy` reaching `resolveAnnot`"*,
816 → 181. **It is not that.** The counter sat after the `cUserTypes` rung and before the
`nameIsShapeSpanEnds` test, so it counted reaches PAST THE NOMINAL RUNG — most of which return -1
without resolving anything. Re-instrumented at `annotResolve` itself, which is the actual parse:

| emit-side site | at session start | now |
|---|---|---|
| `declTyIxOfName` | 1,175 | 1,248 |
| `repElemKeyOfNameTy` | 576 | 590 |
| **`sTyIxOfNameTy`** | **207** | **40** |
| **emitter total** | **1,958** | **1,878** |

(The checker is 17,459 parses in BOTH builds — the identical figure is the control that says the
attribution is stable, and it is B1's "17,832 of 17,834 are tree walks" holding on this tip.)

**AND THE TWO NEIGHBOURS WENT UP.** `annotNameMemo` is keyed on the SPELLING and shared by every
site: a name `sTyIxOfNameTy` used to resolve was a memo entry `declTyIxOfName` and
`repElemKeyOfNameTy` then rode for free. Take the resolution away and the neighbours pay the miss.
Of the 167 parses this session removed at `sTyIxOfNameTy`, **87 (52%) RELOCATED and 80 (48%) were
genuinely removed** — a net **−4.1%**, not the −77.8% I wrote in three commit messages.

The same-tip A/B says it again in the other direction. Ignoring the hint on the CURRENT tip:

| | s1 | s2 | s3 | emitter total |
|---|---|---|---|---|
| hint OFF (control) | 556 | 416 | 1,137 | **2,109** |
| hint ON (shipped) | 590 | 40 | 1,248 | **1,878** |

So the hand-over mechanism as a whole is worth **231 parses (−11.0%)**, with 145 of `sTyIxOfNameTy`'s
own 376 relocating. Both A/Bs agree on the mechanism and roughly on the split.

**THE STANDING LESSON, and it is bigger than this slice: PER-SITE PARSE COUNTS IN THIS PROGRAMME ARE
NOT ADDITIVE.** Every "site X does N parses" figure on this board is an upper bound on what removing
site X saves, because the shared spelling memo means one site's resolution is another site's free
hit. A slice must be priced by an A/B on the EMITTER TOTAL, on one tip, with the hand-over toggled —
never by the site's own counter falling.

**None of this touches correctness, which is what the slices were for.** The dual-runs are unchanged
and still exact: 526/0, then 888/0, then 1,018/0, then 1,044/0, with a live sabotage at each step.
Leaf hint coverage 37.3% → 95.2% is a coverage measurement, not a parse measurement, and it stands.
The board already says destringify is a correctness programme, not a speed one — this is the fifth
confirmation, and the first one that caught me quoting a speed number for it anyway.

### THE TERMINAL ITEM'S OTHER HALF — the KEYS. And `repElemKey` had no memo at all (2026-08-19)

The item below says the interner is keyed by NAME, so destringifying it needs the rep-column
rewrite. Before designing that, I measured what the rep KEYS actually cost, since "building strings
to represent types" is the thesis's second half and `repCanonKey` / `repElemKey` are its purest
instance — both take an arena type and RENDER a structural string from it.

`repCanonKey` is memoized per arena index. **`repElemKey` was not, and nothing recorded a reason.**

| | calls | memo hits | builds | characters built |
|---|---|---|---|---|
| `repCanonKey`, corpus | 51,393 | 38,145 (74.2%) | 13,222 | 127,396 |
| **`repElemKey`, corpus** | **152,090** | **0** | **152,090** | **1,139,860** |
| `repCanonKey`, self-compile | 977 | 114 | 863 | 18,764 |
| **`repElemKey`, self-compile** | **23,784** | **0** | **23,784** | **174,564** |

The twin cache now exists. It needs one more generation than `repKeyMemo`: `repCanonKeyGo` reads the
arena alone, while `repElemKeyGo`'s `TyObj` arm also asks `repSlotOfTyDecl`, so the sync compares
exactly the triple `repSlotCacheSync` does — `tyMutEpoch`, `cUserTypesVer`, `sNames.length`. Banked
at the TOP of the recursion only, because the de Bruijn back-edge `#n` is a function of the caller's
DEPTH rather than of `ty`.

| | builds | characters |
|---|---|---|
| corpus | 152,090 → **7,989** | 1,139,860 → **65,644 (−94.2%)** |
| self-compile | 23,784 → **346** | 174,564 → **5,774 (−96.7%)** |

**The gate is a dual-run**: every memo HIT recomputed from scratch and compared — **54,906 agree /
0 disagree** on the corpus, **15,445 / 0** on the self-compile. The comparator is live, proven by
banking `s + "X"`: 0 / 15,445, witnesses `memo=S0X fresh=S0`.

**NEITHER GENERATION CONJUNCT IS LOAD-BEARING ON ANY INPUT MEASURED, and I am recording that rather
than banking it as safety.** Dropping `sNames.length` from the sync leaves 0 disagreements; dropping
`tyMutEpoch` as well ALSO leaves 0. So on everything available, nothing this key depends on moves
inside the window `repElemKey` runs in. The triple is kept anyway — the alternative is an unguarded
cache resting on an emit-window invariant nobody has stated, and syncing on exactly what
`repSlotCacheSync` compares makes "the two caches are in the same generation" a one-line argument.
If that invariant is ever written down, the guard is deletable.

**PERF: UNMEASURABLE, and that is the answer.** Five warmed alternating self-compiles per side —
1.48/1.52/1.49/1.53/1.48 against 1.50/1.49/1.50/1.49/1.53. 169 KB of string building is microseconds
against a 1.5 s compile. **Sixth confirmation of the board's own framing**, and this one is the
sharpest: a change that deletes 94% of a string population moves the clock by nothing. Rank
destringify slices by what they make impossible.

Corpus A/B **0 of 2,010** on emitted-wasm sha256, exit code and diagnostic text; suite 2,159/0;
`cases_wasm` 1,939/0; fixpoint byte-exact at 1,231,848.

**What this does and does not do for the terminal item.** It removes 94% of the *building*; the keys
are still STRINGS and the interner is still keyed by NAME, so the rep-column rewrite is untouched.
What it changes is the rewrite's price: the argument for hash-consing these keys into integers can no
longer be "we rebuild 1.1M characters", because we no longer do — it has to be made on what integer
identity makes impossible, which is the same standard every other slice in this programme is held to.

### "SPELLINGS MOVE EMITTED BYTES" IS FALSE — no type spelling reaches the output at all (2026-08-19)

The terminal item below rests its blocker on one sentence, repeated in three places in this
programme: *"A re-render moves spellings, and spellings move emitted bytes."* Before designing the
rep-column rewrite around it I tested it, because every other load-bearing claim I checked today was
stronger than its measurement.

**A four-line program and a `grep`:**

```vl
type ZzUniqueSpelling = { zzFieldAlpha: i32, zzFieldBeta: string }
function zzNamedFunction(p: ZzUniqueSpelling): i32 { p.zzFieldAlpha }
const v: ZzUniqueSpelling = { zzFieldAlpha: 1, zzFieldBeta: "zzLiteralString" }
print(zzNamedFunction(v))
```

| token | in `vl build` bytes | in `vl build --names` bytes |
|---|---|---|
| `zzNamedFunction` (a FUNCTION name) | absent | **PRESENT** |
| `ZzUniqueSpelling` (the type name) | absent | absent |
| `zzFieldAlpha` / `zzFieldBeta` (field names) | absent | absent |
| `zzLiteralString` (a string literal) | absent | absent |

**The function name is the positive control** — it proves the probe is live, and it is the only
source token that reaches the module at all. The reason is structural, not incidental:
`emitNameSection` writes exactly two subsections, the module name (`"vl"`) and the FUNCTION namemap.
WasmGC struct types carry no names in the binary, so there is nowhere for a type or field spelling to
go. (String literals are absent because they are emitted as code-point data, not raw UTF-8.)

**So the sentence is false, and what is true instead is more useful.** A spelling moves bytes only
through a DECISION keyed on it:

- **dedup** — `annShapeIndexOf`, `repSlotKeySi`/`repSlotKeyN`, `structIndexByName`
- **classification** — `isUName`, `nameFieldCode`, `nameIsShapeSpanEnds`
- **order** — interning order fixes type-section indices

**Why that changes the rewrite.** The obligation was read as *preserve every spelling*, which is what
made `canonEmitName ≠ tyToEmitName ∘ nameToTy` (`ast.vl:780`) look terminal. The real obligation is
**preserve the partition and the order** — and byte-identity over the corpus is exactly the test for
that, which every slice in this programme already runs. A rewrite that keys the rep tables on a
structural identity is allowed to spell things differently, or not to spell them at all, provided two
types that merged still merge and the interning order is unchanged.

**`canonEmitName ≠ tyToEmitName ∘ nameToTy` is still true and still matters** — a differing spelling
still reaches those decisions, so a re-render can still move a merge. What it does not do is reach
the output. The distinction is the whole difference between "the keys cannot be replaced" and "the
keys can be replaced by anything that partitions identically."

**Not scheduled, and I am not starting it on my own.** It is multi-slice, it needs a structural
identity (hash-consing on the arena, i.e. an integer table rather than a rendered string), and its
first correctness question — does `annShapeIndexOf`'s partition even coincide with a type-identity
partition — has a **known negative** the code already states: `{f: K0}` and `{f: boolean}` are
layout-equal and encoding-different and must NOT merge, while two distinct arena types with equal
field codes MUST. So the target is not arena identity; it is a purpose-built structural key over the
wasm layout+encoding lattice. That is the design work, and it is an owner-schedulable item, not a
measurement.

### THE REP-COLUMN REWRITE, STEP 1: the structural identity exists and is PROVEN (2026-08-19)

`repCanonKey` / `repElemKey` render a structural string from an arena type, and every consumer uses
it for one thing: **equality**. So the string is a REPRESENTATION of a structural identity, not the
identity — the thesis's second half in its purest instance.

`repCanonId` / `repElemId` build the identity directly. Every node interns `(tag, args…)` into a
hash-consed table (FNV-1a → bucket chain, intrusive `hcNext`, rehash at 3/4 load) and returns its
INDEX, so two structurally-equal types get the same i32 and **no type spelling is ever composed**.
The recursion mirrors the string builders arm for arm — same mix-widening (the one rule now written
ONCE, in a shared `hcUnionId`, rather than the string builders' two copies), same de Bruijn
back-edge, same sentinels, same order.

**`hcLen` is the sharp part.** It carries what the string builder's answer WOULD be, in characters,
computed by the same arithmetic without rendering. It is not decoration: it reproduces the 262,144
runaway cap exactly, and it is a far tighter equivalence than partition agreement — a length matching
at every node says the two recursions have the same SHAPE, which two different recursions cannot fake.
It also caught the only real bug in the first draft: the functype arm started its length at 2 (`(` and
`)`) while the string's closer rides inside `")=>"`, an off-by-one on **19,260 of 53,622** keys that
the partition check could not see, because every functype was off by the same one.

**The proof runs inside the harness built for exactly this** — `repShadowSweep`, armed by
`$VL_REP_SHADOW`, off by default, one boolean test when unarmed. It walks the whole arena after the
bytes are final and asserts three things per key, in both vocabularies:

| | self-compile | corpus |
|---|---|---|
| (spelling, id) pairs compared | 53,622 | 229,430 |
| **false MERGE** (two spellings, one id — fuses layouts) | **0** | **0** |
| **false SPLIT** (one spelling, two ids) | **0** | **0** |
| **rendered-length mismatch** | **0** | **0** |

283,052 pairs, zero disagreements. **Sabotage** (drop the nullable wrapper from the identity):
**606 merges and 693 length mismatches**, witnesses naming the class outright
(`a=(@192|…|@200) b=(@192|…|@200)?`). The harness is live in both directions.

**Two design points worth keeping.** (1) The id→spelling assertion is PER VOCABULARY, because the two
builders share one hash-cons table and an id reached from both is *correct* — `i32` is `i32` under
either rendering, and the arms where they genuinely differ (`HC_SLOT`, `HC_RLI32`, `HC_RLSTR`) carry
their own tags. Asserting across vocabularies produced 14,355 false "merges" in the first run, every
one of them the harness being wrong. (2) The table is sid-keyed (`HC_PRIM` holds the primitive
keyword's sid, `HC_OBJ` its field names'), so `hcReset` goes in `sidKeyedTablesReset` — the function
whose header says it exists to be the one home for that pairing.

Byte-identical by construction, and verified so: corpus A/B **0 of 2,010** on emitted-wasm sha256,
exit code and diagnostic text; suite 2,159/0; `cases_wasm` 1,939/0; fixpoint byte-exact.

### STEP 2: the first consumer is switched — `repSlotKeySi` / `repSlotKeyN`

The slot cache's twin index keyed on `repCanonKey(di)`, a rendered string, in two
`{[string]: i32}` maps. It now keys on `repCanonId(di)`, and because ids are dense from 0 the two
maps become two plain arrays. **The rendered key is no longer built at that site at all.** This is a
change of REPRESENTATION with the partition held fixed — which is exactly why it cannot move a byte,
and does not.

**One hazard had to be closed first, and it was not hypothetical.** `hcReset` lives in
`sidKeyedTablesReset`, which the driver calls **inside the module-parse LOOP** (its own header calls
that "the sharpest edge the carrier has"). So the id space restarts MID-COMPILE, and everything keyed
on an id must die with it: the two `ty -> id` memos hold ids as VALUES, the slot cache holds them as
INDICES. `hcReset` now clears the memos and stamps the slot cache stale, so its own sync stays the
one place that rebuilds it.

**AND THE BYTE CHANNEL IS BLIND HERE — measured, not assumed.** Flipping the unique-twin gate from
`== 1` to `== 2`, which turns every structural-bridge answer into a decline and invents new ones,
moves **0 of 2,010** files. The bridge is nevertheless LIVE: instrumented, it is reached **664** times
and answers **223** on the corpus. So those 223 answers are byte-inert on every corpus file, and the
byte gate proves nothing about this conversion. What proves it is the identity equivalence — 283,052
pairs, 0 disagreements — and that is the whole reason the equivalence was built before the wiring.

Corpus A/B **0 of 2,010** on emitted-wasm sha256, exit code and diagnostic text; suite 2,159/0;
`cases_wasm` 1,939/0; fixpoint byte-exact at 1,243,947; harness still 0/0/0. Net size after both
steps: **+12.1 KB (1.0%)** over the pre-identity tip — the harness and the identity, less the two
string maps the wiring retired.

### STEP 3: `slotCanonKey` and the ref-list element column

Three more consumers, all the same move:

- **`slotCanonKey` → `slotCanonId`.** Every answer was a rendered key whose only use is equality, so
  it becomes the id — and the `""` "never participates in dedup" sentinel becomes `-1`. Its three
  rungs are untouched. Its dependants follow: `repStructSlotsTwin`, `repStructSlotRep`,
  `repRowOfTyStruct`, and `buildStructTwins` (whose `keys: string[]` is now `i32[]`).
- **`repElemKeyOfNameTy` → `repElemIdOfNameTy`**, and `rlElemKey: string[]` → `i32[]`. Its
  unresolvable-spelling answer `"name:<nm>"` becomes an `HC_NAME` id carrying the name's SID rather
  than the spelling — still the one place a name reaches this table, and it can never collide with a
  structural key because its tag is its own.
- **`rlSlotOfTy`** keys on `repElemId`.

**AND HERE THE BYTE CHANNEL IS LIVE, which step 2's was not.** Two sabotages, both on the shipped
tip: breaking the `rlElemKey` equality moves **21 of 2,010**; making `slotCanonId` answer a unique
value per slot (so nothing ever merges) moves **168 of 2,010**. So for step 3, unlike step 2, the
byte-identity gate is a real proof and not a vacuous one — and it holds at **0 of 2,010** on
emitted-wasm sha256, exit code and diagnostic text. Suite 2,159/0; `cases_wasm` 1,939/0; fixpoint
byte-exact at 1,243,966; harness still 0/0/0.

### STEP 4: the last two consumers — and the rep key is now NEVER a string on a real compile

`repNameCanonKey → repNameCanonId` (the name-input twin, for slot layers whose intern keys are not
struct-table indices) and `mvValCanonKey → mvValCanonId` (the one place the arena vocabulary and the
name vocabulary met — both legs were rendered keys, both are now ids). Their dependants follow:
`nestedStructNamesCompat`, `mvSlotsTwin`, and `buildVariantTwins`, whose `keys: string[]` is `i32[]`.
The runaway cap in `repNameCanonId` is unchanged and still needed — it guards `resolveAnnot`, i.e.
arena MINTING, not the render.

Byte channel live again: sabotaging both paths (break the mv-canon equality, make the variant keys
unique) moves **86 of 2,010**. The gate holds at **0 of 2,010** on wasm sha256, exit code and
diagnostic text; suite 2,159/0; `cases_wasm` 1,939/0; fixpoint byte-exact at 1,243,906; harness
0/0/0.

### THE MEASUREMENT THE WHOLE PROGRAMME WAS FOR

`repCanonKey` and `repElemKey` are now reached from **four call sites, all inside the shadow
harness** — `repShadowNote`'s human-readable message and `hcCheckKey`'s equivalence assertion — and
the harness is off by default. Instrumented on a NORMAL compile:

| rep-key strings built | at session start | now |
|---|---|---|
| corpus (2,010 files) | 165,312 builds · **1,267,256 characters** | **0 · 0** |
| self-compile | 24,647 builds · **193,328 characters** | **0 · 0** |

**On a real compile the emitter no longer builds a single character of type spelling to key a rep
table.** That is the terminal item's core, and it is a measurement rather than a claim.

**PERF: still nothing, for the seventh time.** Warmed alternating self-compiles, session-start seed
against now: 1.49/1.50/1.52/1.51 against 1.52/1.51/1.54. Deleting 193 KB of string construction from
a 1.5 s compile is invisible. The board's framing has now survived seven independent tests and one
attempt by me to quote a speed number for it anyway.

**A consequence worth stating plainly**: the `repElemKey` memo shipped earlier this session is now
exercised only by the harness, because its function is. It stays — the harness is the equivalence
proof and wants to be cheap — but its 94% figure is a historical measurement, not a live saving.

**What remains, honestly.** The rep tables are destringified. The INTERNER above them
(`internInlineShapeTy`, `registerValueUnionName`, `internFuncTypeShapes`, `structIndexByName`,
`annShapeIndexOf`) is still name-keyed, and that is a different table family with a different
partition — `annShapeIndexOf` keys on wasm field CODES and element TEXTS, deliberately splitting
`{f: K0}` from `{f: boolean}` (layout-equal, encoding-different). Converting it needs its own
structural key over that lattice, and the identity built here is the template, not the answer.

**What is now true of the terminal item.** Its blocker was stated as *"the interner keys are names,
and a re-render moves spellings, and spellings move bytes"*. The third clause is false (measured
above — no type spelling reaches the output). The second is now beside the point for the rep tables
specifically: **their key no longer has to be a spelling at all, and the replacement is proven to
partition identically over 283,052 pairs.** What remains is wiring, one consumer at a time, each
gated on byte-identity — ordinary work rather than a design question.

### THE INTERNER, MEASURED — and its cost is NOT the parse (2026-08-19)

With the rep tables done, I sized the interner before converting it, and the census re-ranked it:

| interner population | corpus (2,010 files) | **self-compile** |
|---|---|---|
| `structIndexByName` — the row lookup BY SPELLING | 207,375 calls | **258,112 calls · 2,394,078 row comparisons** |
| `nameFieldCode` — the field-code classifier | 12,414 calls · 100,214 chars | 1,267 · 6,917 |
| `shapeInnerFieldSplit` — THE PARSE | 5,237 calls · 82,106 chars | **0** |
| `annShapeIndexOf` — the dedup scan | 3,116 calls · 12,048 rows | **0** |

**The shape interner's field split runs ZERO times on the compiler's own source, and so does the
dedup scan.** Every annotation the compiler writes about itself is nominal, so the parse the terminal
item is named for is not what the interner costs there. What it costs is the **name-keyed row LOOKUP**
— 258,112 calls, each a linear walk over `sNames` with a string compare per row.

**So the slice is the lookup, not the parse**, and it is the same shape as everything else this
session: `structIndexByName` is now an incremental index rather than a scan. Incremental and not
rebuilt-on-demand because `sNames` grows THROUGHOUT collect — a rebuild-on-length-change index is
O(n) per growth and puts the same O(n²) back. `sNames` is push-only within a program (four push
sites, no in-place rename), so the index only ever needs the rows past its watermark; first match
wins, preserving the scan's duplicate-spelling semantics exactly.

**The per-program reset is load-bearing and that is MEASURED, not argued.** A watermark cannot see
`collectS`'s `sNames = []`: program B pushing as many rows as A leaves the watermark satisfied with
A's spellings still in the map. Removing the explicit `structNameIxReset()` fails **438 of 1,939** in
the shared-instance wasm harness — the same harness, and the same hazard, that
`sidKeyedTablesReset`'s header describes for its own tables.

**PERF: NOT A MEASURED SPEEDUP, and I am shipping it anyway.** Min-of-8 self-compiles: **1.55 s
before, 1.54 s after.** The corpus channel is pure noise (2,010 tiny files, dominated by
instantiation: two alternating rounds gave 13.10/12.66 indexed against 15.18/12.30 scanned). So
removing 2.4 million string comparisons is **invisible — the eighth time this session that deleting a
large string-shaped population moved the clock by nothing.** The justification is complexity, not
time: an O(rows)-per-query scan on the emitter's hottest name query is worth removing on a program
larger than anything in this corpus, and the byte gate is exact (0 of 2,010 on wasm sha256, exit code
and diagnostic text).

**A method note that cost a run.** Sabotaging the reset and testing with `VL_COMPILER_WASM` set
showed 1,939/0 — the Deno harness loads `build/vl-compiler.wasm` directly and does not read that
variable. The sabotage only reddened once the seed was actually swapped on disk. Same family as the
CWD lesson earlier in this programme: **verify the probe reached the thing you think it reached.**

### THE SHAPE DEDUP'S PRIMARY KEY IS NOW A STRUCTURAL ID (2026-08-19)

`annShapeIndexOf` walked the WHOLE struct table and re-derived the same three conditions on every
row: the field COUNT, every queried name being present, and the codes matching. Those three ARE a
key — "the row has the same multiset of (field name, field code)", and a struct's field names are
unique — so they are now computed once as a hash-consed id over `(sid(name), code)` pairs in a
canonical order. **Integers; no spelling composed.** The scan becomes a walk of one bucket.

**Exactly equivalent BY CONSTRUCTION, not merely measured.** A row in a different bucket fails
conditions 1–3 and the old scan rejected it; a row in the same bucket passes them and reaches the
element / atom-identity refinement, which is untouched. That refinement stays per-candidate because
it compares stored element SPELLINGS and its atom-identity split reads the QUERY's text — the part
of this dedup that is genuinely name-shaped, and deliberately left alone.

**Verified by dual-run, because the byte channel could be blind**: both answers computed on every
call over the corpus, **3,112 agree / 0 disagree**. The chain walk is load-bearing — stopping at the
bucket head disagrees on **75** of 3,112, so buckets really do hold several rows that only the
refinement separates.

**The SORT is not exercised by the corpus, and I am recording that rather than banking it.** Keying
the multiset in written order instead of sorted order gives **0 disagreements** — no two rows here
share a field-name set in a different ORDER at a point where dedup matters. It stays sorted, and the
reason is an argument rather than a measurement: the scan it replaces looked each queried name up
via `sFieldIndex`, so it was order-insensitive BY CONSTRUCTION, and an order-sensitive key would
silently mint a duplicate row for `{a: i32, b: i32}` against `{b: i32, a: i32}`.

Corpus A/B **0 of 2,010** on wasm sha256, exit code and diagnostic text; suite 2,159/0; `cases_wasm`
1,939/0; fixpoint byte-exact at 1,247,601.

### WHERE THE PROGRAMME STANDS

| layer | state |
|---|---|
| the type ARENA | string-free for structure and kind (`PrimName`, `LitKind`, `errKind: i32`) |
| the CHECKER's resolution | **2** name parses corpus-wide; 17,459 tree walks |
| the emitter's arena HAND-OVER | **95.2%** of interner leaf resolutions carry the recorded type |
| the REP tables | **0 characters** of type spelling built on a real compile |
| the interner's row LOOKUP | indexed; was 258,112 scans / 2,394,078 comparisons on the self-compile |
| the interner's DEDUP key | a structural id over `(name sid, code)` |
| **what is still a spelling** | the interner's STORED name (`sNames`), the element-text refinement, and `nameFieldCode`'s classifier ladder |

**The honest residue.** `sNames` is still the row's stored identity and `structIndexByName` is still
how most callers ask for a row — the index made it O(1), not name-free. Removing the NAME as the
row's identity means every caller holding a spelling must hold a type instead, which is the
hand-over programme at 95.2% and is exactly what would have to reach ~100% first.

### THE FIELD-CODE CLASSIFIER TAKES AN ARENA RUNG — 59.2% at 0 disagreements

`nameFieldCode` was the last real parse population in the emitter (12,414 calls / 100,214 characters
over the corpus, 1,267 on the self-compile), and its ladder OPENS with six string-equality tests
against the primitive keywords. A caller holding the field's recorded type already knows that answer:
since the arena went string-free, `TyPrim.primName` is a `PrimName` litunion and the test is an
`i32.eq`. The litunion and litunion-array arms are structural queries for the same reason.

So `nameFieldCodeTy(t, ty)` puts the arena in front of the ladder — the same hand-over the interner's
descent takes, one layer down, and the interner's field loop already holds `fldTy` from the recursive
slice. **CONFIRM-ONLY, and the decline is the point**: it answers only where the arena decides the
code exactly and returns to the name ladder everywhere else, because composites, closures, maps, the
nullable niches and the whole union family turn on emitter INTERNING STATE the arena does not carry.

| | |
|---|---|
| corpus field classifications covered | **2,669 of 4,510 (59.2%)** |
| agreement with the name ladder | **2,669 / 0** |
| sabotage (f64 and i64 codes swapped) | **805 disagreements** |

Corpus A/B **0 of 2,010** on wasm sha256, exit code and diagnostic text; suite 2,159/0; `cases_wasm`
1,939/0; fixpoint byte-exact at 1,247,869.

**What is left of the classifier is not leaf work.** The remaining 40.8% are the codes that depend on
what the emitter has interned — a ref-list's element slot, a map's value kind, a union's box, a
nullable niche's backing. Those are not "parse the spelling better"; they are the same question the
interner's own name-keying asks, so they move when it does, not before.

### B5 MEASURED ON TODAY'S TIP — the ruling's premise does not reproduce (2026-08-19)

B5 has sat **ANSWERED — awaiting owner ruling** because the lockstep `nodeTyIx` write at canon moved
`T.tys.length` on 61 of 1,528 programs AND moved emitted wasm sha on 4 of 1,805. I promised to
measure the SAFER variant — a separate `canonTyIx` column instead of overwriting `nodeTyIx` — without
asking for a ruling. Measured, on this tip, with today's consumer:

`canonEmitTypeNames` now records `nameToTy(c)` beside `canonCleared` at every rewrite, and the two
collect-site gates read it where the node was rewritten instead of declining. `nodeTyIx` is
untouched, so **no existing consumer changes** — the only reader is the interner's hint.

| | before | after |
|---|---|---|
| leaf hint coverage | 1,044 of 1,097 (95.2%) | **1,071 (97.6%)** |
| dual-run agreement | 1,044 / 0 | **1,071 / 0** |
| emitted-wasm sha256 | — | **0 of 2,010 moved** |
| exit code + diagnostic text | — | **0 of 2,010 moved** |
| `T.tys.length` | — | moves on **93 of 1,559** (6.0%), **+599 of 107,938 (+0.55%)**, monotone |

**THE BYTE MOVEMENT DOES NOT REPRODUCE.** The filing's 4-of-1,805 was measured against a different
consumer (`repElemKeyPortable`/`nodeTyIx`) on a base since overtaken; today's consumer is the
interner's `sTyIx` hint, which is gated and weakly consumed, and it moves nothing. So the ruling that
was requested — "is 4 moved files and +0.35% arena worth 55 of 61 disagreements?" — is now
"is **+0.55% arena, monotone, zero moved files** worth 27 more exact hints?"

**Shipped, because the fact the ruling was waiting on has evaporated and this is one unpushed
commit.** If the owner still wants to hold on the arena growth alone, reverting `4d…` is the whole
change. The numbers above are the ones to weigh, not the filing's.

Suite 2,159/0; `cases_wasm` 1,939/0; fixpoint byte-exact at 1,248,224; identity harness 0/0/0.

**What it unblocks.** The interner's remaining name-keying needs its callers to hold a TYPE rather
than a spelling, and the hand-over is the supply of those types. At 97.6% the residue is **26 leaves**:
the 24 the descent loses deeper (union/step/value-union declines), the 2 generic-alias-parameter
cases, and the `gaeApplyFieldTy` names that no node can hold. That is the honest ceiling of this
approach — the rest is not a coverage problem but a design one.

### THE ROW-IDENTITY DESIGN QUESTION, ANSWERED WITH NUMBERS (2026-08-19)

I kept writing that removing the NAME as a struct row's identity "needs a design decision" and that
its callers "would have to hold a type instead". Both halves were assumptions. I censused all 29
`structIndexByName` call sites on the self-compile:

| site | calls | share |
|---|---|---|
| **`structIndexOfLet` — `structIndexByName(lt.tyName)`** | **168,665** | **65%** |
| `isSName` | 38,115 | 15% |
| `emit_classify:7346` | 14,795 | 6% |
| `emit_classify:17917` — `ty.tyName` | 13,724 | 5% |
| `emit_classify:11354` — `ty.tyName` | 9,474 | 4% |

**The dominant caller HOLDS A NODE**, and so do the fourth and fifth. `lt` is the `LetDecl`'s
`letType` TypeRef, so `nodeTyIxOf(d.letType)` is right there. So "the callers do not have a type" was
simply wrong — three of the top five do.

**The real blocker is that the two lookups are DIFFERENT QUESTIONS, and here is the number.** Dual-run
at the dominant site, arena rung against the name:

| | self-compile | corpus |
|---|---|---|
| calls | 168,648 | 18,265 |
| arena answers | 151,321 (89.7%) | 8,201 |
| agree | **151,321** | 8,186 |
| **disagree** | **0** | **15** |
| arena-only / name-only | 0 / 0 | 0 / 2,384 |

`structIndexByName` finds the row interned under THIS SPELLING; `structIndexOfTy` finds the first row
denoting this TYPE — which may be a structurally identical TWIN interned under a different spelling.
The 15 witnesses are all inline shapes resolving one row earlier than their name does
(`nm={a:string,f:K0|null,z:f32} arena=10 name=8`).

**So the rung is NOT shipped — but I then measured what shipping it would COST, because "it is a
semantic change" is a claim and this programme prices claims.** Built the rung (arena first, name
fallback) and ran the whole gate:

| channel | result |
|---|---|
| emitted-wasm sha256 | **0 of 2,010 moved** |
| exit code + diagnostic text | **0 of 2,010 moved** |
| `deno task test` | 2,159 / 0 |
| `cases_wasm` (shared instance) | 1,939 / 0 |

**The 15 different row choices are behaviourally INVISIBLE on everything available.** That is the
hypothesis confirmed: `sTwin` merges those rows at the heap-type layer, so picking either one emits
the same module. The design question therefore does not cost what I said it might.

**It is still not shipped, and the reason is the standard rather than the risk.** Every other slice
in this session shipped on a 0-disagreement gate — a proof that the two answers ARE the same. This
one would ship on downstream inertness measured over one corpus, which is a weaker warrant, and the
residual surface is exactly the case the corpus does not contain: two rows with the same arena type
whose emitted field layouts DIFFER, which `structFieldCodesEq` exists to catch and which this rung
does not consult.

**So the owner ruling is now a one-line question with all four numbers attached:** *may a struct
row's identity be its TYPE, collapsing spelling twins?* — 65% of the emitter's hottest name query
moves to the arena if yes; 15 of 8,201 corpus cells choose a different (structurally identical) row;
0 of 2,010 files change in any channel; and the untested case is a twin pair that is not
layout-equal.

**TAKEN, after the untested case was tested.** I wrote "the gate above is already run" and that was
wrong in exactly the way that mattered: I had never run **`rep-fuzz-check.sh`** on it, and that is
the harness whose generator reaches shapes the corpus does not — which is precisely where I said the
residual risk lived. The same harness then caught the OTHER merge-enabling change on this branch as
REJECT → MISMATCH, so it demonstrably has power against this class.

Run on the rung: **`rep-fuzz-check` exact ✅**, alongside corpus A/B 0 of 2,010 on all three
channels, suite 2,160/0, `cases_wasm` 1,940/0, native fixpoint byte-exact at 1,251,227.

**It ships on evidence rather than on a proof of sameness — the one place in this programme that is
true, and it is stated at the call site.** `sTwin` already merges these rows at the heap-type layer,
which is why picking either emits the same module; if a layout-divergent twin pair ever surfaces,
`structFieldCodesEq` is the predicate that names it and this rung is the two lines to revert.

**What IS shipped: `structIndexOfTy` is now an index** rather than a linear scan of `sTyIx` — the
arena-input twin of the name index, same incremental pattern over a push-only column, same explicit
per-program reset. The reset is load-bearing and measured: removing it fails the shared-instance wasm
harness. Corpus A/B **0 of 2,010** on wasm sha256, exit code and diagnostic text; suite 2,159/0;
`cases_wasm` 1,939/0; fixpoint byte-exact at 1,248,598.

### THE ELEMENT-TEXT REFINEMENT IS **NOT** THE TWIN-MERGE QUESTION — measured (2026-08-19)

The interner's dedup has two halves: the fieldset key (now a structural id) and the per-candidate
ELEMENT-TEXT refinement, which compares the stored `sFieldElemName` against the query's field text.
I assumed the refinement reduced to the same pending ruling as the row identity — that switching it
to arena types would COARSEN it, merging spelling-distinct-but-type-identical elements. **It does
not, and the guess was wrong.**

Instrumented at the comparison over the corpus:

| | |
|---|---|
| refinement reached | 5,058 |
| row carries an element NAME | 2,454 |
| …and an element ARENA TYPE (`sFieldElemTyIx`) | **2,423 (98.7%)** |
| comparisons where the two TEXTS differ | 1,501 |
| …with an arena type on BOTH sides | 1,471 |
| **…where the arena types nevertheless AGREE (the coarsening)** | **0** |

**Zero — AND THAT ZERO IS AN ARTIFACT. THE MEASUREMENT WAS BROKEN AND THE CONCLUSION BELOW IS
RETRACTED.** The probe compared RAW ARENA INDICES, and arena indices are not canonical for structural
identity: the checker mints fresh entries in many places and only `resolveAnnot`'s memo dedups per
spelling, so two entries for the same type routinely carry different indices. Instrumented properly —
comparing the row's banked `sFieldElemTyIx` against a query-side peel of the same element, by
`repCanonId` — the picture inverts:

| comparator | agree | **disagree with the text verdict** |
|---|---|---|
| raw arena index | 710 | **1,233** |
| `repCanonId`, code-15 nullable peel wrong | 828 | **1,115** |
| `repCanonId`, code-15 peel fixed | 900 | **1,043** |

The residue is **codes 16 and 19, and it is a real coarsening**. For those codes the row banks a
DIFFERENT VOCABULARY from the field text: a map field (19) banks its VALUE name while the text is the
whole `{[string]: V}` spelling, and a union field (16) banks the recorded union name (`K|f64`) while
the text is the softened render (`string|f64`). So the text comparison answers "distinct" for
essentially every map-field shape, and an arena comparison answers "same" — merging shapes the
interner deliberately keeps apart. **The byte channel agrees: taking it breaks 2 of 2,010 files**, one
of them loudly (`emitProgram: binding's inline-shape type has an unsupported field`).

**So the element refinement DOES carry a semantic question after all, and it is not the same one as
the row identity — it is narrower and uglier**: the refinement compares a banked element name against
a field TEXT that, for two codes, is not the same kind of string. Converting it means first making
those two vocabularies agree, which is the "one home for the per-code element extraction" refactor,
and only then is there an equivalence to measure.

**Three tries, three wrong answers, and the third one is the finding.** The lesson is the same one
this board keeps recording in different clothes: *an equality test is only as good as the identity it
compares.* Raw arena indices are not an identity; `repCanonId` is, which is why it had to be built
first — and even with it, the two sides must be speaking about the same thing before agreement means
anything.

**The row side is well covered** — 2,423 of 2,454 (98.7%) carry `sFieldElemTyIx` — so the sidecar is
not the problem. The problem is stated above: the query side must peel the element out of `fldTy`
with a ladder mirroring the mint's per-code extraction, and for codes 16 and 19 the mint banks a
different vocabulary from the text the query holds. Population: 1,943 comparisons corpus-wide and
**0 on the compiler's own source**.

**So the pending list is TWO items after all**, and I put it at one prematurely:
1. may a struct ROW's identity be its TYPE, collapsing spelling twins? (15 of 8,201 cells, 0 of 2,010 files move — priced, an owner call)
2. should the map- and union-field element vocabularies be unified with the field text, so the refinement HAS an equivalence to measure? (a refactor first, then a measurement — not yet an owner call)

### THE ELEMENT REFINEMENT IS A CONSTANT FALSE ON FIVE OF NINE CODES (2026-08-19)

Item 2 of the pending list — "unify the map/union element vocabularies with the field text" — was
mine to do, not the owner's, so I did it. It did not land, and what it turned up is better than the
change would have been.

**First, the measurement that names the problem.** Per field CODE, how the refinement's element
comparison actually answers over the corpus:

| code | `en == bi` | `en != bi` | |
|---|---|---|---|
| 0 scalar / litunion atom | 249 | 32 | works |
| 4 litunion array | 57 | 4 | works |
| **5 ref list** | **0** | **399** | **never matches** |
| 15 nested struct | 371 | 80 | works |
| 16 value union | 276 | 20 | works |
| **19 map** | **0** | **750** | **never matches** |
| **28 nullable ref list** | **0** | **31** | **never matches** |
| **29 nullable map** | **0** | **54** | **never matches** |
| **30 nullable litunion** | **0** | **131** | **never matches** |

**Five codes, 1,365 comparisons, zero matches.** For those the two sides are different KINDS of
string by construction — a map field banks its VALUE name against a whole `{[K]: V}` text, a ref list
its ELEMENT name against `X[]` — so the comparison is a constant false and **any shape carrying one
of those fields never dedups at all.** (This also corrects the previous entry's guess that code 16
was a vocabulary mismatch: it matches 276 of 296.)

**The fix looked trivial and DRY**: `shapeFieldElemName(text, code)` is already the ONE HOME the mint
uses to derive the element name, so ask the query's text the same question instead of comparing the
raw spelling. All five codes came alive — 5 → 109/28, 19 → 192/4, 28 → 8/6, 29 → 10/8, 30 → 30/2.

**And it breaks 5 of 2,010 files**, four with the loud `emitProgram: binding's inline-shape type has
an unsupported field`. Adding the map KEY half — the dimension `recordSFieldElemRow`'s own header
names ("an mv slot's identity is the (KEY, VALUE) pair") — **does not fix them**: still 5.

**I said this was "a fact about the table, not a fix" and that the missing dimension was unknowable
without a design ruling. WRONG AGAIN — one more probe named it, and it is not a hidden identity
attribute at all.** Dumping every merge the unified comparison would create shows what the merged
rows ARE:

```
MERGE row=1 f=by  code=19 rowElem=string qText={[i32]:string}    rowName=Names
MERGE row=2 f=f   code=19 rowElem=i32    qText={[string]:i32}    rowName=T0
MERGE row=0 f=xs  code=5  rowElem=K[]    qText=K[][]             rowName=SInline
```

**Every one is an INLINE annotation matching a DECLARED struct row of the same shape.** That merge is
correct — it is exactly what the dedup is for. What broke is downstream: the shared row's `sNames`
entry says `Names`, so a later `structIndexByName("{by:{[i32]:string}}")` found nothing, and the
binding failed with "inline-shape type has an unsupported field". **The row is shared; the NAME had
to be too.**

So the missing dimension was the name-keying itself, and the causation runs the OPPOSITE way from
what I wrote: the dedup is not crippled because a row's identity is unknown — **it is crippled
BECAUSE the lookup is name-keyed**, and the constant-false was compensating.

**SHIPPED**, in three parts:

1. **The vocabulary is unified** — both sides ask `shapeFieldElemName(text, code)`, the ONE HOME the
   mint already uses, instead of comparing a banked element name against a raw composite text.
2. **The map KEY half is compared** — `recordSFieldElemRow`'s own header states it ("an mv slot's
   identity is the (KEY, VALUE) pair") and `shapeFieldElemName` answers only the VALUE.
3. **A merged spelling is ALIASED onto the row it matched** (`structNameAlias`), in the name index
   rather than by a second `sNames` entry, because that column is parallel to the field arrays.

Five previously-dead codes come alive: 5 → 109/28, 19 → 192/4, 28 → 8/6, 29 → 10/8, 30 → 30/2.

**And it retires a loud REJECT.** `closures/error-nullable-elem-closure-field-array-lambda-sig-twin.vl`
pinned *"a nullable-{…} list element has no rep; use a non-null element type"* for
`() => ({f: () => string} | null)[]`. That element's shape now dedups onto the row that already
carries its rep instead of minting a second, un-repped one, so the composition resolves — **and it
runs, printing `frb`**. Verified by RUNNING it, not by the absence of a diagnostic; the fixture is
converted from `@emit-error` to `@run` + `@log`, with its header rewritten to say what changed.

Corpus A/B **1 of 2,010** on wasm sha256 and 1 on diagnostics — that same fixture, in the direction
of MORE programs compiling; suite 2,159/0; `cases_wasm` 1,939/0; fixpoint byte-exact at 1,249,541;
identity harness 0/0/0.

**Four wrong answers, then the finding.** Raw arena indices are not an identity. `repCanonId` is, but
both sides must speak the same vocabulary. And when they finally do, what surfaces is not a missing
attribute — it is the name-keying, standing where a structural identity should be.

### "WHAT IS A STRUCT ROW'S IDENTITY?" — ENUMERATED, AND THE ENUMERATION IS COMPLETE (2026-08-19)

I closed the last round saying a row's identity "is enumerated NOWHERE, so every attempt to replace a
spelling comparison guesses at a list nobody has made", and called that the blocking design question.
**The list is derivable — from the comparison that was already making it, one dimension at a time.**
`annShapeIndexOf`'s own body names all five:

| dimension | where it came from |
|---|---|
| field-name sid | the count + name-set conditions |
| field code | the code condition |
| element-name sid (`-1` for none) | the element comparison, now speaking one vocabulary |
| map-KEY bit | `recordSFieldElemRow`: *"an mv slot's identity is the (KEY, VALUE) pair"* |
| litunion-ATOM bit | the two atom-identity arms that keep `{f: K0}` off a `{f: boolean}` row |

`shapeFieldSetIdOf` now hash-conses exactly that tuple per field, sid-sorted so field ORDER cannot
change the key, and the interner's bucket is keyed on it. **The identity is a written-down list in
one function, which is what did not exist.**

**AND IT IS COMPLETE, checked rather than asserted.** The refinement still runs and still decides, so
the key only narrows candidates — an incomplete enumeration would show up as a candidate the
refinement rejects. Measured over the corpus: **2,360 bucket candidates accepted, 0 rejected.** Every
row the identity selects is the row the full comparison would have chosen. The refinement is
therefore provably redundant on everything available, and it stays anyway — because "checked
everywhere, asserted nowhere" is what makes the claim worth having.

Corpus A/B **0 of 2,010** on wasm sha256, exit code and diagnostic text; suite 2,159/0; `cases_wasm`
1,939/0; fixpoint byte-exact at 1,251,331.

**What this settles.** The question was never a language or ABI ruling. It was a list that nobody had
written down, and the reason nobody had is that four of its five dimensions were only expressible as
string comparisons — so the list could not be stated until the vocabularies agreed and the sids
existed. It reads as a design question right up to the moment the enumeration is possible, and then
it is just a function.

**What is still name-shaped, honestly.** `sNames` remains the row's STORED spelling and
`structIndexByName` remains how callers ask — now indexed, aliased on merge, and no longer the row's
IDENTITY, which is the change that matters. Callers hold spellings because they read annotations;
moving them to types is the hand-over programme at 97.6%, and its residue is 26 leaves that are
declines by design rather than coverage gaps.

### THE ARENA HINT CAUGHT A NAME-GRAMMAR MIS-ORDER — 31% of the descent's leaves were SPURIOUS (2026-08-19)

Chasing the last 25 unhinted leaves, the step-miss witnesses named themselves the moment I printed
the arena type beside the name:

```
ELEMMISS nm=()=>(f64|null)[]                    ty=() => (f64 | null)[]
ELEMMISS nm=()=>((i32|boolean)[]|null)[]        ty=() => ((i32 | boolean)[] | null)[]
ELEMMISS nm=((i32)=>i32)[]|((string)=>i32)[]    ty=((i32) => i32)[] | ((string) => i32)[]
```

**The arena is right and the NAME PEEL is wrong.** `nameIsElemArray` only asks whether a name ENDS
in `[]`, so it claimed a FUNCTYPE whose result is a list — `() => (f64 | null)[]` — and peeled the
whole name as an array, descending a type the name does not denote. `internShapeDeepTy` ordered its
grammar array-before-arrow; `internFuncTypeShapes`, its own twin, has always ordered it
arrow-before-array.

**It had no detector until the hint arrived.** The mis-peel interns extra shapes rather than wrong
ones, so nothing reddened: not the corpus, not the suites, not the fixpoint. What surfaced it was a
LOST HINT — the arena declining a step the name had taken.

**Fixed by moving the functype arm above the array arm**, and the effect is larger than the residue
it was chasing:

| | before | after |
|---|---|---|
| leaf resolutions in the descent | 1,097 | **753 (−344, −31%)** |
| carrying an arena hint | 1,071 (97.6%) | **737 (97.9%)** |
| dual-run agreement | 1,071 / 0 | **737 / 0** |

**344 of the descent's 1,097 leaf resolutions were spurious** — work done on names the descent had
mis-parsed. Corpus A/B **0 of 2,010** on wasm sha256, exit code and diagnostic text confirms they
were no-ops, which is why nothing had ever caught them.

**This is the hand-over paying for itself in a way the programme did not predict.** The arena hint
was built to remove parses; what it did here was act as a CHECK on the name grammar — two independent
derivations of the same structure, disagreeing exactly where one of them is wrong. That is the same
shape as every dual-run in this session, except the subject is the compiler's own name-parsing rather
than a value.

Residue now **16 leaves of 753**, suite 2,159/0, `cases_wasm` 1,939/0, fixpoint byte-exact at
1,251,331.

**AND THE ORACLE FOUND A SECOND ONE IMMEDIATELY.** Re-running it on the new residue:

```
NULMISS nm=(i32)=>string|null   ty=(i32) => string | null
NULMISS nm=(i32)=>P|null        ty=(i32) => P | null
```

`nullablePartOf` claimed a name whose top-level ARROW binds the `| null` to its RESULT. That is not
a subtle case — it is a rule `internFuncTypeShapes`' own header states, **with a fuzz-found
invalid-wasm consequence attached**: *"the naive peel treated it as a nullable CLOSURE and the
`f64 | null` result never surfaced"*. The twin had the fix; the descent did not.

So the functype arm moved once more, above the `| null` peel as well as the `[]` one — the order
`internFuncTypeShapes` has always used. Coverage **737 → 743 of 753 (97.9% → 98.7%)**, dual-run
**743 / 0**, corpus A/B **0 of 2,010** on all three channels, residue **10 leaves**.

**Two name-grammar mis-orders in one sitting, both found the same way, neither visible to any
existing channel.** The pattern is now explicit and reusable: **where the arena declines a step the
name took, the name grammar is wrong.** That is a standing diagnostic, not a one-off — and it is the
strongest argument this programme has produced for carrying the type alongside the spelling, better
than any parse count.

### A THIRD MIS-ORDER, SAME ORACLE — and this one moves NO coverage, which is the honest part (2026-08-19)

Pointed at the last 10 leaves, the diagnostic named a third class, and every remaining witness is one
name shape:

```
MAPMISS  nm={[string]:()=>i32}|{w:i32}|null   ty={[string]: () => i32} | {w: i32} | null
ELEMMISS nm=(boolean|string)[]|(i32|f64)[]    ty=(boolean | string)[] | (i32 | f64)[]
FLDMISS  f=z in {a: boolean, f: () => {…}, z: i32} | {w: i32}
```

**A name with a TOP-LEVEL `|` reaching the composite arms.** The paren-carrying union branch interned
its arms and then FELL THROUGH — deliberately, per its comment ("closure unions etc. keep their
existing path") — into the `[]`, map and inline-shape peels, each of which then claimed the whole
union as though it were the composite its FIRST arm happens to be. The arena says `TyUnion` and
declines the step; that is how it surfaced, exactly as the other two did.

The fall-through now returns, as the paren-free branch always did. The path its comment protected
runs ABOVE this point since the functype arm moved, so nothing depends on it.

**AND IT MOVES NO COVERAGE — still 743 of 753 (98.7%), residue still 10.** The mis-peels were not
producing hinted leaves; they were producing WORK on names the descent had mis-parsed. So this one is
a hygiene fix in the same family, not a coverage win, and saying otherwise would be the kind of claim
this board exists to catch. Corpus A/B **0 of 2,010** on all three channels, suite 2,159/0,
`cases_wasm` 1,939/0, fixpoint byte-exact at 1,251,334.

**THREE MIS-ORDERS, ONE DIAGNOSTIC, AND THE RESIDUE IS NOW THE POINT.** The last 10 leaves are what
the descent genuinely cannot type — not mis-parses. The family is closed: `internShapeDeepTy`'s
grammar now orders arrow → nullable → union → array → map → shape, which is
`internFuncTypeShapes`' order, and the two twins agree for the first time.

### THE HAND-OVER'S STRUCTURAL CEILING — all 10 residual leaves attributed (2026-08-19)

With the three mis-orders fixed, the residue is 10 of 753 and every one is now attributed to its
source rather than left as a count:

**CORRECTED — the first cut of this table said "3 are nodes the checker recorded no type for at all",
and that was a guess I then went and checked.** A probe at the collect root, counting shape-spelled
`TypeRef` nodes whose `nodeTyIx` is -1, finds **ZERO**. The checker records a type for every one. I
also guessed the alias-parameter gate might be over-rejecting on FIELD names (a program declaring
`type Foo<d>` would make the identifier `d` gate any name mentioning it, including the field `d` in
`{d:i32}`) — dumping the gate's actual firings shows it hits **only** `{a:Sx}` and `{a:K[]}`, where
`Sx` and `K` are genuine alias parameters. Both guesses wrong; here is what the residue actually is,
by LOSS POINT:

| loss point | count | witnesses |
|---|---|---|
| **no root — a name BUILT by substitution** (`gaeApplyFieldTy`) | **4** | `{x:i32,y:i32}`, `{a:string[]}`, `{a:i64}`, `{a:f64}` |
| **the generic-alias-PARAMETER gate** | **2** | `{a:Sx}`, `{a:K[]}` — verified genuine |
| **a value-union arrival** | **1** | `{a:Sx}` — `registerValueUnionName` is a box registration, not a shape intern |
| **an untagged decline inside the arm / functype paths** | **3** | `{d:i32}` ×2, `{g:f64}`, `{a:i32,b:i32}` — the union-arm coverage flag declining, or a functype interior |

**So the hand-over is at its structural ceiling: 4 impossible by construction, 2 deliberate and
verified, 4 declines by design.** 98.7% is not a coverage shortfall with 1.3% of work left in it — it
is the whole population minus the part that cannot exist.

**Where the session's descent numbers ended up**, and the shape of the change matters more than the
percentage:

| | at session start | now |
|---|---|---|
| leaf resolutions in the descent | 1,097 | **753** (344 were spurious mis-parses) |
| carrying an arena hint | 409 (37.3%) | **743 (98.7%)** |
| dual-run agreement | 411 / 0 | **743 / 0** |
| residue | 688, unattributed | **10, every one named** |

The first row is the one worth reading twice: a third of the descent's work was on names it had
mis-parsed, and no channel in this project could see it until the arena was carried alongside to
disagree.

### THE TERMINAL ITEM, NAMED: the interner walks types by CUTTING SPELLINGS

Following site 3 past its name-keyed floor reaches the root of the whole programme, and
`internInlineShapeTy`'s own header states it as a measurement rather than a gap:

> **"THE OTHER FOUR CALLERS ARE NOT HINTABLE AND THAT IS THE MEASUREMENT, NOT AN OMISSION."**
> 1,046 of the 1,064 `sTyIxOfName` resolutions arrive from `internShapeDeep`'s peeled leaf
> (873), `internFuncTypeShapes` (116), the nested-field recursion (56) and
> `internShapeFieldElems` (5) — **each of which composed `nm` by CUTTING a larger spelling, so
> no caller holds a bank for the cut.**

That is the terminal blocker, and it is architectural rather than per-site. **A cut substring
was never a node**, so there is no arena index to hand over — the hand-over pattern that
closed the two slices above cannot reach it by construction.

`internShapeDeep` (102 lines, 12 call sites) is the machine: every branch is a spelling
grammar — peel a whole-name group, split union atoms, peel `| null`, find an arrow, peel `[]`,
slice a map's value. Its whole job is to walk a type by cutting its name.

**Two of its three external entry points DO hold a node** (`emit_collect:4045`
`if tn is TypeRef`, and `:4378` `tyNameOf(fnode.fdType)`), so an arena-fed root is available —
and that is the shape a fix would take. **But it does not close, for a reason the tree already
records**: the interners it drives are keyed by NAME (`internInlineShapeTy(nm, tyIx)` takes a
name; `registerValueUnionName`, `internFuncTypeShapes` likewise), so an arena descent must
render a name at every leaf, through `tyToEmitName` — and **`canonEmitName` is NOT
`tyToEmitName ∘ nameToTy`** (`ast.vl:780`, measured three times in the programme doc). A
re-render moves spellings, and spellings move emitted bytes.

**So destringifying the interner requires destringifying its KEYS first.** The rep tables must
key on arena identity instead of spelling — the rep-column rewrite. That is the terminal work
item of this programme, it is multi-slice, and its first step is the **B5/`canonTyIx` owner
ruling** (arena identity after canon), which is exactly why B5 gates band 1.

> **SUPERSEDED 2026-08-19 ON TWO COUNTS.** (1) B5 does NOT gate band 1 — four hand-over slices
> shipped without it, and it now owns 27 of the 53 leaves still unhinted. (2) The "spellings move
> emitted bytes" premise above is **false**: no type, struct or field spelling reaches the output in
> either emit mode, proven by a probe with a live positive control (see the section above). The
> rewrite's obligation is to preserve the PARTITION and the ORDER, not the spellings — and the
> target is a structural key over the wasm layout+encoding lattice, not arena identity, because
> `annShapeIndexOf` deliberately splits `{f: K0}` from `{f: boolean}` while merging distinct arena
> types with equal field codes.

**Everything below the interner is now closed or accounted for:**

| population | state |
|---|---|
| bare-name leaf resolutions (6,161) | **CLOSED** — the rung |
| the `synthTypeRef` hand-over | **mechanism shipped**, first site converted |
| `monoSubstAnn` at `monoSubstLetType` | **REFUTED** — 28 sites, half of them holes |
| site 3 · `declTyIxOfName` (1,138) | at its **name-keyed floor** |
| sites 1+2 · the interner (970) | **not hintable by measurement**; needs the rep-column rewrite |

### SITE 1 TRACED TO THE END — it is the INTERNER, and its hint route is already refuted

Site 1's 553 parses are `repElemKeyOfNameTy` reached with no hand-over (`ty < 0`). I tagged
the three no-hint `rlSlotByName` callers — `emit_collect:1757` (annotated ref-list),
`emit_sections:3424` (inferred ref-list return) and `wasmEmit:5096` (array literal) — and all
three measure **0 parses**. So they are not the source, and the guess I would otherwise have
converted (the array-literal site, whose node carries a recorded type) would have been a
no-op.

They come through `rlInternName` — **the INTERNER** — which has 7 no-hint call sites across
`emit_collect` and `emit_classify`. And that route is not open: `rlInternNameTy`'s own header
states the rule (*the arena leg can front a FIND; it must NOT front a MINT*) and records that
`repElemKeyOfNameTy`'s construction covers **two shipped hint sites and REFUTES the two
node-bank ones** — which is B6's measurement, where threading the node bank MIXES VOCABULARIES
at **215 of 299 on index and 13 of 299 on `repCanonKey`**.

**So the annotResolve half is now traced end to end, and both halves are genuinely blocked —
for two different, measured reasons:**

| site | parses | why it does not move |
|---|---|---|
| 3 · `declTyIxOfName` | 1,138 | at its **name-keyed floor** — two rungs plus an 88.5% memo; the floor is the count of distinct spellings |
| 1 · `rlInternName` | 553 | the hint must not front a MINT; the node-bank route is **B6-refuted**, and B6's residue is **BLOCKED behind B5** |
| 2 · `slotCanonKey` | 417 | same interner family |
| 4 | 0 | not exercised; kept with its measurement |

**RE-MEASURED 2026-08-19 — THIS PARAGRAPH IS SUPERSEDED. The three arena-hand-over slices above
shipped WITHOUT B5, so it gates nothing; what it now owns is 53 of the 79 leaves still unhinted
(67.1%), i.e. the difference between 92.8% and ~97.6% coverage. Read the ruling against that
number, not the one below.**

**THIS PROMOTES B5 FROM A PARKED ROW TO THE THING GATING BAND 1.** `B5`/`canonTyIx` is filed
**ANSWERED — awaiting owner ruling**: the lockstep `nodeTyIx` write at canon closes 55 of 61
disagreements losing 0 agreements, suites identical, but **`T.tys.length` moves on 61 of 1,528
programs** (monotone append, +0.35%, 0 shrink), and the safer variant is a separate `canonTyIx`
column instead of overwriting `nodeTyIx`. With today's measurements attached, the ruling now
has a concrete population behind it rather than a principle: **B5 → B6's node-bank residue →
site 1's 553 + site 2's 417 = 970 of the 2,108 remaining `annotResolve` parses**, which is the
last tractable destringify population that is not the rep-column rewrite.

### THE MONO HALF'S ROOT, sized: `monoSubstAnn` ALREADY HAS AN ARENA TWIN IN THE TREE

The three remaining `synthTypeRef` sites in `emit_mono` (`:687`, `:739`, `:831`) do not hold
an index, because the monomorphizer substitutes on the SPELLING:
`emit_base.monoSubstAnn` splits a union on `|`, decomposes a generic application, splits
object fields and REBUILDS the type with `+`. That is the thesis's second half — *building*
strings to represent types — in its purest form.

**It is written twice, in two representations.** `typecheck.substTyDeep` (`:14570`) is the
same operation on the arena: deep substitution of bindings into a type, rebuilding a
composite only when a child actually changed so a concrete type keeps its arena identity. It
has 10+ callers in the checker. The emitter substitutes on the spelling; the checker
substitutes on the type; neither knows about the other.

**The naive conversion is a trap, and the tree already records why.** Routing
`monoSubstAnn`'s callers to `substTyDeep` and re-rendering means going through
`tyToEmitName`, and **`canonEmitName` is NOT `tyToEmitName ∘ nameToTy`** — stated at
`ast.vl:780` and measured three times in `destringify-types-program.md` (`:16050`, `:24205`,
`:25210`). A re-render moves spellings, and spellings move emitted bytes.

**The SAFE shape is additive, and the hand-over form above is what makes it available.**
Keep `monoSubstAnn` producing the name exactly as today — so no spelling moves and no byte
can — and compute the TYPE with `substTyDeep`, handing it to `synthTypeRefTy`. The parse
disappears; the spelling is untouched. The equivalence to measure before shipping is then a
clean one, and it is a dual-run of the kind that has now worked twice today:

> `substTyDeep(nodeTyIxOf(letType), tvN, resolve(tvV))` ≡ `nameToTy(monoSubstAnn(ann, …))`,
> compared by RENDER, over the corpus.

**MEASURED, AND IT REFUTES THE SLICE — do not take it.** The open fact was what the checker
recorded for a generic annotation's node. Instrumented at `monoSubstLetType`'s substituting
branch over the whole corpus:

| what `nodeTyIxOf(letType)` holds | count |
|---|---|
| `TyVar` — `substTyDeep`'s first arm handles it | **14** |
| an inference HOLE — it does not | **14** |
| negative / concrete | 0 / 0 |

**28 occurrences corpus-wide, split exactly half.** So this site is not worth a conversion at
any risk: the population is negligible, and half of it would need a hole story
`substTyDeep` does not have. **My own "root of the mono half" framing above was too strong** —
`monoSubstLetType` is one of `monoSubstAnn`'s 13 call sites, and the mono half's 1,993 parses
came overwhelmingly from elsewhere (1,146 of them bare names, already closed by the rung).

What survives the refutation is the OBSERVATION, which is still worth carrying: the same
substitution is written twice in two representations, and if the mono half is ever converted
wholesale, `substTyDeep` is the existing arena home to converge on rather than a thing to
build. Size the target by CALL SITE first — this one cost a probe to learn.



## A bare `return` in a void function had NO LOWERING — found while implementing the void ruling (2026-08-18)

`function g(c: boolean) { if c { return } print("after") }` — the ordinary guard clause —
was `vl check`-clean and then `emitProgram: bare return is not supported`. **An early return
from a void function could not be written in VL at all.** Found by probing underneath the
void ruling rather than from any filed row.

**It was completely unpinned, and that is why it survived**: the corpus A/B that shipped the
fix moved **0 verdicts and 0 bytes over 2,005 files**, because not one fixture used the
construct. A hole with no fixture and no filed row is invisible to every sweep this board
runs — the same shape as `D15`, one ruling over.

The lowering is the wasm `return` opcode with nothing pushed, and it needed no arity
reasoning of its own because **the checker is already the gate**: a bare `return` in a
value-returning function is refused there by NAME of the type it owes (`return needs a
value of type i32`), so an EMPTY result type is the whole population the emitter arm can
see. `fRetVoid` is read position-keyed via `fnStmtsPosOf`, the same way `emitFuncBody`'s
fall-through reads it, rather than re-derived from the annotation; anything that channel
cannot answer for keeps the old loud reject rather than guessing an arity, since a `return`
that leaves the stack wrong is invalid wasm and strictly worse than the message it
replaces.

Both sides are pinned now (`statements/bare-return-void-early-exit.vl` over four shapes —
guard clause, inside a loop's block structure, a lambda body, and TAIL position where the
terminator still has to be written — plus `error-bare-return-in-value-fn.vl` for the
checker's half).

**Still open in this family, and now the void ruling's implementation queue:**

| | shape | column |
|---|---|---|
| **D15** | `call<T>` at `T = void` | check-clean **invalid wasm** |
| (a) | `return <void expr>` in a void function | check reject; the ruling says allow |
| (b) | `() => i32` into `() => void` (the `done()` wart) | check reject; the ruling says allow |

(a) and D15 share the lowering — this slice built the terminator half of it.

## BAND 1 — `TyPrim.primName` was a comment over a `string`; it is now a declaration (2026-08-18)

The type arena held its primitive vocabulary as a raw `string`, with the closed set written
out **in a comment above the field**: *"`primName` is one of \"i32\" | \"i64\" | … | \"never\""*.
That is F2/#1402's template exactly — a closed vocabulary IS a literal union, and every
comparison becomes an `i32.eq` against an interned atom **with the source text unchanged**.

**Census, in the unit that decides the work.** 176 `.primName` sites over 5 files
(typecheck 97, emit_rep 48, emit_classify 29, check_query 1, wasmEmit 1); **154 are
comparisons against a literal**; **9 producers, every one a literal `mkPrim("…")` call** at
arena init; and — the number that made the absence marker a non-question — **0 sites
compare the readers to `""`**. So `primNameOf`/`tyPrimNameOf` return `PrimName | null`, the
idiom the language already commits to, and the empty marker that was never tested for is
gone. Four consumers spell the name rather than decide on it (two rep-KEY builders, the
`as`-target spelling canon writes back, one niche render); they route through an exported
`primNameStr`, which is the only new surface.

**Result: 0 verdict changes and 0 emitted-byte changes across 2,005 corpus files**, full
suite 2,157/0, fixpoint holds, self-lint + fmt clean.

**PERF: MEASURED NEUTRAL, and that is the finding.** Interleaved min-of-5 against the
immediately preceding seed:

| workload | before | after |
|---|---|---|
| `vl check compiler/` | 4,692 ms | 4,710 ms (**−0.4%**) |
| self-compile | 1,548 ms | 1,566 ms (**−1.2%**) |

Both inside noise — an earlier run of the same pair read **+1.6%** on the self-compile, in
the other direction. **Do not quote F2's −9.4% as the expected shape for this class.** F2's
`tok.kind` is compared once per TOKEN in the lexer and parser; `primName` is compared once
per TYPE DECISION, which is orders of magnitude rarer, and the site count (154 vs 561) was
never the axis. A closed-vocabulary conversion is worth what its site FREQUENCY is worth,
not what its site COUNT is.

**Kept anyway, on the other axis.** It is band 1's thesis executed on the type arena itself,
and it buys a real property the string could not: **the checker is now a COMPLETE ORACLE for
the vocabulary** — a mistyped primitive name is a hard type error at all 176 sites instead of
a silently-false comparison. The comment became a declaration.

## PERF — the shipped seed is UNOPTIMISED, and it is worth 3.3% (2026-08-18)

Fell out of the `O-release-rung-default` ruling: `build/vl-compiler.wasm` is **1,224,039 B** while
the same module measures 918,258 B at `-O`, so the compiler every `vl` invocation runs through has
never had `wasm-opt` applied to it. Measured rather than assumed, because the size gap invites a
much larger claim than the timing supports.

| rung on the SEED | size | self-compile | delta |
|---|---|---|---|
| none (shipped) | 1,225,945 B | **1,521 ms** | — |
| `-O` | 1,004,649 B | **1,471 ms** | **−3.3%** |
| `-O3` (RELEASE_PASSES) | 1,004,825 B | **1,479 ms** | **−2.8%** |

Interleaved min-of-5, all three seeds alternating within each round, after a warm run each — the
first uninterleaved pass reported **−9.4%** and that was warm-up drift, not signal. **Behaviour is
identical and verified, not assumed**: all three seeds self-compile to a BYTE-IDENTICAL module
(sha256 `38efab35dec8d442`), and `cases_wasm` is 1,937/0 under the `-O3` seed. `-O` beating `-O3` on
this workload is the `sort-heap` shape again — the compiler is array- and string-heavy.

**Two things worth carrying:**

* **It is not a free pipeline change, and that is why this is filed rather than taken.** Publishing
  an OPTIMISED seed puts it out of byte-agreement with what `refresh-compiler.sh` produces from
  source, so the fixpoint gate — which is a BYTE equality, `stage3 == stage4` — would need to be
  re-stated as behaviour-equality or the optimizer would have to run inside the refresh. The
  distributed `vl` binary would also shrink by ~220 KB, since the seed is embedded. Owner call, with
  the numbers now attached.
* **A CROSS-CHECK ON P9 that the P9 row should carry.** Binaryen's ENTIRE pipeline over the whole
  compiler is worth 2.8–3.3% on the self-compile. P9 is filed at ~5.6% "at the default rung". Those
  are different workloads — P9's number is generated-program runtime on the bench suite, not
  compile time — but a single emitter-side pass claiming nearly twice what all of `wasm-opt` buys
  on this workload should be re-derived on the self-compile before it is scheduled against the
  ruling's "overall self-compile time" bar.

## C8's Writable half, shipped: the container-ELEMENT storage class (2026-08-18)

The A9 ruling said the Writable half is a free win — check-clean invalid wasm becoming a loud
reject, with no working program to protect. Built and measured; it is.

**The filed axis would have been wrong again.** `objShapeAdapterless` walks containers looking for
an OBJECT pair, so `i32[]` into `(i32 | null)[]` reached its nullable peel and came out as two equal
`i32`s. The peel is right for a scalar POSITION and wrong under a container, because an array's wasm
type is fixed by how its element is STORED. So the rule is a storage-CLASS test, and a
type-identity test — the obvious first cut — rejects working code on its first line:

| widening | verdict | why |
|---|---|---|
| `C[]` → `(C | null)[]`, `string[]` → `(string | null)[]`, `i32[][]` → `(i32[] | null)[]` | **RUNS** | a nullable ref is the same wasm reftype |
| `boolean[]` → `(boolean | null)[]`, `K[]` → `(K | null)[]` | **RUNS** | niche: the sentinel lives in the element's own value space (i32 `2`, atom `-1`) |
| `i32[]`/`i64[]`/`f64[]` → their `| null` twins | **no lowering** | the destination BOXES the element |
| `K[]` → `string[]` | **no lowering** | an interned i32 atom for a ref |
| `i32[]` → `f64[]` | **no lowering** | element width |

`ESC_UNKNOWN` always declines — a hole, a type variable or any unnamed shape is never claimed on a
guess, which is what keeps `first<T>(ys: T[])` over an `i32[]` working. The nested pair is tried
FIRST, so `i32[][]` → `(i32 | null)[][]` reports the INNER array pair and names the outer as what it
was reached through.

**Corpus A/B over 2,005 files: 2 verdict changes, and 1,640 of 1,640 emitted modules
BYTE-IDENTICAL.** Both movers are `@emit-error` closure fixtures whose own headers describe this
exact defect — a lambda self-inferring the bare list arm where the annotation's element is the union
box — so both are emit-reject → CHECK-reject tier moves with the verdict unchanged. Gate green:
`deno task test` 2,157/0, `cases_wasm` 1,937/0, native fixpoint holds, self-lint + fmt clean, LSP
bundle rebuilt.

**Method note worth keeping: a seed resolved relative to CWD is a silent no-op.** The first
post-patch grid run reported the fix doing NOTHING, because `vl` resolves
`--compiler` → `$VL_COMPILER_WASM` → `./build/vl-compiler.wasm` → EMBEDDED, and the grid ran from a
scratch directory with no `./build`, so every probe silently used the binary's embedded (master)
seed. Any measurement run outside the repo root must set `VL_COMPILER_WASM` explicitly, or it is
measuring master and reporting it as the patched result.

**Left measured and unfixed**, so the boundary is on the record: the OBJECT-element widening class
(`{v: i32}[]` → `{v: i32 | null}[]`) is still declined, and correctly — it is #1456's documented
provenance residue, where a PINNED source emits invalid wasm and the identical program with an
un-annotated literal source RUNS. Rejecting it would reject working code. Also declined by
construction: a ref-element pair whose two sides are different unions (`C[]` → `(C | D)[]`), which
this ladder classes as ref-to-ref. Both are misses, not regressions.

## ALL FOUR OWNER RULINGS TAKEN — and two of them moved under measurement (2026-08-18)

The four rows that had been the board's only real blockers are ruled. Recorded in `DECISIONS.md`
and in `open-rulings.md`'s Ruled section. Two were ruled as briefed; two changed shape when I
re-derived them on the tip instead of quoting the filing, and those two are the ones worth reading.

| ruling | outcome |
|---|---|
| **C3** — the inline budget | **build flag, never a default.** Had been ruled in conversation before and never written down — the exact failure mode `open-rulings.md` exists to catch, which is why it resurfaced as a live blocker. Precedent it matches: **C10** |
| **O-release-rung-default** | **`-O3` stays.** Closed by PUBLISHING the split, not flipping the rung |
| **C8** — A8/A9 variance | **inferred, no annotation surface in v1** — and the filing's central worry is refuted |
| **`return voidCall()`** | **allowed** — and it was not the pure design question the board filed it as |

### The two that moved

**C8's filed framing was stale and the measurement inverts it.** The entry says the ruling "decides
which programs that type-check TODAY start failing." I constructed that population; it is **empty of
working programs**. There is no spelling in which a subtype container reaches a supertype parameter
and the program runs — the struct-width family is a loud reject behind #1456's gate (including the
read-only body, and including an un-annotated source), and the union-widening family
(`i32[]` → `(i32|null)[]`, `K[]` → `string[]`) is check-clean invalid wasm in BOTH directions. So A9's
**Writable** half only moves cells UP a column and harms nothing, while its **Readable** half was
never blocked on the ruling at all: `peek(xs)` is sound, the checker already says "type-valid … but
not yet supported by codegen", and the blocker is that the two are different WasmGC array types with
no conversion. *A ruling entry can go stale the same way a ROADMAP row does — #1456 landed after the
filing and silently answered half of it.*

**The void question was carrying an unpinned check-clean-invalid-wasm cell.** Filed as "a design
change request, not a defect". It is both — the surface question is a design change, and underneath
it sits a live cell with no fixture and no doc mention anywhere:

```vl
function side() { print("hi") }
function call<T>(f: () => T): T { return f() }
call(side)     // vl check rc 0; vl run -> Invalid input WebAssembly code at offset 305:
               // type mismatch: current function requires result type [i32] but callee returns []
```

`T = i32` is a clean control. Both the lambda spelling and the named-function spelling fail. **So
"the defect queue is empty" was wrong by one**, and the miss is instructive: the cell was invisible
because the row above it was classified as a design preference, so nothing probed underneath it. A
row filed as "needs a ruling, not a brief" still deserves one probe.

### Two rows this opens

| row | item | measured | status | eff | risk |
|---|---|---|---|---|---|
| **D15** | **`T` instantiated at `void` in a generic emits invalid wasm** | `vl check` rc 0, module fails to validate: `requires result type [i32] but callee returns []`. Reproduces on `call(side)` and `call(() => side())`; `T = i32` control is clean. No fixture anywhere in `tests/cases/`, no mention in any design doc | **OPEN — check-clean invalid wasm.** The fix is consequence (c) of the void ruling: the monomorphizer emits an EMPTY result for a void instance. Same lowering the surface change needs, so brief them together | S–M | low |
| **P9** | **emitter-side inlining — schedule it or drop it, do not park it** | filed as un-schedulable because it is "worth ~5.6% at the default rung and exactly zero at `-O` and above". **That framing assumed the compiler is an optimized artifact and it is not**: `build/vl-compiler.wasm` is **1,224,039 B** against 918,258 B at `-O` / 919,547 B at `-O3` for the same module — the shipped seed has never had `wasm-opt` run on it, so the compiler sits at exactly the rung where P9 is worth 5.6% | **DECIDABLE NOW.** The `O-release-rung-default` ruling sets the bar — internalized optimization is judged on OVERALL self-compile time, not per-function wins — and 5.6% of self-compile is the number. **RE-DERIVE IT FIRST** — the perf round above measures all of `wasm-opt` over the whole compiler at 2.8–3.3% on the self-compile, so a single emitter pass filed at 5.6% is quoting a different workload (generated-program runtime on the bench suite) and has never been measured on this one | M | med |

### What the void ruling also retires

Consequence (b), void-return covariance on function values, closes the **`done()` wart** without any
separate work: `beforeEach(() => { hits = hits + 1 })` fails today with
`argument 1: expected () => void, got () => i32`, and `std:test` ships a void no-op `done()` purely
as the documented workaround (`vl-test-design.md:166`, filed at `ROADMAP.md:746`). Verified still
live on the tip, along with the bare form `take(() => 7)` — there is no void covariance at all
today. The assignment-is-an-expression rule that produces the `i32` is untouched.

## FINAL SURVEY — the defect queue is empty (2026-08-17, master `86703919`)

> **Superseded by one row, 2026-08-18.** This survey was accurate for everything it probed, and it
> did not probe underneath a row it had classified as a design preference. `D15` (a type parameter
> instantiated at `void`) is check-clean invalid wasm and was sitting under the `return voidCall()`
> ruling. See the round above.

Every remaining OPEN row was probed on the tip. **Nothing silent is left.**

| row | tip |
|---|---|
| **D1d** — a nested fn capturing a narrowed union binding, or a litunion ATOM | **RETIRED** — both shapes print correctly |
| **D1g** — a monomorphized instance pinned to the ATOM rep given a string-repped litunion arg | **RETIRED** — prints `x` |
| **D1h** — a hole parameter with no constraining usage | **LOUD** emit reject — correct column |
| **D1f**, **D9**, `==` over two boxes, the struct-arm rows | **LOUD** — correct column, and `==` is pinned "not supported YET" by three fixtures |
| **D2** (numeric litunions), **G3** (UTF-8 `string`), **G4** (linear-memory scalar arrays) | **FEATURES**, not defects — large, and each wants an owner priority call |
| **F5**, **H1**, **H2**, **H3** | process/infra |
| **B8**, **D3**, **D4**, **D5**, **D6**, **E7**, **E8** | shipped or closed above |

### What this cycle closed

Both silent inventories are at **zero**. `silent-class-inventory.md` and `-2.md` between them graded
5,180 cells across nine outcome columns; every silent family in the second, and the compiler-trap
column of both, is now retired or fixed. The last four silent populations shipped as **#1467** (D5/D6
of the inventory), **#1469**, **#1470** and **#1471** (board D6), with **#1472** closing the last
user-facing render leak.

### What remains, and why I am not briefing it

* **Loud-column limitations.** Correct outcome column by construction: the program is rejected and the
  user is told why. Ranked below silent work throughout this cycle and still are.
* **Features** (D2, G3, G4). Each is a multi-slice change to the representation or the runtime, and
  **each wants a priority call rather than an agent** — G3 in particular changes what `string` IS.
* ~~**Four owner rulings**, unchanged and now the actual blockers~~ — **ALL FOUR RULED 2026-08-18.**
  Recorded in `DECISIONS.md` and in `open-rulings.md`'s Ruled section; each is summarised in the
  round below. **C3** → the inline budget is a build flag, never a default (same shape as C10).
  **O-release-rung-default** → `-O3` stays, and the ask closes by publishing the per-program split
  rather than flipping the rung; the standing direction is to internalize optimization so it can be
  applied selectively, gated on OVERALL self-compile time. **C8** → A8/A9 defaults as written in
  `language-todo.md:15-20`, inferred with no annotation surface in v1, nothing to migrate.
  **`function g() { return voidCall() }`** → allowed, as one consequence of `void` becoming a real
  unit type in the lattice. Two of the four moved under measurement — see below.

## E8 re-derived and briefed — 4 occurrences, 3 shapes (2026-08-17)

Scanned the whole corpus on the tip (`vl check tests/cases`, 13,510 diagnostic lines). The board
filed E8 as **"3 named files of 240 diagnostic-producing"; it is 4 files now**, in three distinct
shapes:

| shape | diagnostic |
|---|---|
| an empty `Map()` whose key and value were never inferred | `unknown property \`add\` on {[<none>]: <none>}` |
| an empty array whose element was never inferred | `argument 1: expected string, got <none>[]` |
| a function whose return type errored (×2 files) | `print of () => <error> is type-valid but not yet supported by codegen …` |

**The design question is briefed as a real question rather than a rename**, because it is probably not
one answer for all three. `<none>` means "nothing was inferred here", and E7's shipped `_` is likely
right. `<error>` means "an error already happened here" — rendering *that* as `_` could actively
mislead, since the user's real problem is the earlier error and `() => _` invites them to fix the
wrong thing. Suppressing the second diagnostic may beat rewording it; the agent decides on evidence.

**CORRECTION — my shape→file table above mis-assigned two of the four.** `types/unknown-type-in-map-value.vl` is an `<error>` site, not the `<none>[]` one; the `<none>[]` site is `soundness/hole-is-guard-return-join-reject.vl`. I verified that myself at integration. The counts were right and the attribution was wrong — the same failure mode as every wrong axis this cycle, at a smaller scale.

**A caveat I put in the brief and want on the record here**: my 4 sites are where the marker
*surfaced in the corpus*, not the set of shapes that can produce one. A leak's observation site is a
sub-position, not the axis — the same error that mis-filed #1470. The brief asks for a **constructed**
count with its own denominator alongside the corpus count.

## Board status after this round

Bands 1 and 2 are exhausted of unblocked work; both silent inventories are closed; D6 was the last
live silent population and shipped as #1471. **After E8 lands, what remains is loud-column work and
owner rulings** — nothing silent, nothing unblocked-and-high-value that I can find.

## Round 6 re-derivation — the D-row survey, and D6 is the last live silent population (2026-08-17)

With both silent inventories closed I swept the board's own still-OPEN D/E rows:

| row | filed | tip |
|---|---|---|
| **D6** — function-type union arms share ONE box tag, so `x is F` is constant TRUE | 3 RUN-WRONG + 1 EMIT-REJECT | **LIVE AND SILENT — BRIEFED.** Reproduces on all three sub-shapes I moved: the arms differing by RETURN, by PARAM, and by ARITY. `vl check` rc 0, valid module, wrong branch |
| the **litunion remainder** `#1340` did not reach (`overlapping-arm-defects.md`) | 5 RUN-WRONG, `is K` answers FALSE | **RETIRED** — disjoint aliases, shared-member aliases and both directions all answer correctly |
| **D12** — a litunion → `string` materialisation in a TAIL EXPRESSION emits invalid wasm | silent | **RETIRED** — `function f(k: K): string { k }` prints `a` |
| **D9** — `s?.f is T` over an optional-chain receiver answers a constant FALSE | silent | **no longer silent** — now a LOUD `emitProgram:` emit reject. Correct column; re-file as loud if anyone wants it |
| **D3** — `emitIs` compares ONE tag, 49 of 64 | already flagged "not re-derived since #1343" | **refuted as a live number** in round 4 above |
| **D4** | generic alias application as a union member | **CLOSED by #1462** — the axis was the lexer's `>>` credit |
| **D5** | struct arms sharing a storage code | **confirmed DELIBERATE** — pinned by `unions/same-field-names-i32-vs-boolean-reject.vl` |
| **B8** | the checker's second descent | **shipped as #1465**; the row text above is superseded |

**Dimensions I held fixed on D6, stated so the agent can check them**: exactly 2 arms, both
function-typed; arity ≤ 2; the value always a lambda literal; a module-scope `const`; `is` in an `if`
condition; and **I always built through arm 2 and tested arm 1 — never inverted.** That last one is
the one I would bet on hiding something, because `overlapping-arm-defects.md`'s own method note says
an inverted twin is what tells a masked cell from a correct one.

**Measured negative kept separate**: a function arm beside a NON-function arm (`F | i32`) fails with
`failed to parse WebAssembly` — a different column and probably a different site.

## ~~The last known silent cell — i64 element, literal index~~ — MY AXIS WAS ONE MEMBER OF A FAMILY. Closed by #1470

#1467's and #1469's cells are all shipped. This is the only silent defect I currently know of, and
it needs **no generic at all**:

    function idi(x: i64) { print(x) }
    const a: i64[] = [7]
    idi(a[0])          // vl check rc 0, then invalid wasm

#1469 diagnosed it from the disassembly: the pin is CORRECT (`i64`) and **`i64.const 0` is emitted as
the ARRAY INDEX** into an i32 bounds check — a pending i64-literal state leaking into the index
emission. Its named fix shape was "clear `pendingI64`/`pendingF32`/`pendingF64` around the ~10
`nd.idxIndex` emissions".

**My grid says that shape is too wide, which is why it is briefed as a hypothesis:**

| variation | result |
|---|---|
| `i64` element, literal index, **call-argument** position | **check-clean, invalid wasm** |
| `f32`, `f64`, `i32` element, same shape | all work — **so the f32/f64 half of the named fix has no cell** |
| literal index `1` instead of `0` | fails — not index-0-specific |
| the **second** argument slot | fails — not slot-specific |
| **variable** index `a[k]` | works |
| `print(a[0])`, or bound first as `const v: i64 = a[0]` | both work — **argument position is part of the axis** |
| a bare `i64` literal, or an `i64` variable, as the argument | both work |

**Dimensions I held FIXED and did not test**: array length 1–2; one-dimensional only; a plain concrete
callee (no generic, lambda, method or UFCS); module scope; a `const`-bound annotated array; single
index depth. Specifically untried: `a[0][0]`, a map or struct element yielding i64, a lambda callee,
and an i64 element in RETURN position.

**Measured negative kept separate**: an `i64` MAP value as an argument fails with a *different*
message and a **loud** `emit error` — different column, likely different site, not this defect.

**OUTCOME — the array index was ONE MEMBER OF A FAMILY, not the axis.** #1470 measured the real one:
the wide hint is seeded from the callee's PARAMETER and then rides the WHOLE argument subtree, so
every i32 sub-position inside took the wide form. The array index is just the sub-position I happened
to probe. **`idi(1 + 2)` and `idi(-7)` were check-clean invalid wasm** and my grid never reached them.

**And my f32 refutation was itself a wrong-shaped probe.** I briefed "f32 does not reproduce" from
`zf32(g[0])`. f32 *does* leak — at the `.slice` bound and the map key — but **never at the array
index**, because `emitIndex`'s arms already clear `pendingF32` per arm. I tested it at the one place
it cannot bite and reported the negative as if it bounded the flag. The f64 third of my "too wide"
call was right (0 of 16 cells); the f32 third was wrong.

**The transferable form:** when a defect is a *leak*, the site where you observe it is a
sub-position, not the axis — vary what the leak flows INTO before concluding what it is about.

## NEW silent cells, filed by #1467's measured negatives (2026-08-17)

Inventory-2's 76 silent cells are now **zero** — but that is a statement about *its* families, not
about the compiler. #1467 surfaced three more while fixing D5/D6, and all three are pre-existing and
unmoved by it. **I reproduced the first two on master myself.**

| cell | grade | note |
|---|---|---|
| a forwarder passing an **element read of its own `T[]` param** — `gid(xs[0])` | **10 invalid-wasm + 8 loud of 26 reps** | `monoArgTyName`'s `Index` arm claims a struct element only (`isSName`). **The same shape of hole D5 was, one arm along** — so this is a strong candidate for a shortened mirror of the fix just shipped |
| `function wrapc(x: string \| null): string \| null { return gid(x) }` | **SILENT**, `vl check` rc 0 then `expected (ref $type), found (ref null $type)` | outside both D5 and D6. The generic-FORWARDER spelling of the same program is a LOUD reject, so the two spellings disagree on outcome column. **No corpus fixture pins either** |
| an un-annotated local bound to a generic call returning `i64[]` inside a generic body | 1 cell of 234 | concrete-outer and module-scope controls both correct |

## A mistake I have now made THREE times this session — standing rule

**Never report a grep count as a call count.** Every call-graph surface I have filed this session was
wrong in the same direction, and each one aimed an agent at the wrong starting point:

* **B8**: I filed `nameToTy` at 15 call sites with 4 external callers. Measured: **14 sites, 3
  external** — the "fourth" was an eleventh recursion. And my advice to start from `annotResolve`
  was refuted by the population: the descent is 99.3% emit-time, so that route was already at its floor.
* **`tyToStructStr`**: I filed "14 call sites in `typecheck.vl` and 2 in `emit_base.vl`". Measured:
  **9 calls** (14 mentions = 9 calls + the definition + 4 comments) and **0** in `emit_base.vl`, whose
  two hits are both prose.

The fix costs one command — filter comments and the definition, or count the population in the unit
that decides the work (parses at the outermost entry, cells in a grid) rather than lines in an editor.
A grep count is a **hypothesis about** a call graph, and it must be labelled as one when briefed.

## The silent class is down to TEN cells — inventory #2 re-derived end to end (2026-08-17)

`silent-class-inventory-2.md` graded 5,180 cells and found **76 silent**. Every silent family
re-derived on the tip today. **66 of the 76 are retired:**

| family | cells | tip |
|---|---|---|
| **COMPILER TRAP column** (D1, D2) | 8 | **RETIRED** — see round 3 above |
| **SILENTLY WRONG VALUE** (D3, `print` of a boolean array element in a generic body) | 2 | **RETIRED** — `boolean[][]` in a generic prints `false`/`true` correctly, matching its concrete-parameter control, and the 1-D `boolean[]` widening too |
| **D4** — a generic call whose argument is an annotated local / field read / element read | **34, the largest family** | **RETIRED** — all three argument forms print `aa` |
| **D7** — an i32-keyed SET as a parameter, captured by a nested function | 2 | **RETIRED** — prints `1` |
| **D5** — a generic forwarding its own type-parameter-typed parameter to a second generic call | **8** | **STILL SILENT** — `vl check` rc 0, then invalid wasm |
| **D6** — a generic `T[]` parameter given an array literal of f32 elements | **2** | **STILL SILENT** — `vl check` rc 0, then invalid wasm |

The likely closers are #1453 (the boolean-leaf print defect, whose own summary named D4's exact
`const y: string = "aa"; gid(y)` shape) and #1450/#1454.

**Both survivors are SINGLE-REP holes** — one missing arm on a per-rep ladder, this compiler's
dominant defect class. D5 fails only for the **map** rep (string, `i32[]`, `i32` forwarded through
the same two generic levels all work); D6 fails only for **f32** (f64 works).

**A shared-root claim in the inventory is now suspect, and it is the best lead in the item.**
`silent-class-inventory-2.md` describes D5 as *"same root as D4, different branch, DIFFERENT
MESSAGE"*. **D4 is fixed and D5 is not.** Either that claim was wrong, or D4's fix covered one
branch of a shared root and left the other — and which it is also tells us whether the inventory's
other shared-root claims can be trusted. Briefed as the headline question.

D8–D12 are loud emit/check rejects — the correct outcome column, so they rank below anything silent.

## Queue re-derivation, round 5 — six more rows retire (2026-08-17, `ad47fc5f`)

Probed on the tip, each against the shape its own row names:

| row | filed | tip |
|---|---|---|
| the remaining **`.map`/`.filter` niches** (#1436 filed 140 cells) | only the map-valued one still loud at last check | **RETIRED** — `.map` over `i32[]\|null` under a guard, `.map` over `m.keys()` (the map-valued one), and `.filter` over `boolean[]` all run |
| the **box for-in loop-var narrow** defect (8 cells) | #1436 located the root, out of its area | **RETIRED** — `for x in xs` over `(A\|B)[]` with `if x is A` prints `A B` |
| the **alias carrying its own null arm** as a container element (18 cells, #1430) | queued | **RETIRED** — `type N = i32 \| null; const xs: N[] = [1, null]` reads correctly under a guard |
| the **nested-ref-list** row (11 cells, LOUD) | queued | **RETIRED** — `i32[][]` indexes to `2` |
| the **anon-field-ref-list** row (11 cells, LOUD) | queued | **RETIRED** — `{ xs: [1,2,3] }.xs[1]` prints `2` |
| a **void-armed `match` whose message says "if-expression arm"** (wording, #1435) | wording defect | **RETIRED** — the message no longer occurs because the construct compiles (C6's if-expression-arm prelude). Statement form is clean; the value form binds a void `r` with only an unused-variable warning, and **using** it is a correct loud `print expects a value, got void`. Sound, not a hole — I checked, because a silent void binding would have been the more interesting answer |

**Confirmed OPEN and LOUD** (correct outcome column, so all rank below any silent row):

* **`==` between two boxes under a litunion-arm alias** (20 cells) — `emitProgram: \`==\` over a struct union …`
* **`function g() { return voidCall() }`** — still a type error. This is a **design change request**, not a defect: #1435 took the reject deliberately under a reject-more mandate. Needs an owner ruling, not a brief.
* **D1f** — a `while` GUARD's body and an ELEMENT place, both still loud.

**Probe note, since it cost me a reading:** `match` over an `i32` scrutinee rejects with *"match scrutinee must be a union, got i32"* — a mis-shape, not the wording defect. The scrutinee must be a union.

## Queue re-derivation, round 4 — litunion rows (2026-08-17, `fed8693b`)

Probed on the tip, each against the shape its own row names:

| row | filed | tip |
|---|---|---|
| **a `K\|null` NUMERIC litunion `is`** (12 cells, LOUD, "`is` names a type that is not a union variant") | queued as unblocked | **RETIRED** — `type Z = 0 \| 1; function f(): Z \| null …; if u is Z` prints `1`. The hole-parameter spelling (D1j) also prints `1`, and the named-litunion twin prints `a` |
| **D3 — `emitIs` compares ONE tag**, 49 of 64 cells | flagged *"not re-derived since #1343/#1341 — treat as an upper bound"* | **DOES NOT REPRODUCE**, and the probes that matter are the negatives. A one-tag comparison must answer TRUE for all three of: a value **not** in `A` (`"d"` against `"a"\|"b"`), an **overlapping first tag** (`"z"` against `A = "x"\|"y"`, `B = "x"\|"z"`), and a **subset** union (`"r"` against `KS = "p"\|"q"`, D1k's shape). **All three answer correctly**, as do a 3-member union's last member and the 2-member case. Treat 49/64 as refuted; re-derive the full grid if anyone briefs it |
| **D1f — a `while` GUARD's body and an ELEMENT place** | LOUD, both | **CONFIRMED OPEN, still LOUD, both.** Correct outcome column, so it ranks below any silent row |
| **D5 — struct arms sharing a STORAGE code** (`{a:i32} \| {a:boolean}`) | filed as a defect | **CONFIRMED OPEN and LOUD** — `emitProgram: union \`U\` cannot be discriminated`. Correct column. Note the *cause* is the same boolean/i32 storage-code collision named above, so it is a sibling of the boolean rows, not an independent item |

## D4 is filed on the wrong axis — re-derived, re-filed, ready to brief (2026-08-17, `fed8693b`)

D4 is on the board as **"Generic alias application as a union member"**. Genericity is not the axis.
**Nesting depth is**, and the same root produces a SILENT cell and a LOUD one depending on which
spelling reaches it:

| union arm | depth | generic? | result |
|---|---|---|---|
| `Box<i32>` | 1 | yes | **correct** — `is` answers true, prints `5` |
| `P = { v: i32 }` | 1 | no | **correct** — prints `5` |
| `Box<Box<i32>>` | 2 | yes | **SILENTLY WRONG BRANCH** — `u = { v: { v: 5 } }` is a well-typed member and `u is Box<Box<i32>>` answers **false**, taking the `i32` arm |
| `Outer = { v: Inner }` | 2 | no | **LOUD** — `is` answers true, then the narrowed read fails with `emitProgram: field access receiver is not …` |

So the axis is **a union arm that is a struct with a STRUCT-TYPED FIELD**, and the generic spelling
is merely one way to write one. Depth 1 is correct either way, which is the control.

D4's original claim — `const u: U = { v: 5 }` ACCEPTED for `U = Box<Box<i32>> | i32` — is the same
root seen from the assignment side, and it has its own discriminating control that I verified:
**the non-union annotation `const u: Box<Box<i32>> = { v: 5 }` is correctly REJECTED**, so the
union-member path is specifically what skips the deep structural check. Reading `u.v.v` off the
wrongly-accepted value then fails at emit, so the acceptance is silent but not harmless.

**How this was found is the point.** The nested-generic cell was not the item — it was the CONTROL I
wrote to validate D4's filed claim, and the control is what came back wrong. A control that only
ever confirms is not doing any work; this one discriminated and re-rooted the item.

## An owner ruling resolved by measurement, not by asking (2026-08-17, on master `fed8693b`)

**`does ?? short-circuit` was on the board as an OWNER RULING with my recommendation "yes". It does
not need a ruling.** The compiler already answers yes on three of four scalar reps, and `boolean` is
simply inconsistent with them:

| rep | `p ?? side()` with `p` non-null |
|---|---|
| `i32` | short-circuits — `side()` never runs |
| `f64` | short-circuits |
| `string` | short-circuits |
| **`boolean`** | **`side()` RUNS** — prints `RHS RAN` before the value |

Grade on both inputs, as the standing rule requires: with a null actually present, `side()` runs in
every rep, which is correct and is the control that keeps this from being a "`??` never evaluates
its RHS" misreading. So this is not a design question about what `??` should mean — the semantics
are already chosen and implemented, and one rep is missing the arm. **Re-filed as a defect and BRIEFED 2026-08-17; the ruling is OFF the board.** Isolated further before briefing: the sibling OPERATORS are fine for boolean (`false && side()` and `true || side()` both short-circuit), so it is not a general boolean short-circuit-lowering problem but `??` specifically; and the ANNOTATED spelling `const p: boolean | null = true` fails identically while annotated `i32 | null` short-circuits, so it is not the inference path either. Checked for a pinning fixture first, per the #1459 lesson: none pins `??` as evaluating both operands, and `arrays/loop-cond-hoist-nullable-list.vl:17` already describes a "short-circuit violation" in `&&` as a DEFECT, so the contract is established. #1437's finding that `??` over
`boolean|null` evaluates both operands was the same cell seen from the other side.

### `boolean` is now the rep with the least-complete ladder coverage — three independent hits

Worth stating as a briefing heuristic, because it has now paid out three times from unrelated
directions:

* #1453 — the silent `print` defect's axis was **the `boolean` leaf at any depth**, because
  `boolean[]` shares the i32 list rep exactly and nothing distinguishes it but a NAME.
* ~~today — `boolean` is silently assignable to `i32`~~ **— THIS PILLAR IS REFUTED.** That is
  spec'd feature A7b, not a defect, and my control was inverted (see the In-flight row). The
  heuristic survives because the slice it triggered found a **different** boolean-rep defect in its
  place: #1459's `listElemIsBool` consulted the declared element name only as a POSITIVE claim and
  then let the initializer walk outvote the annotation, so `const e: i32[] = [t]` printed `e[0]` as
  `true` while `e[0] + 0` printed `1` — one expression, two formats, `vl check` clean. A shortened
  mirror: one arm of a two-way decision, spelled with only the true half.
* today — **`??` fails to short-circuit for `boolean` alone.**

When a per-rep ladder is the suspect, **probe `boolean` first**. It shares i32's representation
without sharing its name, which is exactly the condition under which an arm gets omitted and the
fallthrough still looks plausible.

## Also retired by re-derivation (same pass)

* **the checker not narrowing a `while` BODY from its condition guard** (#1437, filed LOUD) —
  `let p = f(); while p != null { print(p + 1); p = null }` prints `4` on the tip. Note the body
  must terminate the loop by assigning, not by re-binding, or the probe hits a deliberate reject
  instead — that mis-shape cost me a reading earlier this cycle.

## Retired by re-derivation, round 3 — the whole COMPILER TRAP column (2026-08-17, on master `fed8693b`)

`silent-class-inventory-2.md` opened a ninth outcome column, **COMPILER TRAP (no diagnostic, no
module written)**, and scored it at **8 cells of 8 reachable**. Both of its documented shapes are
**retired on the tip**, verified with my own probes against the inventory's own stated controls:

| filed shape | inventory said | tip says |
|---|---|---|
| an **i32-keyed map captured by an inner function** (`const m: {[i32]: string}` … `function inner() { print(m.length) }`) | `vl check` rc 0, then `wasm trap: out of bounds array access`, **no module written** | `vl check` rc 0, **`vl run` prints `1`** — identical to the inventory's own string-keyed control |
| an **empty `[]` returned from an annotated lambda** (`const fq: () => i32[] = () => { return [] }`) | `vl check` **rc 1 with NO diagnostic at all**, a bare wasm backtrace inside the CHECKER (`nulElemListRetName ← checkFuncDeclNode ← …`), no module written | `vl check` rc 0, **`vl run` prints `0`**; the non-empty control still prints `1` |

I widened past the two exact spellings before believing it, because a non-reproducing probe is the
wrong shape and not a refutation. The i32-keyed capture is correct through `.length`, `m[1]`,
`m.keys()` in a for-in, and the boolean-valued (set-shaped) form; the empty-lambda return is correct
at module scope as well as nested.

**The most likely closer is #1450**, whose root was described as reading *"an array type's element
row without declining the `-1` hole an empty `[]` leaves"* — which is exactly
`nulElemListRetName`'s empty-literal shape — with #1454's ref-element widening covering the rest.
Neither PR claimed these cells, so the column was never scored again after they landed.

**One measured negative, recorded so it is not re-filed as a defect.** Widening the empty-lambda
probe to `() => string[]` and `() => i32[][]` gives rc 1, but that is **not** a trap and not a
regression — it is the deliberate loud floor, *"a lambda returning an empty `[]` cannot build the
string[] result its annotation asks for — type-valid, but the element type has no rep"*, already
pinned as `arrays/lambda-empty-array-literal-return.vl` in `KNOWN_CLEAN_DROPS`. The plain
`function f(): string[] { return [] }` spelling is clean. Loud floor, correct column, nothing owed.

## Retired by re-derivation, round 2 (2026-08-17, on master `c64f254a`)

The re-derivation rule keeps emptying the queue faster than I can brief it. Eight PRs merged in
quick succession (#1436–#1443), and these queued rows — each filed with a real cell count — are
**already working on the tip**. Verified with my own probes, on both runtime inputs where the cell
is runtime behaviour.

| filed row | filed as | tip verdict |
|---|---|---|
| box for-in loop-var narrow | 8 cells (#1436) | prints `1 / -1 / 2` — closed by #1437 |
| `1 \| 2 \| null` with `if p != null` | 41 cells (#1438) | prints `2 / -1` — closed by #1439 |
| `.map`/`.filter` over `i32[]\|null`, `boolean\|null`, `f64\|null` | part of 140 (#1436) | run |
| a litunion **ATOM** captured by a nested fn, no narrowing | filed broken in D1d | prints `C:a` |
| `let` + null-initialiser + later `p = null` reassignment | 22 cells (#1443) | prints `2 / -1` |
| `mapkeys` over `boolean\|null` and `K\|null` map values | 84 cells (#1439/#1443) | print `true` / `a` |
| map-value read with `is` / `!= null` | part of the same 84 | print `a` / `5` |
| `exprIsF32` / `exprIsBool` member-union reads | an untested inconsistency (#1443) | **measured clean** at three shapes |

**Two of my own probes read as compiler defects when they were MY lint errors** — but I then
**mis-diagnosed WHY, and the correction matters more than the original point.** I claimed
`vl check` returns **rc 1 on a HINT**. It does not: measured directly, a hint-only file and an
info-only file both exit **0** with *"Checked 1 file, no errors."* My probes exited 1 because they
also contained a real `[ERROR]` — `print` of an un-narrowed nullable — further down the output,
and the `[HINT]` line merely printed first. The discovery sweep measured this correctly and
contradicted me, and it was right. **The failure mode to guard against is the opposite of what I
wrote: never dismiss an rc 1 as "just a hint" — read to the end of the diagnostics.** The lesson
that survives is narrower: read the whole message before attributing an exit code, and remember
that a `[HINT]`/`[INFO]` line can precede a real error.

**And `1.5f` is not the f32 literal syntax — there isn't one.** An f32 literal is a bare `1.5` with
an `f32` annotation, which is just VL's bare-literals-adopt-the-destination-type rule. #1443
reported f32 as unprobeable and declined to add an `exprIsF32` arm on that basis; the decision was
right but the reason was wrong, and the arm is now measured unnecessary rather than untested.

Two other queued rows are **correct behaviour, not defects**, and should not be re-filed:
`print` of an un-narrowed union or nullable is the documented *"narrow it first"* reject, and
`p ?? null` consumed by `print` hits that same floor because its result is still nullable.

**Consequence:** the queue is now rebuilt from measurement rather than history — a discovery sweep
is in flight to produce `docs/internals/silent-class-inventory.md`, a ranked inventory of what is
actually live on the tip, each entry carrying a minimal repro AND a working control, plus an
explicit not-a-defect section so no future agent is spent on a closed row.

## Compile-time cost of #1443 and #1444 — measured (2026-08-17)

Both PRs shipped with an unmeasured hot-path addition and said so. I measured them myself while
GitHub was down, on a 7-point compiler series (`#1439` → `#1444`, saved wasm artefacts), timing
identical inputs with a **discarded warm-up rep and 9 interleaved reps**.

**Startup was isolated first and ruled out as a confound**: a trivial 2-line program costs **5.0 ms
on all three** compilers, despite #1444's wasm being **9,059 bytes larger**. So every delta below is
analysis, not instantiate.

### #1443 — negligible

Stress input: 3,000 numeric-litunion types with 3,000 `is`-narrowed reads (6,002 lines), which is
what its `tyKindOf` / `narrowedValueAtomOf` arena walks are gated on.

| | analysis | min–max |
|---|---|---|
| #1442 (before) | 182.0 ms | 174–235 |
| #1443 | 184.0 ms | 176–208 |

**+2.0 ms (+1.1%), or +0.67 µs per construct, with overlapping ranges.** No action.

Note the whole-compiler workload could *not* have found this: #1443's own agent observed that
`compiler/*.vl` declares **no numeric literal union anywhere**, so the gated walk is never entered.
**A null result on a workload that does not exercise the addition is not evidence** — the stress
input had to be constructed.

### #1444 — real, and QUADRATIC

Stress input: n guarded property paths (`if o.v != null { rd_i(o) … }`) against n in-scope callees.

| guards | #1443 | #1444 | delta | per guard | delta ratio |
|---|---|---|---|---|---|
| 750 | 25 ms | 40 ms | +15 ms | 20.0 µs | — |
| 1,500 | 56 ms | 117 ms | **+61 ms** | 40.7 µs | **4.07x** |
| 3,000 | 102 ms | 329 ms | **+227 ms** | 75.7 µs | **3.72x** |

A 2x input increase multiplies the delta by ~4x, and the **per-guard** cost itself doubles each
step. Linear would be 2x. **This is O(n²)** in the number of guarded property paths, and the
min/max ranges do not overlap at any size (e.g. 59–66 vs 115–126 ms at n=1,500), so it is not noise.

The mechanism matches what #1444's own report flagged and declined to profile: **`findFnDeclIn` is
an uncached subtree walk per unresolved callee**, invoked per (live narrowing × call). Its report
called it *"correct and bounded by body size"* — true of one call, but the **call count** is what
scales, and that is the half that was not measured.

**Why the whole-compiler run missed it, and why this is not urgent:** on `compiler/entry.vl`
(110k lines) #1444 measured **faster** than #1443 (0.714 s vs 0.757 s median), because the
`npKeys.length == 0` early-out means only **property-path** guards pay — bare-name narrowings create
no overlay entry — and real code has few. Absolute cost is still small at n=3,000.

**Filed as the top compile-time item.** The fix is cheap and well-understood: memoise `findFnDeclIn`
by callee name, or build a name→declaration map once per module instead of walking per query. Not
started — three agents are live and one is in `typecheck.vl` territory, so this waits for a free
slot rather than risking a conflict.

## Timing measurements need a quiet box (2026-08-17)

I re-measured the aliased-write perf fix twice and got contradictory numbers, then checked
`uptime`: **load average 85.7**, with two agents each running up to 4 concurrent `vl`
invocations. The second run was noise — it even showed the fix 2x *slower* on one input where
the first run showed the two identical.

**Rule: do not take timing measurements while agents are running, and check `uptime` before
believing any timing table.** A pass/fail gate survives load; a wall-clock comparison does not.
The agent's own numbers were taken with only itself running, which is why they are the
authoritative ones — and it is also why a timing fixture must never be committed (a wall-clock
assertion in CI is flaky by construction, which is why this slice pins invariants instead).

Corollary for the 3-agent cap: the cap protects *stability* and *measurement quality*, and this
is the measurement-quality half. A bounded complete measurement beats a fast noisy one.

## Two briefing rules I earned the hard way (2026-08-17)

**State a control that actually discriminates, and check that it does.** For #1453 I offered
"delete the annotation" as the control for a string-local defect. That control passes in *both*
the working and the broken configuration — at module scope the annotated form works too — so it
confirmed nothing and helped launder a wrong axis. A control that does not fail in the broken
configuration is worse than no control at all.

**Never brief from a document that is still in an open PR.** I told #1453's agent to cite the
second inventory's six pieces of evidence. Its worktree branched before that doc merged, so the
file did not exist and the reference dangled. It re-derived from scratch — which is the only
reason four of my five axes got corrected — but that was luck, not design. Either wait for the doc
to land on master, or paste the evidence into the brief.

## The combination, verified as one program (2026-08-17)

Four slices landed in sequence (#1451, #1453, #1454, plus the perf and trap work before them), each
gated green alone. Since two of them touch adjacent emitter territory, the combination is checked as
its own step — one program exercising all of them:

```
captured S[] → 7 · captured i32[][] → 2 · boolean[] through a generic → false, direct → false
· string local → aa · while q != null { … q = null } → 5
```

All correct, corpus **1888 / 0 / 7**. *Three slices green alone is a different claim from three green
together*, and the earlier `wasmEmit.vl` collision between two individually-green slices is why this
is now a standing step rather than a courtesy.

## The filed-axis failure rate is now the dominant risk in my own briefs

Across the recent slices, **my stated sub-axis was wrong more often than my cell counts were**:

| slice | what I filed | what it measured |
|---|---|---|
| #1449 | `findFnDeclIn` is the quadratic | a linear **bank scan** was; the walk is quadratic on a *different* axis |
| #1450 | the trap keys on the map's **key** type | the **value** type |
| #1453 | one root, param branch, nesting, wrong **value** | two roots, **storage class**, the **`boolean` leaf**, and only `print` is wrong |
| #1454 | **nested** arrays | **ref-ELEMENT** arrays — too narrow by three families |

A wrong count costs an agent some grid cells. **A wrong sub-axis sends the agent to the wrong file.**
The mitigations that have actually worked: state a control that **fails** in the broken
configuration (and check that it does), ask for a **targeted probe-sabotage** when the brief names a
suspect function, and say plainly that overturning the framing is the most valuable thing the report
can contain.
