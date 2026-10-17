# Reserved inventory id ranges

One line per range, in the form:

    D<lo>-D<hi>  <holder>  <YYYY-MM-DD>  <what for>

`vl run scripts/inventory/ls.vl -- --next` SKIPS every id in a live range and prints which
ranges it skipped and who holds them, so the reservation is what the tool enforces rather than
what two people remember. `--reserve` and `--release` edit this file; `tests/vl_inventory_rows_test.ts`
fails when a range is stale (every id in it filed) so a forgotten reservation is a red rather
than a note that quietly widens.

**WHY THIS FILE EXISTS.** The queue tool's own header used to say reserved blocks "remain a
coordination convention written down in the inventory README, because two agents running this
one second apart both get the same answer". That convention failed four times, and the fourth
was two sessions colliding *while actively coordinating about ids in the same conversation* —
one reserved D1510-D1519 minutes after the other had handed D1510-D1529 to a running agent.
A convention that fails inside its own coordination is not a convention, it is a missing
feature. Nothing was lost that time only because the collision was noticed before either
agent filed.

A range is cheap. Take one before minting, release it when the work lands.

**THE HOLDER IS THE SESSION NAME OTHER SESSIONS CAN MESSAGE** — the one `ListAgents` prints,
not a name recalled from memory. The first version of this file had every holder inverted:
each block was labelled with the OTHER session's name, so the column that exists to answer
"who do I talk to" sent the reader to the wrong session for all four. A session that has
restarted may answer to a new name (`vl-6a` became `vl-cb` here); check rather than assume,
and if a block is filed by one session and fixed by another, say both.

<!-- reservations below; the marker is what --reserve/--release edit around -->

D1480-D1499  vl-d2 sweep agent  2026-09-03  ordinary-program sweep, D1480-D1486 filed
D1500-D1509  vl-d2 filed, vl-cb fixing  2026-09-03  VL-016, the compiler trap (D1500 filed)
D1520-D1539  vl-d2 glean agent  2026-09-03  VL-003, VL-004, VL-005
D1540-D1559  vl-d2  2026-09-03  sampler triage
D1560-D1579  vl-cb  2026-09-03  glean rows VL-025 (D1560), sampler residue (D1561, D1562), glean VL-021 (D1570) and VL-015 (D1571)
D1600-D1619  vl-cb  2026-09-04  glean VL-046 (D1600), the comment sweep's residue rows and follow-ups
D1628-D1639  vl-cb  2026-09-05  second-pass fix follow-ups
D1670-D1679  vl-c3  2026-09-05  coordinator lanes 2026-09-05 night (D1667-D1669 clause-1 fixes, D1664/D1665 residues)
D1700-D1709  vl-c3  2026-09-06  coordinator lanes 2026-09-06 (arena-reader twin of D1696, D1697 list-of-list key, D1692 declaration refusal, D1686/D1687 residues)
D1710-D1719  vl-c3  2026-09-06  coordinator lanes 2026-09-06 (D1707/D1708 predictions, D1686/D1687 covariant residues, D1680 nullable map, later residues)
D1720-D1729  vl-c3  2026-09-06  coordinator lanes 2026-09-06 morning (optchain D1677/D1681 residues, D1686/D1687 covariant residues, D1712/D1680 rulings, later residues)
D1760-D1779  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 afternoon
D1780-D1799  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 evening
D1800-D1819  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 evening (block 2)
D1820-D1839  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-06 night (D1820 per-program mono ledger, D1821 annotated-helper two-pin trap, later residues)
D1840-D1859  vl-c3  2026-09-07  fix lanes 2026-09-06/07 (D1845/D1846 narrowing limits, D1850-D1854 variadics residue, campaign D1834-D1839 already in the earlier block)
D1860-D1879  vl-c3  2026-09-06  fix and discovery lanes, 2026-09-07 (D1833 residue, variadics residue, campaign rows, later)
D1900-D1919  vl-c3  2026-09-07  fix lanes 2026-09-07 (D1866 residue: a module-block-only union registers no map member; later)
D1920-D1929  vl-c3  2026-09-07  row-25 refusal sites (a4674d1; D1920 filed)
D1930-D1939  vl-c3  2026-09-07  day-one sampler follow-ups (aab99b3)
D1940-D1949  vl-c3  2026-09-07  kind-ladder lane
D1960-D1979  vl-11  2026-09-22  plumb consumer lanes (PL-001..PL-007)
D1980-D1989  vl-11  2026-09-22  SIMD S3
D1995-D1999  vl-11  2026-09-22  review follow-ups
D2000-D2009  vl-11  2026-09-22  PL-014 perf lanes
D2010-D2019  vl-11  2026-09-22  review follow-ups 2
D2020-D2029  vl-11  2026-09-22  PL-003(b) and follow-ups
D2030-D2039  vl-11  2026-09-22  getters v1 lanes
D2040-D2049  vl-11  2026-09-22  review follow-ups 3
D2050-D2059  vl-11  2026-09-22  review follow-ups 4
D2060-D2069  vl-11  2026-09-22  persona review defects
D2093-D2099  vl-11  2026-09-22  getter diagnostics follow-ups (G3 field-bound message)
D2100-D2104  vl-11  2026-09-22  D2060 residue (record covariance)
D2110-D2119  vl-11  2026-09-23  function-list calls (PR #3050)
D2120-D2129  vl-11  2026-09-23  getter step budget lane (D2061-D2063 residue; D2120 filed)
D2130-D2134  d2017-lane  2026-09-23  D2017 capture-memo residue (D2130 filed)
D2176-D2179  vl-11  2026-09-23  PL-014 lane L10 (immutable module const globals)
D2242-D2243  vl-11  2026-09-23  D2234 lane (tail-arm return check; D2243 filed)
D2268-D2269  intrinsic-shadow-lane  2026-09-23  import-alias intrinsic shadowing (D2268 filed)
D2280-D2282  pl031-lane  2026-09-23  PL-031 map tombstone hang
D2309-D2312  plumb-compile-perf  2026-09-24
D2335-D2338  plumb-tail-units  2026-09-24
D2407-D2410  lane-N  2026-09-25  narrowing invalidation (D2400-D2405 closes; D2407, D2408 filed)
D2475-D2478  lane-S2  2026-09-25  unreachable self-functions (D2475-D2477 filed and closed)
D3246-D3248  lane-NB  2026-09-29  literal-binding inference, owner ruling (B), plumb PL-054/PL-056 (D3246 filed and closed)
D3728-D3735  lane-L2  2026-10-05  sunpa SP-037 step 2, D3664 (D3728-D3734 filed)
D3742-D3749  lane-UA  2026-10-06  empty-list pins at a hole argument and a record field (D2218, D2640, D1471 closed; D3742-D3746 filed)
D3760-D3764  lane-GN  2026-10-06  getter-alias narrowing (clause 1) + buildFnMap per-instance perf
D3770-D3774  lane-DX  2026-10-06  diagnostic cascades, sunpa missing-import report (D3770, D3772, D3773 filed and closed; D3771 filed open)
D3775-D3779  lane-S3  2026-10-06  soundness: D3757, D3746 closed; D3771 left open (attempt withdrawn); D3775 filed
D3785-D3789  lane-S4  2026-10-06  hex-literal assignment values at i64 (D3733, D3734 closed) + caller write after a callee-pinned element (D3775 closed); D3785, D3786 filed
D3790-D3794  lane-CC  2026-10-06  sunpa SP-048 (D3790, D3792 filed and closed; D3791, D3793 filed open)
D3795-D3799  lane-S5  2026-10-06  soundness: D3793, D3762, D3744 closed; D3795 filed and closed; D3796, D3797, D3798 filed open
D3800-D3802  lane-DG  2026-10-07  redundant-annotation hint at a `??` default (D3798 closed; D3800 filed open)
D3803-D3807  lane-PF  2026-10-07  sunpa per-frame allocation (item c): D3803 filed and closed; D3804 (list vectors, needs design), D3805 (for-in over a literal) filed open
D3811-D3813  lane-DH  2026-10-07  load-bearing annotations hinted redundant (D3800 closed); D3811, D3812 filed open
D3985-D3989  lane-CK  2026-10-10  ruling-C follow-ups: rows the r5 review of #3500 found
D3990-D3999  lane-CK  2026-10-10  diderven DV-402 (null fill typed by its destination) and DV-400 (record width subtyping into a parameter)
D4000-D4009  lane-PF  2026-10-11  DV-1000/DV-1001 V8 perf (diderven): D4000 range-analysis guard folding, later residues
D4040-D4049  lane-L2  2026-10-11  kind-grid findings from `scripts/twin-agreement.vl` (D4040-D4044 filed open), stage-2 byte-change rows
D4120-D4129  lane-SC  2026-10-11  function-name aliases the monomorphizer does not see through: `(id)`, `sel<F>(id)` (D4120-D4122 filed open); a list literal of a generic function (D4123-D4124 filed open); D4123 closed, D4125-D4127 its price (filed open)
D4190-D4195  lane-CK  2026-10-12  D1832 ruling (a): D4190, D4191 typed-destination emit gaps; review of #3574: D4192 `??` default, D4193 double diagnostic, D4194 alias-of-list member access (all filed open)
D4199-D4205  lane-CK  2026-10-12  review of #3577: mixed-literal-union element rep, narrowed-arm writes, index-place compares
D4300-D4319  lane-SC  2026-10-13  function-value flow table (§(f) step 1) disagreements on silent review witnesses: D4300-D4304 filed open
D4746-D4749  lane-D4720  2026-10-14  closing D4720/D4721 (nullable union and inline-record list literals): none filed
D4770-D4773  lane-D4743  2026-10-14  closing D4743/D4744/D4745 (unions of one-list members): D4770, D4771 filed open
D4778-D4781  lane-D4771  2026-10-14  closing D4771 (`is` over a list tests every element): D4778, D4779 filed open
D4842-D4845  lane-SC  2026-10-15  L1 step 5 (capture cells): D4842 filed open (a hole lambda copied into a capture cell called at a second type); L1 step 6: D4842 closed, D4843 filed open (a hole lambda called through a capture cell, then written back into it directly)
D4846-D4849  lane-SC  2026-10-15  L1 step 7 (a generic delivered at the enclosing generic's type parameters): none filed
D4850-D4853  lane-L2  2026-10-15  L2 §13.27 (hole lists): none filed
D4854-D4857  lane-L2  2026-10-15  L2 §13.29 (box-element lists): D4854 filed closed (a captured walk variable over a local box-element list literal typed from its first element)
D4862-D4865  lane-L2  2026-10-15  L2 §13.30 (a kept-apart list join re-joined at the pin): D3367 closed, D4862 filed open (a type parameter's list and a concrete list collapse at a nullable-element pin)
D4866-D4869  lane-L2  2026-10-15  L2 §13.31 (small listRep DIFF classes): D4866 filed closed (a call's return re-check records one instance's destination on a generic body's shared list literal)
D4878-D4881  lane-L2  2026-10-15  L2 §13.32 (the listRep `-> none` class): none filed
D4894-D4897  lane-D4894  2026-10-15  closing D4894 (a list literal of list literals with different leaves): D4894 filed closed; D4895, D4896 filed open
D4902-D4905  lane-D4896  2026-10-15  closing D4896 (a boolean-leaf list union member keyed onto `i32[]`): D4896 closed, D4902 filed open (a string-literal-union list literal delivered into `f64[] | K[]`)
D4906-D4909  lane-D4902  2026-10-15  closing D4902 (an atom-list literal delivered into `f64[] | K[]`): D4906, D4907 filed open (`is K[]` over `i32[] | K[]`; a `for` over a box union's `K[]` arm); D4903-D4905 left unused
D4922-D4925  lane-L2  2026-10-15  L2 §13.35 (the hole tail and the complement record rows D4898-D4901): D4898-D4901 closed, D4922 filed open (a `T[] | i32[]` parameter binds no `T` from a union argument), D4923 filed closed (a hole's complement record at a list argument); D4924-D4925 left unused
D4926-D4929  lane-D4926  2026-10-15  closing D4926 (an element narrowing outliving a write) and D4083 (its record spelling): D4926 filed closed; D4927, D4928 filed open (`is S[]` over `string[] | S[]`; a narrowed list delivered as `K[]`); D4929 left unused
D4934-D4937  lane-D4911  2026-10-15  closing D4911-D4913 (`is K[]` arms reading or over unions in an instance; a union annotation binding no type parameter): D4911-D4913 closed, D4934, D4935, D4937 filed open (a push in the arm; a closure read; a `V[][] | string` receiver); D4936 left unused
D4938-D4941  lane-D4915  2026-10-15  closing D4915, D4914, D4916 (`is` over list arms in other reps, nested atom-list tags, a narrowed string list read as atoms): D4938 filed closed (`K[] | J[]`), D4939 filed open (a capture, field or element receiver traps on its narrowed read); D4940-D4941 left unused
D4945-D4948  lane-D4928fu  2026-10-15  follow-ups to the list-narrowing ruling (#3859): D4945 filed open (a numeric narrowed list's row delivered by reference), D4946 filed closed (callback parameters and `for` variables read the narrowed element); D4927 closes with #3854; D4947, D4948 left unused
D4949-D4952  lane-D4939  2026-10-15  closing D4939 (a capture, field or element receiver of an empty other-arm list traps on its narrowed read): D4939 closed, D4949 filed open (a `.push` through such a receiver); D4950-D4952 left unused
D4953-D4956  lane-D4949  2026-10-15  closing D4949 (a `.push` through a field, element or capture that `is` fits as an empty list of another arm): D4949 closed, D4953 filed open (`is L` over a nullable union misses an empty other-arm list), D4954 filed open (a variant-narrowed record's list-arm field read under `is L` is refused at emit); D4955-D4956 left unused
D4965-D4968  lane-L2  2026-10-15  closing D4931 and D4932 (a forwarded `V[] | i32[]` binds no `W`; a structural `{ x: i32 }[] | i32[]` return into a field): D4965 filed closed (a list union narrowed to `string[] | i32[]` binds no `W`), D4966 filed closed (a declared record holding a shape-spelled list union hides `is P[]`); D4967-D4968 left unused
D4977-D4980  lane-3868-fix  2026-10-15  fixing #3868 (mono-tyaram-grid par_nulapp cells; a cross-function closure capture refusing an `is K[]` arm): D4977 filed open (an instance called with a `[]` literal folds an `is K[]` over an empty disjoint list to false); D4978-D4980 left unused
D4981-D4984  lane-D4963  2026-10-15  closing D4963 and D4977 (a type-parameter list narrowed by `is K[]` delivered as `K[]`; an `is K[]` in a `[]`-pinned instance): D4981 filed open (the bare-`V` and un-annotated face), D4982 filed open (a closure in the arm passing the list to a generic list parameter), D4983 filed open (a `.map` over a `V[]` delivered straight into a concrete list parameter); D4984 left unused
D4989-D4992  lane-L6  2026-10-15  L6 step 5, the fifth switch (every union seam on the key): D4989 filed open (a same-shape `A | B` value delivered into `A | B | null` stores the bare record); D4990-D4992 left unused
D4993-D4996  lane-D4957  2026-10-15  closing D4957 (a list field narrowed by `is K[]` delivered as `K[]`) and D4962 (an instance's `is Q[]` over an empty list of another record): D4993 filed open (a `.map` callback over such a receiver is typed at the receiver's element), D4994 filed open (an anonymous tested record refuses at emit), D4995 filed open (a `for` over such a list a push grew types its variable at the receiver's record); D4996 left unused
D5001-D5004  lane-D4982  2026-10-15  closing D4982 and D4983 (a closure in an `is K[]` arm passing a `V[]` to a generic list parameter; a `.map` over a `V[]` into a concrete list parameter): D4982, D4983 closed, D5001 filed open (a closure calling a generic at an explicit `<V>`), D5002 filed open (a generic call's `V[]` result into a concrete list parameter), D5003 filed open (an un-annotated binding in the arm binds the arm's list); D5004 left unused
D5017-D5020  lane-L9  2026-10-16  the L9 checker hook at the operator-force edges: D5017 filed and closed (a call through a binding is charged every function stored into it); D5018 filed open (a stored value from a list, field or call result still writes anything); D5019-D5020 left unused
D5049-D5052  lane-L2  2026-10-16  L2 stage 3 (D2891, and the `if` join at a pin from D2832): D2891, D2541, D2795 and D3282 closed, D5049 filed open (an inferred `{ x: i32 }[] | i32[]` return set has no list arm to box into), D5050 filed open (a complement `else` read of an inferred list union gets the box when a `for` walks the same binding), D5051 filed open (`is R` over a type parameter's inferred join with a literal finds no interned arm); D5052 left unused
D5061-D5064  lane-L1  2026-10-16  closing D4891 (a written `let` of a generic, its write delivered at its pin, read as a list element): D4891 closed, D5061 filed open (a record field holding an alias of a generic, called through the field), D5062 filed open (a written `let` of a generic returned from an un-annotated function); D5063-D5064 left unused
D5065-D5070  self-compile-drift  2026-10-16  the L2 self-compile fuel series (profiling-the-compiler.md, 2026-10-16): D5065 filed open (`valueUnionBoxList` asks every list-rep question for the instance type, #3830), D5066 filed open (the shared-field plan is rebuilt per classifier question, #3579), D5067 filed open (a union key is re-rendered from its spelling on every question, #3885/#3904); D5068-D5070 left unused
D5079-D5082  lane-L1  2026-10-16  closing D5061 (a record field holding an alias of a generic, called through the field): D5061 closed, D5079 filed open (a record field holding a written `let` of a generic, in a generic function); D5080-D5082 left unused
D5083-D5086  lane-L2  2026-10-16  closing D5049, D5050, D5051: all three closed, D5083 filed open (the generic face of D5049: emit_mono names the pinned return union from the `#anon` row); D5084-D5086 left unused
D5103-D5106  lane-L6  2026-10-16  closing D4615 (a union arm with a nullable field of its own union): D4615 closed, D5103 filed open (an un-annotated list literal of a nullable value-union call), D5104 filed open (an inferred return of a self-referential union's nullable), D5105 filed open (a self-referential arm tagged by a literal union); D5106 left unused
D5111-D5114  lane-L1  2026-10-16  closing D5083 and D5079: both closed, D5111 filed open (the complement `else` read of a generic's inferred `T[] | i32[]`), D5112 filed open (a call through a record field holding a written `let` of a generic, from a closure inside a generic), D5113 filed open (an un-annotated `Map()` value narrowed to a record-list arm has no reflist slot); D5114 left unused
D5119-D5124  lane-L1  2026-10-16  closing D5111 and D5112: both closed, D5119 filed open (the module-scope `else` of `is i32[]` over a generic instance's returned `T[] | i32[]` finds no member set), D5062 left open; D5120-D5124 left unused
D5139-D5142  lane-L1  2026-10-16  closing D5113: closed, D5139 filed open (a binding of a guard-narrowed nullable record, captured inside a module-scope block, is stored as the nullable ref); D5140-D5142 left unused
D5143-D5146  lane-L6  2026-10-16  closing D5119 and D5105: D5119 closed (the member-set pool banked a spelling miss), D5105 left open with its mechanism re-derived (a field shared by an atom arm and a string arm has no read rep), D5143 filed open (`is` over an inline record whose field is a lone literal); D5144-D5146 left unused
D5170-D5179  lane-L1  2026-10-17  re-grading D4244 after #3941: D5170 filed open (a written `let` of a generic called at a nullable string literal union and at a nullable `string`), D5171 filed open (a copy of a written `let` called both at `string` and at a string literal union); D5172-D5179 left unused
D5230-D5239  lane-L1  2026-10-17  closing D5170 and D5171: both closed, D5230 filed open (an alias of a generic delivered into an annotated `void` function type inside a module-scope block emits a `drop` after the call); D5231-D5239 left unused
D5260-D5269  lane-L6  2026-10-17  the `unionMemberCount` fallbacks and `emitUnionUnionEq`'s double append: D5260 filed open (union `==` union over a literal-union alias arm beside a scalar arm has no payload kind); D5261-D5269 left unused
