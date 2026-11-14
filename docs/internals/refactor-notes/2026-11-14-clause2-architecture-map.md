# The open clause-2 rows, mapped onto the architecture item that closes them, 2026-11-14

Lane J. This note changes no code; it maps the 152 open clause-2 rows onto the architecture items the owner is deciding between, so lanes spot-fix only the bucket-(f) rows.

## Method

- **Population:** `ls.vl --status open` on master `089d6e0b`, minus the 59 rows the open-queue audit (#8051) classed otherwise: 32 stale-closed, 4 clause 1, 7 owner, and 16 diagnostic-only. That leaves **152 rows: 80 check reject, 72 emit reject**. `check-filed-witnesses --strict` grades all 152 as filed.
- **Unit:** a row is bucketed by its ablated mechanism, meaning the ingredient whose removal makes it run, read as the reason the compiler needs it. The refusal's sentence is not used.
- **Sampling:**
  - 21 rows were ablated afresh on a seed built after #8036: the witness plus one ingredient changed.
  - 10 rows were assigned by family to a representative, named below.
  - The rest were bucketed from the ablation table in their own row.
- **Who did it:** four subagents bucketed about 38 rows each. I merged their results, and moved the 8 rows they flagged as awaiting a ruling, or as not clause 2, into a separate bucket (g).
- **The buckets:**
  - (a) slot store: a function value held in a list, field, map, alias or call result.
  - (b) L3 width subtyping: a wider record delivered to a narrower one.
  - (c) L2 inferred interfaces: an un-annotated parameter or hole is the ingredient.
  - (d) L1 typed IR: the checker accepts and the emitter has no lowering for the op at that rep, including string-pin failures in mono.
  - (e) Rep-as-ADT or hash-consed types: a nested or composed rep is not enumerated, or two equal types compare unequal.
  - (f) none of these: a local fix.

## Counts

| bucket | rows | check reject | emit reject |
| --- | --- | --- | --- |
| (a) S's slot store | 45 | 10 | 35 |
| (b) L3 width subtyping | 8 | 5 | 3 |
| (c) L2 inferred interfaces | 17 | 16 | 1 |
| (d) L1 typed IR | 23 | 6 | 17 |
| (e) Rep-as-ADT / hash-consed types | 18 | 8 | 10 |
| (f) none: a local fix | 33 | 30 | 3 |
| (g) not a clause-2 fix: awaits a ruling, or the refusal is owed | 8 | 5 | 3 |
| total | 152 | 80 | 72 |

## By originating grid

Most rows come from a review, a close or a one-off grid; only a few grids contribute more than one row. Below are the grids with two or more rows in a bucket. The rest are single-row origins and are listed in the per-row tables.

- (a) S's slot store: `L3-family-d-survey` 4, `generic-returned-by-maker-through-hole-param.matrix` 4, `unknown` 2, `D15301-M2 grading` 2, `residue of D16090` 2, `joined-record-to-written-param-alias.matrix` 2; 29 rows from single-row origins.
- (b) L3 width subtyping: `callback-over-built-list.matrix` 2; 6 rows from single-row origins.
- (c) L2 inferred interfaces: none; 17 rows from single-row origins.
- (d) L1 typed IR: `D4058 close review (#3549)` 2, `d4934-empty-arm-push` 2; 19 rows from single-row origins.
- (e) Rep-as-ADT / hash-consed types: `unknown` 3, `review-3579` 2; 13 rows from single-row origins.
- (f) none: a local fix: `deep-is build D1035` 2, `unknown` 2, `#3538 review (lane DV)` 2, `D4058 close review (#3549)` 2, `flow-sensitive-read ruling (D3968 face)` 2; 23 rows from single-row origins.
- (g) not a clause-2 fix: awaits a ruling, or the refusal is owed: none; 8 rows from single-row origins.

## Bucket (f): the only rows a lane should spot-fix

Several (f) rows share a fix, and each such family should be closed together:
- **Union membership vs value fit for `is`, `match` and `as`:** D1118, D2677, D2719, D4085, D4087.
- **An `is` operand charged as a narrowed read:** D2408, D2449, D2464, D3251.
- **Flow-sensitive reads of a re-pointed function `let`:** D15956, D15957.
- **The inferred-return floor:** D4160, D16171.

| row | outcome | grid | local fix | ablation |
| --- | --- | --- | --- | --- |
| D1118 | check_reject | D951 twin (match form) | Membership rule must treat a type-parameter pattern as one of the union's atoms (as `is T` does) | concrete pattern i32 over i32\|string -> runs; T pattern over T\|string -> same refusal |
| D1190 | check_reject | deep-is build D1035 | Scoped substitution: stop rewriting the place at the first write/shadow in the arm | row: arm write needs scoped substitution; refusal holds until it exists |
| D1198 | check_reject | deep-is build D1035 | json_walk emits a per-level walker function with a recursive call (after D1197) | row: recursion in target shape -> generator inlines unboundedly; non-recursive nesting runs |
| D2031 | check_reject | getters v1 #3031 | Mint brand rows for generic `new` applications | row: non-generic new type is branded; generic application resolves to plain struct |
| D2299 | check_reject | grading D2295 | Bind callback parameter to the u8 element's value type i32, not storage u8 | row: b: i32[] -> runs; annotating x: i32 still refused |
| D2408 | check_reject | grading D2401 | Exempt an `is` operand from the pending call-retire refusal | row: move call out of condition -> runs; path instead of bare name -> runs |
| D2449 | check_reject | review #3150 | Same exemption for path re-test operand (shared fix with D2408) | row: call as own statement -> runs |
| D2464 | check_reject | review #3157 | Reader census should not count `is` operand as narrowed read | row: drop w() -> runs; non-is read correctly refused |
| D2508 | check_reject | unknown | for-in must bind loop var when iterable element is an empty hole | annotated never[] iterable -> refused differently (never illegal); row: typed i32[] empty -> runs |
| D2539 | check_reject | review std:idtable #3168 | Skip covariant-write check when inference already failed (message quality) | row: drop .set() -> only the real inference error |
| D2677 | check_reject | review #3193 | Membership walk must look through TyNullable wrapping | null member folded into U \| null outside -> runs (narrowed first) |
| D2719 | check_reject | D2684 close / rv3193d | as membership rule should admit a target a type-parameter member may be, like is | row: is instead of as? -> runs |
| D2836 | check_reject | D2832 grid uj/g2 | Seed return set with match's apart join (tpIfJoinAt) as for if | row: concrete spelling / agreeing arms -> runs |
| D3087 | check_reject | grading D3058 | Check lambda body against delivered fn type's return so a view is offered | row: annotate lambda return -> runs |
| D3088 | check_reject | lane-LP view grid | rcwErr should use readonly destination instead of following the function literal | row: plain function -> runs; non-null pair -> runs |
| D3251 | check_reject | review #3289 final condClrFirst | Charge condition calls only against narrowings made before them (ordering) | row: annotated and hole spellings both refuse |
| D3396 | check_reject | agrid (#3315 review) | Join should omit an else-if link whose arms all exit, as it does for nested else{if}. | else-if link -> nested else{if} runs |
| D3477 | check_reject | unknown | Return-completeness check should read a plain nested block's tail as value. | nested block inside if-branch or labelled block -> runs |
| D3530 | check_reject | litunion-mixed-width matrices (lane LC) | Add i64->f64/f32 retag row for literal box into nullable float. | f64 destination (non-null) or i64\|null -> runs |
| D3633 | emit_reject | #3376 review generator (lane LF) | Sibling-capture fold must find module-scope block binding; capture resolution fix. | i32 capture, direct call, or block in function -> runs |
| D3785 | check_reject | lane S4 review on D3733 | Assignment value should adopt destination like its literal at f32 delivery. | bare 255 tail or f64 result -> runs |
| D4033 | check_reject | #3538 review (lane DV) | Instance re-check skips type-bound UFCS resolution; run it at instance receivers. | concrete Circle params or import grow -> runs |
| D4034 | check_reject | #3538 review (lane DV) | ovHoleCallTy should substitute call-bound T before refusing receiver-dependent return. | candidates return i32 instead of T -> runs |
| D4055 | check_reject | lane SPEC (expressions.md) | Parser should desugar postfix ++/-- on field/element places. | prefix ++c.n -> runs |
| D4085 | check_reject | D4058 close review (#3549) | Checker asks union membership instead of value fit for is. | b: B single record -> runs |
| D4087 | check_reject | D4058 close review (#3549) | match arm should test value fit like is, not membership. | arms A, C (members) -> runs |
| D4160 | check_reject | D3423 position matrix | Inferred-return nullable floor should admit a single TyLit inner. | two-literal union or annotated return -> runs |
| D4192 | emit_reject | review of D1832 close | Null-only list literal default should build at operand's element type. | [null, 1] default or pre-typed (i32\|null)[] default -> runs |
| D10351 | emit_reject | closing-D10290 | local: reserve .map scratch frame for is-test on unbound map receiver | bind map result to const first -> runs |
| D14420 | check_reject | D2027-grading-list | local: numeric operators accept a never operand | string + never -> runs |
| D15956 | check_reject | flow-sensitive-read ruling (D3968 face) | narrow a let read's function set to writes reaching it (flow-sensitive); Steensgaard class would not | second call at 5 instead of true -> runs |
| D15957 | check_reject | flow-sensitive-read ruling (D3968 face) | same: read after write should take reaching write's type, not seed's open sig | no write (let k = inner) -> runs |
| D16171 | check_reject | closing D16047 (lane F) | admit list-of-map/set union in inferRetFloorUnsupported; emitter already lowers annotated twin | annotate return {[i32]: i32}[] \| i32 -> runs |

## Bucket (g): not a clause-2 fix

| row | why |
| --- | --- |
| D2772 | the row says the design owes the refusal |
| D3040 | awaits a readonly-view ruling |
| D3056 | awaits a readonly-view ruling |
| D3230 | awaits the D3197 ruling |
| D3642 | build item awaiting an owner ruling (whole-record in-place store) |
| D3689 | awaits a ruling on `f64 is <integer literal>` |
| D3703 | awaits a ruling on `f64 is <integer literal>` |
| D3819 | refusal right, a hint missing (diagnostic) |

## Every row

| row | outcome | bucket | secondary | grid | ablation | ran here | by family of |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1118 | check_reject | f | e | D951 twin (match form) | concrete pattern i32 over i32\|string -> runs; T pattern over T\|string -> same refusal | yes |  |
| D1190 | check_reject | f |  | deep-is build D1035 | row: arm write needs scoped substitution; refusal holds until it exists |  |  |
| D1198 | check_reject | f |  | deep-is build D1035 | row: recursion in target shape -> generator inlines unboundedly; non-recursive nesting runs |  |  |
| D1856 | check_reject | d | c | D1851 rest face | row: rest face -> list arg g([1,"x"]) runs; annotated element runs |  |  |
| D1968 | check_reject | c | f | grading D1966 | row: annotate return or move to top level -> runs |  |  |
| D1981 | check_reject | e | d | SIMD S3 | row: v128 in struct field/list/map has no lowering; scalar positions run |  |  |
| D2031 | check_reject | f | e | getters v1 #3031 | row: non-generic new type is branded; generic application resolves to plain struct |  |  |
| D2101 | check_reject | a |  | D2060 price | row: drop the list (const k = lambda) -> runs; record field twin still refused |  |  |
| D2196 | check_reject | e | d | D2161 readonly-only list rule | row: drop `\| null` -> runs; nested list also refused |  |  |
| D2197 | check_reject | c |  | unknown | row: annotate xs: i32[] -> runs |  |  |
| D2299 | check_reject | f | d | grading D2295 | row: b: i32[] -> runs; annotating x: i32 still refused |  |  |
| D2408 | check_reject | f |  | grading D2401 | row: move call out of condition -> runs; path instead of bare name -> runs |  |  |
| D2449 | check_reject | f |  | review #3150 | row: call as own statement -> runs |  | D2408 |
| D2464 | check_reject | f |  | review #3157 | row: drop w() -> runs; non-is read correctly refused |  | D2408 |
| D2467 | emit_reject | d |  | grading D2466 | row: as! instead of as? -> runs |  |  |
| D2508 | check_reject | f | c | unknown | annotated never[] iterable -> refused differently (never illegal); row: typed i32[] empty -> runs | yes |  |
| D2520 | check_reject | d | c | fixing D2517 | row: call on parameter itself -> runs; closure same refusal |  |  |
| D2539 | check_reject | f |  | review std:idtable #3168 | row: drop .set() -> only the real inference error |  |  |
| D2634 | check_reject | e | d | D2633 generic face | row: bare T -> runs; direct v128\|null -> runs |  |  |
| D2673 | check_reject | e | d | D2493 Set half | row: Set -> {[string]: i32} -> runs |  |  |
| D2677 | check_reject | f | e | review #3193 | null member folded into U \| null outside -> runs (narrowed first) | yes |  |
| D2681 | emit_reject | d |  | D2676 position grid (W2) | row: direct spelling { v: string \| IM } -> runs |  |  |
| D2719 | check_reject | f | c | D2684 close / rv3193d | row: is instead of as? -> runs |  |  |
| D2772 | emit_reject | g | e | review #3207 | row: one list type -> runs |  |  |
| D2833 | check_reject | d | e | D2832 grid uj/g1 | row: bind join first -> runs; concrete spelling -> runs |  |  |
| D2836 | check_reject | f | d | D2832 grid uj/g2 | row: concrete spelling / agreeing arms -> runs |  |  |
| D3040 | check_reject | g |  | closing D3028 scalar grid | row: no write after delivery -> runs; via call result -> runs as view |  |  |
| D3056 | check_reject | g |  | D3041 write-after-view grid | row: no write -> runs; through callee return -> runs |  | D3040 |
| D3087 | check_reject | f | c | grading D3058 | row: annotate lambda return -> runs |  |  |
| D3088 | check_reject | f | a | lane-LP view grid | row: plain function -> runs; non-null pair -> runs |  |  |
| D3172 | emit_reject | d | e | lane WV D3161 narcopy | row: annotated copy K\|null -> runs; no box -> runs |  |  |
| D3183 | check_reject | c | a | review #3284 | row: generic R<Y>(g: () => Y) -> runs |  |  |
| D3216 | check_reject | c |  | review #3289 grid gi | row: annotate z -> runs |  |  |
| D3230 | check_reject | g |  | review #3290 | narrow g = r.f != null first -> runs | yes |  |
| D3251 | check_reject | f |  | review #3289 final condClrFirst | row: annotated and hole spellings both refuse |  |  |
| D3286 | check_reject | c | d | D3285 grid | row: T -> i32 -> runs; post-guard return -> runs |  |  |
| D3299 | check_reject | c | f | NF2 write grid pw | row: annotate a: O -> runs; <X> -> runs |  |  |
| D3368 | check_reject | c | e | lane UG tp-join arrj | row: <T0,T1> -> runs; annotated -> runs |  |  |
| D3396 | check_reject | f |  | agrid (#3315 review) | else-if link -> nested else{if} runs |  |  |
| D3431 | emit_reject | b |  | RC2 reInternWidening | drop read of sv.pet.purr or drop delivery -> runs |  |  |
| D3436 | check_reject | c |  | nw/g1 | x: string or <T>(x: T) -> runs |  |  |
| D3452 | check_reject | d | f | numeric-join lane | r += 1 or r narrowed to i32 -> runs |  |  |
| D3463 | emit_reject | d |  | lane AL (closing D3417) | i32[] instead of u8[] -> runs chunked |  |  |
| D3469 | emit_reject | d | c | sibling of D3466 | declared param instead of <T> -> runs |  |  |
| D3477 | check_reject | f |  | unknown | nested block inside if-branch or labelled block -> runs |  |  |
| D3530 | check_reject | f | e | litunion-mixed-width matrices (lane LC) | f64 destination (non-null) or i64\|null -> runs |  |  |
| D3549 | emit_reject | d |  | lane BI std:array.slice | i32/boolean list -> runs; string/record/i64/f32 refuse |  |  |
| D3633 | emit_reject | f |  | #3376 review generator (lane LF) | i32 capture, direct call, or block in function -> runs |  |  |
| D3642 | check_reject | g |  | sunpa SP-032 | n/a: build item, no ablation |  |  |
| D3689 | emit_reject | g | d | lane C2 grading D3655 | i64 receiver -> runs; literal union prints false |  |  |
| D3703 | emit_reject | g | d | grading D3658 | i64 receiver -> runs |  |  |
| D3785 | check_reject | f |  | lane S4 review on D3733 | bare 255 tail or f64 result -> runs |  |  |
| D3818 | check_reject | c |  | overload-receiver-list matrix | a: i32[] annotated, or call on a directly -> runs |  |  |
| D3819 | check_reject | g |  | #3423 review (lane OV) | n/a: refusal correct, hint missing |  |  |
| D3851 | emit_reject | a | c | rv3443 generator (closing D3850) | annotate lambda param or add call through d1 -> runs |  |  |
| D3931 | check_reject | d | c | rv3489 review | concrete a(x: f64) -> runs |  |  |
| D3956 | emit_reject | a | d | rv3498 review | call w(other) in a's own body -> runs |  |  |
| D4018 | emit_reject | d |  | #3531 review is/as positions | is narrowing instead of as? -> runs |  |  |
| D4031 | emit_reject | d |  | closing D1812 (diderven DV-1201) | concrete x: string\|null -> runs |  |  |
| D4033 | check_reject | f | c | #3538 review (lane DV) | concrete Circle params or import grow -> runs |  |  |
| D4034 | check_reject | f | c | #3538 review (lane DV) | candidates return i32 instead of T -> runs |  |  |
| D4050 | check_reject | b |  | lane SPEC (types.md) | single Cat into Animal -> runs |  |  |
| D4055 | check_reject | f |  | lane SPEC (expressions.md) | prefix ++c.n -> runs |  |  |
| D4081 | check_reject | b | e | residue of D4058 close | numeric literal set field -> runs narrowed |  |  |
| D4082 | emit_reject | d | e | residue of D4058 close | literal-set narrowed field -> runs |  |  |
| D4085 | check_reject | f | b | D4058 close review (#3549) | b: B single record -> runs |  |  |
| D4086 | emit_reject | d | e | D4058 close review (#3549) | one-kind literal set over unboxed field -> runs |  |  |
| D4087 | check_reject | f |  | D4058 close review (#3549) | arms A, C (members) -> runs |  |  |
| D4089 | emit_reject | d |  | D4058 close review (#3549) | r: A \| B or r: A -> runs |  |  |
| D4150 | check_reject | e | c | #3563 review probes d01/d02 | non-recursive alias or annotated binding -> runs |  |  |
| D4151 | check_reject | e | c | #3563 review probes c07/d08 | non-recursive alias -> true; annotated param runs |  |  |
| D4160 | check_reject | f |  | D3423 position matrix | two-literal union or annotated return -> runs |  |  |
| D4173 | emit_reject | c | d | D3336 position matrix | g(a0: K) direct, or string pin -> runs |  |  |
| D4192 | emit_reject | f | e | review of D1832 close | [null, 1] default or pre-typed (i32\|null)[] default -> runs | yes |  |
| D4262 | check_reject | b |  | follows D4056 | print(u.v) no delivery, or disjoint arms -> runs |  |  |
| D4263 | check_reject | e | f | unknown | Set vs list field -> runs |  |  |
| D4265 | emit_reject | e | d | review-3579 | A.v string member fits whole -> runs |  |  |
| D4267 | emit_reject | e | d | review-3579 | nested field disjoint (x: string) -> runs |  |  |
| D4719 | check_reject | c | a | d3125_J2 | enclosing generic removed (top-level f<T>) -> runs; callback inline in map -> runs |  |  |
| D4770 | check_reject | e | f | closing-D4745 | i32[]\|i32[] (no literal element) -> runs; i32[]\|string[] runs | yes |  |
| D4778 | emit_reject | e | d | closing-D4771 | x: i32[] (not box union) -> runs |  |  |
| D4860 | emit_reject | e | d | residue-D4858 | b widened to same union -> runs |  |  |
| D4883 | check_reject | c | d | L2-13.30 | direct union (i32\|null)[]\|i32[] outside generic -> .length runs | yes |  |
| D4961 | emit_reject | d | e | d4934-empty-arm-push | drop `const w = v` -> runs (row) |  |  |
| D4964 | emit_reject | d | e | d4934-empty-arm-push | none in row; family of D4961 (field receiver) |  | D4961 |
| D5018 | check_reject | a |  | D5017-fallback | counterSet(bump) named fn -> runs |  |  |
| D5472 | check_reject | d | c | closing-D5344 | one call only -> runs; same element both calls -> runs |  |  |
| D10351 | emit_reject | f | d | closing-D10290 | bind map result to const first -> runs | yes |  |
| D10402 | check_reject | a |  | closing-D10383 | drop the Map (run(id,...)) -> runs |  |  |
| D12130 | emit_reject | d | f | L3-legality-sweep | i64 return -> i32 -> runs |  |  |
| D12218 | emit_reject | a | c | L3-family-d-survey | drop `const fs = [a]` -> runs |  |  |
| D12230 | emit_reject | a |  | L3-family-d-survey | drop hole param / insert const alias -> runs |  |  |
| D12233 | emit_reject | a | f | L3-family-d-survey | 64 links -> runs |  |  |
| D12236 | check_reject | a | c | L3-family-d-survey | annotate n or xs -> runs |  |  |
| D12454 | emit_reject | b | c | L3-census | flat join {f} -> runs; annotated return R -> runs | yes |  |
| D12455 | emit_reject | d | c | L3-census | list literal removed -> invalid module (clause-1) | yes |  |
| D12466 | emit_reject | e | d | L3-census | K -> string (no literal niche) -> runs | yes |  |
| D12602 | check_reject | c |  | L3-closing-D12473 | annotate z: {h: A\|B} -> runs |  |  |
| D14041 | emit_reject | e | d | unknown | K[] -> i32[] -> runs |  |  |
| D14042 | emit_reject | e | d | unknown | K[] -> i32[] -> runs |  | D14041 |
| D14082 | emit_reject | e | c | closing-D14080 | annotate lambda result / explicit len<P> -> runs |  |  |
| D14401 | emit_reject | a |  | unknown | Map -> list container -> runs |  |  |
| D14420 | check_reject | f |  | D2027-grading-list | string + never -> runs | yes |  |
| D14433 | emit_reject | a | d | container-write-join | none in row; read without helper runs (status) |  |  |
| D14437 | emit_reject | a | c | unknown | either delivery alone -> runs (status) |  |  |
| D14782 | emit_reject | a | e | D9764-nested-twin | annotate inc/dbl params -> runs | yes |  |
| D14880 | check_reject | a | c | mono-rungB-position-grid | bind lambda to const first -> runs |  |  |
| D14888 | emit_reject | a | d | D14884-twin | drop fw / one pin -> runs |  |  |
| D15014 | emit_reject | d | c | mono-callee-rename-audit | drop outer("s") or g("q") -> runs |  |  |
| D15040 | emit_reject | d | e | D1887-set-twin | Set<string> annotated -> runs |  |  |
| D15041 | check_reject | c | d | D2459-residue | u: i32 instead of U -> runs |  |  |
| D15161 | check_reject | c | a | closing-D15137 | non-function map values -> same E5 floor refusal | yes |  |
| D15197 | check_reject | a |  | closing-D15196 | module-level spelling -> runs | yes |  |
| D15303 | emit_reject | a |  | grading-D15300 | same fn both lists / no list -> runs |  |  |
| D15332 | check_reject | a | c | D15301-M2 grading | choice of records removed (gg({f: id1})) -> runs |  |  |
| D15334 | emit_reject | a | c | D15301-M2 grading | record removed / id1 annotated -> runs |  |  |
| D15357 | emit_reject | a | e | closing D15350 | push replaced by element write / one call type -> runs |  |  |
| D15392 | emit_reject | a | e | closing D15351 | binding xs removed -> runs (row); id1/id2 annotated -> runs | yes |  |
| D15431 | emit_reject | a | c | beside D15430 | one literal / module binding spelling -> runs (row mechanism text) |  |  |
| D15483 | emit_reject | a | c | canonical-instance-key measurement | id1 annotated i32 -> runs | yes |  |
| D15771 | check_reject | c | a | closing D15639 | lambda -> named function -> runs; record hand-on removed -> runs |  |  |
| D15776 | emit_reject | a | c | closing D15773 | direct call g("z") removed -> runs |  |  |
| D15777 | emit_reject | a | c | closing D15775 | const lambda -> nested named fn -> runs |  |  |
| D15900 | emit_reject | a |  | record-list-hole-fn-lone-use-beside-two-signatures.matrix | list bound and read (not handed) -> runs |  |  |
| D15923 | emit_reject | a | e | w320 | literal in field / one result type -> runs; fns annotated -> runs | yes |  |
| D15956 | check_reject | f | a | flow-sensitive-read ruling (D3968 face) | second call at 5 instead of true -> runs | yes |  |
| D15957 | check_reject | f | a | flow-sensitive-read ruling (D3968 face) | no write (let k = inner) -> runs |  | D15956 |
| D16077 | emit_reject | a | c | generic-returned-by-maker-through-hole-param.matrix | inc annotated / hole param removed -> runs |  |  |
| D16079 | emit_reject | a | c | generic-returned-by-maker-through-hole-param.matrix | not ablated by row; family of D16077 |  | D16077 |
| D16094 | check_reject | a | c | residue of D16009 | called directly / let handed directly -> runs |  |  |
| D16095 | check_reject | a | f | residue of D16090 | neither lambda captures -> runs |  |  |
| D16096 | check_reject | a | c | residue of D16090 | drop call before write / declared functions -> runs |  |  |
| D16130 | emit_reject | a | c | generic-returned-by-maker-through-hole-param.matrix | not ablated by row; family of D16077 |  | D16077 |
| D16131 | emit_reject | a | c | generic-returned-by-maker-through-hole-param.matrix | not ablated by row; family of D16077 |  | D16077 |
| D16136 | emit_reject | a | e | closing D15925 | return the if directly / no if -> runs |  |  |
| D16143 | emit_reject | a | c | closing D16099 | inc annotated -> runs; apt(inc,3) direct (no call result) -> runs | yes |  |
| D16144 | emit_reject | a |  | residue of D16160 | take(m) -> second callee -> runs |  |  |
| D16170 | emit_reject | e | f | closing D16049 (lane F) | drop null from field types -> runs (row) |  |  |
| D16171 | check_reject | f | e | closing D16047 (lane F) | annotate return {[i32]: i32}[] \| i32 -> runs | yes |  |
| D16172 | emit_reject | e | f | closing D16047 (lane F) | Set -> Map element -> runs (row) |  |  |
| D16202 | emit_reject | a |  | map-value-nested-record-of-hole-fn-uncalled.matrix | inc0 annotated / push onto list -> runs |  |  |
| D16203 | emit_reject | a |  | record-field-map-of-hole-fn-uncalled.matrix | inc0 annotated / record bound directly -> runs |  |  |
| D16210 | emit_reject | b | c | callback-over-built-list.matrix | not ablated in row; field-read receiver of list stored at wider J |  |  |
| D16211 | check_reject | b | c | callback-over-built-list.matrix | map((y) => y.f == null) / filter lambda -> runs |  |  |
| D16213 | emit_reject | a |  | joined-record-to-written-param-alias.matrix | not ablated in row |  |  |
| D16214 | emit_reject | a |  | joined-record-to-written-param-alias.matrix | not ablated in row |  | D16213 |
| D16220 | emit_reject | a |  | split from D15809 | without take(q) -> runs |  |  |
| D16240 | emit_reject | a |  | closing D15308 | read q(3) removed -> runs |  |  |
| D16241 | emit_reject | a |  | record-bound-source-written-into-fn-widened-binding.matrix | g body at module scope -> runs |  |  |
| D16290 | check_reject | b |  | 2026-11 engineering review | inline type -> named type / field sorts last -> runs |  |  |
| D16291 | check_reject | c | f | 2026-11 engineering review | lambda param annotated -> runs; lambda bound then returned -> runs |  |  |
| D16292 | emit_reject | a | c | ablating D16291 | result bound to const then called -> runs |  |  |

## Found on the way

**[D16300](../inventory/D16300.md), clause 1.** It was found from D12455's witness:
- A `??` whose default is a literal of another storage (`xs ?? [1]` over `boolean[]`) builds an invalid module.
- This happens when a `const` binding the call's result comes before the function's declaration.
- With the declaration first, the program runs and prints `1`.
- It is an order dependence, filed in lane J's reserved block of ten ids from D16300.

## Limits

- Most buckets come from each row's own ablation, recorded when the row was filed. Only the rows marked "ran here" were re-ablated on today's seed.
- A bucket says which architecture item would remove the ablated mechanism. It does not say that the item, once landed, makes the witness print the right value. Each close still owes its own grade.
