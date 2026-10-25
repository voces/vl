# L3: the emit refusals a check-clean program reaches (2026-10)

Lane L3 of `architecture-refactor-plan.md` asks that legality be decided in the checker. Every
`emitFail` / `emitFailAt` site that a `vl check`-clean program reaches must either move to the
checker (a DESIGN refusal) or stand as an open CAPABILITY row with a verbatim `Repro:`. A site no
check-clean program reaches is a floor and is not listed here.

Measured on master `b861c1d9f` with this lane's checker moves applied. Line numbers are that
commit's.

## Method

1. **Population.** `vl run scripts/emit-refusal-sites.vl -- --json` reads **740 sites** and **619
   templates**.
2. **Instrumented compiler.** A copy of `compiler/` has each site's message argument prefixed
   with `"[[<file>:<line>]] "`, and is built into a seed. Every emit refusal it prints then names
   the site that raised it. The prefix is a string concatenation, so it adds no interpolation.
3. **Witnesses.** There are 787 programs, each built on the instrumented seed. Any program that
   refuses at emit is also run through `vl check`, which must return rc 0.
   - Every `loud emit reject` cell of `scripts/silent-sweep/distilled/baseline.jsonl`.
   - Every `// @emit-error` fixture under `tests/cases`.
   - Every `scripts/capability-probes/*.vl`.
   - Every single-module inventory row whose witness grades `emit_reject` today, from
     `check-filed-witnesses.vl --json` over `inventory` and `inventory-2`.
4. **Reached.** 587 witnesses reached emit with check rc 0: 344 corpus cells, 55 fixtures, 178
   inventory rows and 10 probes. Together they reach **111 distinct sites**.
5. **Grading.** Each site is graded by its witnesses' rows and fixtures, never by the message.
   - **DESIGN** means the program is ill-typed by a ruling or a design rule, so the checker owes
     the refusal.
   - **CAPABILITY** means the program is type-valid and a neighbouring spelling runs.
   - A site with no open row got a new one (D12450-D12467). Each new row's witness was re-run
     verbatim: `vl check` rc 0, then `vl run` printing the site's refusal. Its running
     neighbour is in the row's grading list.

## Counts

| grade | sites |
| --- | ---: |
| CAPABILITY, every witness has an open row | 100 (17 by new rows D12450-D12466, 83 by existing rows) |
| CAPABILITY, but a DESIGN row among the witnesses is not moved | 6 |
| DESIGN, held at emit | 4 |
| DESIGN, moved to the checker by this lane | 1 (`wasmEmit.vl:27003`, D3483) |
| total reached | 111 |

The lane moved four rows into the checker, D2689, D3052, D3483 and D4052, in two rules:

- `asgTargetIsPlace` (check_operators.vl): an assignment target must be a place.
- `voidStoreCheck` (check_relate_core.vl, check_annot_resolve.vl): no `void` list element, map
  key or map value, also as a union member there, in any written annotation or record field. The ruling is DECISIONS.md §"void is a real type" (d).

Only D3483 had a site of its own in the reached set. D2689, D3052 and D4052 had refused at sites
that other open rows still reach.

D12467 is graded UNDECIDED, not CAPABILITY. A written top-level `i32 | void` parameter is
check-clean and reaches `wasmEmit.vl:8101`. Ruling (d) forbids `void | i32` as a stored element.
It does not say whether a written parameter of that type is legal, so the row waits on that
question. The site has another open row too, D12100.

## Residue: DESIGN sites still at emit

**Six DESIGN rows not moved.** Each of these sites is also reached by CAPABILITY rows, and the
DESIGN rows among them are still graded open:

- D10893 at `emit_mono.vl:23115`;
- D3437 at `wasmEmit.vl:11561`;
- D1433 at `wasmEmit.vl:11568`;
- D1852 at `wasmEmit.vl:11779`;
- D2194 at `wasmEmit.vl:29215`;
- D3691 at `wasmEmit.vl:36996`.

**Four sites a check-clean program reaches, where the refusal is DESIGN and the fact deciding
it is per instance:**

- `emit_mono.vl:9184`: `T.size` where no parameter binds `T`. Under the D4551 ruling such a
  `T` is default-bound, and a default must never be observable, so the checker owes this. The
  probe `flat-layout-const-unbound-type-param` predates that ruling.
- `emit_mono.vl:9197` and `emit_mono.vl:9207`: a flat generic row bound to a non-flat type, or
  read at a field the bound type lacks. `flat-records-design.md` §11 decides this per
  instance, at the pin.
- `emit_sections.vl:10209`: an export named `memory` in a program that uses linear memory.
  Whether memory is exported is decided by emit (`memUsed`).

## Reproduce

1. Run `vl run scripts/emit-refusal-sites.vl -- --json > sites.json`.
2. Copy `compiler/` and, at each `(file, line, fn)` of `sites.json`, wrap the first argument
   of that call as `"[[file:line]] " + (<arg>)`. Then `vl build entry.vl -o instr.wasm` from
   the copy.
3. Build each witness of Method step 3 with `vl build <w> --compiler instr.wasm`, with
   `VL_STD` pointing at the checkout's `std/`. On `emit error`, run `vl check <w>` and keep
   the witness if the rc is 0.
4. Group the kept witnesses by the `[[file:line]]` prefix of their first message.

## Per-site table

| site | template | reached by | witness | grade | row or rule |
| --- | --- | --- | --- | --- | --- |
| `emit_bytes.vl:2606` | emitProgram: ref-list field element type is not interned | 1 row | D4191 | CAPABILITY | open D4191 |
| `emit_bytes.vl:2621` | emitProgram: nested-struct field element type is not interned | 1 row | D3938 | CAPABILITY | open D3938 |
| `emit_bytes.vl:2722` | emitProgram: ref valtype with no interned shape | 2 row | D1584 | CAPABILITY | open D1584, D10933 |
| `emit_bytes.vl:3013` | emitProgram: ref valtype with no interned shape | 6 row, 1 fixture, 3 corpus | D3440 | CAPABILITY | open D3440, D3490, D3914, D3985, D4562, D4711 |
| `emit_collect.vl:12752` | {} | 1 row | D4567 | CAPABILITY | open D4567 |
| `emit_collect.vl:12931` | {} | 2 row, 1 probe | D2174 | CAPABILITY | open D2174, D3329 |
| `emit_collect.vl:13521` | emitProgram: a map union member is not supported — use a struct member instead | 1 row, 1 probe | D1666 | CAPABILITY | open D1666 |
| `emit_collect.vl:14411` | emitProgram: recursive generic type `{}` is not supported — its expansion has no finite ty… | 1 row, 3 fixture | D3328 | CAPABILITY | open D3328 |
| `emit_collect.vl:4198` | emitProgram: unsupported for-in iterable | 2 row, 20 corpus | D2650 | CAPABILITY | open D2650, D10011 |
| `emit_collect.vl:5243` | emitProgram: local declaration needs an initializer | 1 row | D7080 | CAPABILITY | open D7080 |
| `emit_mono.vl:10635` | emitProgram: a record argument's fields name a row that holds another field kind, and a re… | 1 row | D4135 | CAPABILITY | open D4135 |
| `emit_mono.vl:11577` | emitProgram: {} called at more than one argument type — one binding holds one closure sign… | 1 row, 1 fixture | D12219 | CAPABILITY | open D12219 |
| `emit_mono.vl:13069` | emitProgram: a binding of an `if` choosing generic functions is delivered at two function … | 1 row | D9350 | CAPABILITY | open D9350 |
| `emit_mono.vl:19249` | emitProgram: a list holding a generic function is called through its elements at more than… | 2 row, 1 fixture | D9500 | CAPABILITY | open D9500, D12330 |
| `emit_mono.vl:19259` | emitProgram: an alias of a captured, reassigned function binding is stored in a list, whos… | 1 row, 1 fixture | D12230 | CAPABILITY | open D12230 |
| `emit_mono.vl:19954` | emitProgram: the captured binding `{}` is written with a function value whose type at this… | 1 row | D3959 | CAPABILITY | open D3959 |
| `emit_mono.vl:19965` | emitProgram: the captured binding `{}` is written with a function inside a closure that ev… | 1 row, 9 fixture | D4305 | CAPABILITY | open D4305 |
| `emit_mono.vl:20604` | emitProgram: a function this call reaches through a list or join is already taken at anoth… | 2 row, 2 fixture | D10791 | CAPABILITY | open D10791, D10792 |
| `emit_mono.vl:20872` | emitProgram: a generic function is passed to a function value whose parameter type names a… | 2 row, 2 fixture | D3956 | CAPABILITY | open D3956, D10700 |
| `emit_mono.vl:22721` | emitProgram: monomorphize: a function parameter handed on to `{}` in a call to `{}` is cal… | 1 row | D12218 | CAPABILITY | open D12218 |
| `emit_mono.vl:23115` | emitProgram: monomorphize: unsupported argument type for `{}` in a call to `{}` | 13 row, 17 corpus | D3038 | CAPABILITY; DESIGN not moved | open D3038, D3325, D3366, D3942, D9762, D9764, D9782, D10010, D10892, D10893, D10895, D10894, D12180 |
| `emit_mono.vl:23455` | emitProgram: monomorphize: `{}` is called at two instances of the function handed to it in… | 3 fixture | `closures/listed-hole-fn-variable-index-reject.vl` | CAPABILITY | new D12450 |
| `emit_mono.vl:23692` | emitProgram: monomorphize: expected an array argument for `{}` in a call to `{}` | 3 row | D2772 | CAPABILITY | open D2772, D3821, D4661 |
| `emit_mono.vl:23713` | emitProgram: monomorphize: a generic function handed to two parameters of type `{}` in a c… | 1 row, 1 fixture | D12232 | CAPABILITY | open D12232 |
| `emit_mono.vl:24672` | emitProgram: a call through a chain of more than {} un-annotated aliases of a lambda has n… | 1 row, 1 fixture | D12233 | CAPABILITY | open D12233 |
| `emit_mono.vl:25864` | emitProgram: `{}` returns one function value and its calls deliver it at two function type… | 1 row, 1 fixture | D12234 | CAPABILITY | open D12234 |
| `emit_mono.vl:28052` | emitProgram: the reassigned function binding `{}` holds functions called at more than one … | 2 row, 1 fixture | D3952 | CAPABILITY | open D3952, D4300 |
| `emit_mono.vl:28575` | emitProgram: a lambda with an un-annotated parameter is stored in a list, or in a variable… | 1 row, 2 fixture | D3851 | CAPABILITY | open D3851 |
| `emit_mono.vl:2905` | emitProgram: a nullable-{} list element has no rep; use a non-null element type | 1 fixture, 1 probe | `generics/error-nullable-type-param-list-niche-litunion.vl` | CAPABILITY | new D12451 |
| `emit_mono.vl:3298` | emitProgram: a join of a `??` with a type parameter drops a member of that parameter at th… | 1 row, 1 fixture, 4 corpus | D2934 | CAPABILITY | new D12453 |
| `emit_mono.vl:3322` | emitProgram: a join of type parameters pinned at two number types beside a null has no box… | 2 row | D3485 | CAPABILITY | open D3485, D3591 |
| `emit_mono.vl:9184` | emitProgram: monomorphize: `{}.{}` needs `{}` bound by a parameter — a layout constant is … | 1 probe | probe `flat-layout-const-unbound-type-param` | DESIGN, held at emit | a layout constant of a type parameter no parameter binds; the D4551 ruling default-binds such a parameter (`monoTyParamReachesSpelling`), and the probe's `Should print 9` predates it |
| `emit_mono.vl:9197` | emitProgram: monomorphize: `{}` is bound to `{}`, which is not a `flat` type, so it has no… | 1 fixture | `memory/flat-generic-rows-not-flat-rejected.vl` | DESIGN, held at emit | `docs/internals/flat-records-design.md` §11, a flat layout is instance-only |
| `emit_mono.vl:9207` | emitProgram: monomorphize: `flat type {}` (bound to `{}`) has no field '{}' — its layout m… | 1 fixture | `memory/flat-generic-rows-unknown-member-rejected.vl` | DESIGN, held at emit | the same §11 rule, an unknown member of a flat generic row |
| `emit_rewrite.vl:4306` | {} | 2 row, 1 fixture | D2340 | CAPABILITY | open D2340, D3371 |
| `emit_sections.vl:10209` | emitProgram: this program exports a function named 'memory', but a program that uses linea… | 1 fixture | `memory/export-memory-name-collision.vl` | DESIGN, held at emit | an exported name colliding with the memory export; whether memory is exported is an emit fact (`memUsed`) |
| `emit_sections.vl:1116` | emitProgram: internal: a parameter type the valtype ladder has no rung for — every paramet… | 2 row | D2735 | CAPABILITY | open D2735, D5001 |
| `emit_sections.vl:9810` | emitProgram: module global has no initializer | 3 row | D2020 | CAPABILITY | open D2020, D2655, D3372 |
| `emit_shape_intern.vl:1652` | emitProgram: a nullable-{} list element has no rep; use a non-null element type | 1 fixture | `generics/error-generic-alias-nullable-param-list-at-app.vl` | CAPABILITY | new D12452 |
| `emit_shape_rows.vl:3452` | emitProgram: only i32[] arrays and struct/union element arrays are supported | 2 row | D4044 | CAPABILITY | open D4044; D4052 moved |
| `emit_shape_rows.vl:962` | emitProgram: map value type has no interned slot | 1 row | D3919 | CAPABILITY | open D3919 |
| `emit_value_sites.vl:922` | {} | 1 fixture | `types/error-record-join-lambda-to-generic.vl` | CAPABILITY | new D12454 |
| `wasmEmit.vl:10653` | emitProgram: literal `is` over a union with no recorded members | 1 row | D4203 | CAPABILITY | open D4203 |
| `wasmEmit.vl:11551` | {}field access but no struct type declared{} | 4 row, 1 fixture | D1886 | CAPABILITY | open D1886, D2750, D4614, D4645 |
| `wasmEmit.vl:11561` | {}field access receiver is not a struct{} | 4 row | D3224 | CAPABILITY; DESIGN not moved | open D3224, D3437, D3921, D4266 |
| `wasmEmit.vl:11568` | {}unknown struct field in field access{} | 2 row | D1433 | CAPABILITY; DESIGN not moved | open D1433, D3431 |
| `wasmEmit.vl:11779` | emitProgram: a spread whose elements must each be boxed into a union or nullable element h… | 4 row, 1 fixture | D1852 | CAPABILITY; DESIGN not moved | open D1852, D2969, D2965, D2970 |
| `wasmEmit.vl:12747` | emitProgram: struct array elements are not supported | 1 row | D2920 | CAPABILITY | open D2920 |
| `wasmEmit.vl:12806` | emitProgram: a list literal around a generic call whose `??` default is a list of another … | 1 fixture | `generics/error-list-literal-around-coalesce-default-clash.vl` | CAPABILITY | new D12455 |
| `wasmEmit.vl:13220` | emitProgram: unsupported map value type (no rep for a union-member struct, a nullable list… | 2 row | D10400 | CAPABILITY | open D10400, D12340 |
| `wasmEmit.vl:16975` | emitProgram: index access but list type not collected | 1 probe | probe `map-callback-param-f64-result-index` | CAPABILITY | new D12456 |
| `wasmEmit.vl:17010` | emitProgram: `.length` receiver's ref-list element does not resolve | 2 row | D3154 | CAPABILITY | open D3154, D4883 |
| `wasmEmit.vl:1848` | emitProgram: nested struct fields are not supported | 1 row | D3260 | CAPABILITY | open D3260 |
| `wasmEmit.vl:2045` | emitProgram: object literal but no struct type declared | 1 row | D2681 | CAPABILITY | open D2681 |
| `wasmEmit.vl:20466` | emitProgram: this field is stored at a wider record whose member two of its own members wi… | 1 fixture | `objects/error-record-literal-widened-box-ambiguous-read.vl` | CAPABILITY | new D12462 |
| `wasmEmit.vl:2053` | emitProgram: object literal field count does not match struct | 1 row | D2855 | CAPABILITY | open D2855 |
| `wasmEmit.vl:20971` | emitProgram: a string join whose arm is a nullable literal union was typed non-null here | 1 row, 1 fixture, 22 corpus | D3290 | CAPABILITY | open D3290 |
| `wasmEmit.vl:2102` | emitProgram: object literal is missing a struct field | 2 row | D2580 | CAPABILITY | open D2580, D2797 |
| `wasmEmit.vl:22438` | emitProgram: `as {}` needs a BOXED union operand or a nullable-REF one; this `\| null` is a… | 2 row | D2467 | CAPABILITY | open D2467, D4031 |
| `wasmEmit.vl:22445` | emitProgram: `as {}` over a `{} \| null` is lowered for a string, a list, a struct and a un… | 1 probe | probe `as-trap-nullable-map-niche` | CAPABILITY | new D12460 |
| `wasmEmit.vl:22463` | emitProgram: `as {}` over a `{} \| null` propagates the null to the caller, and only the tr… | 1 probe | probe `as-bare-nullable-ref-niche` | CAPABILITY | new D12461 |
| `wasmEmit.vl:22573` | emitProgram: `as? {}` is supported for a value-atom arm, a struct-variant arm and a sub-un… | 1 row | D4018 | CAPABILITY | open D4018 |
| `wasmEmit.vl:2268` | {} | 2 row, 1 fixture | D9534 | CAPABILITY | open D9534, D12231 |
| `wasmEmit.vl:22908` | emitProgram: `as {}` over a numeric literal union propagates its miss, and this function r… | 1 row | D12130 | CAPABILITY | open D12130 |
| `wasmEmit.vl:25008` | emitProgram: print of a union value whose arms the tag dispatch cannot classify | 3 row | D3472 | CAPABILITY | open D3472, D3644, D3786 |
| `wasmEmit.vl:25376` | emitProgram: call to unknown function | 2 row, 1 fixture | D3383 | CAPABILITY | open D3383, D3873 |
| `wasmEmit.vl:25605` | emitProgram: callee is not a function name | 3 row | D3178 | CAPABILITY | open D3178, D3414, D3467 |
| `wasmEmit.vl:25769` | emitProgram: value-call union-ARM parameter given a value that is not that arm — a value c… | 1 probe | probe `value-call-arm-param-struct-field-read` | CAPABILITY | new D12458 |
| `wasmEmit.vl:25954` | emitProgram: a function value's signature is not known at this call — the type it was give… | 1 row | D9720 | CAPABILITY | open D9720 |
| `wasmEmit.vl:26010` | emitProgram: a function-value call has no interned signature — {} | 1 row | D3822 | CAPABILITY | open D3822 |
| `wasmEmit.vl:2607` | emitProgram: captured variable not found in enclosing frame | 2 row | D3633 | CAPABILITY | open D3633, D12235 |
| `wasmEmit.vl:26533` | emitProgram: i64 indexed assignment but i64 list type not collected | 1 probe | probe `map-callback-binding-i64-indexed-assign` | CAPABILITY | new D12457 |
| `wasmEmit.vl:26568` | emitProgram: indexed-assignment target is not an array | 1 row | D9440 | CAPABILITY | open D9440 |
| `wasmEmit.vl:2681` | emitProgram: a lambda field value resolved to a non-closure variant field slot | 1 fixture | `closures/error-lambda-result-struct-closure-field-variant-twin.vl` | CAPABILITY | new D12463 |
| `wasmEmit.vl:27003` | emitProgram: assignment target is not a simple name | 1 row | D3483 | DESIGN, moved | D3483 closed: `asgTargetIsPlace` |
| `wasmEmit.vl:27161` | {} | 1 row | D4961 | CAPABILITY | open D4961 |
| `wasmEmit.vl:28003` | emitProgram: a ref list's element row does not resolve | 2 row | D2857 | CAPABILITY | open D2857, D10891 |
| `wasmEmit.vl:2841` | emitProgram: object literal is missing a union-variant field | 1 row, 1 fixture, 1 probe | D2302 | CAPABILITY | new D12459 |
| `wasmEmit.vl:2854` | emitProgram: object literal writes a field its union variant does not declare | 1 row, 1 fixture | D4136 | CAPABILITY | open D4136 |
| `wasmEmit.vl:28651` | emitProgram: unsupported .map/.filter element type | 2 row | D2193 | CAPABILITY | open D2193, D4712 |
| `wasmEmit.vl:28682` | emitProgram: .map/.filter scratch frame not reserved | 1 row | D10351 | CAPABILITY | open D10351 |
| `wasmEmit.vl:29215` | emitProgram: covariant list delivery: a {}[] cannot be delivered into a {}[] here. The two… | 2 row | D2194 | CAPABILITY; DESIGN not moved | open D2194, D2215 |
| `wasmEmit.vl:2964` | emitProgram: object literal matches no union variant | 1 row | D4644 | CAPABILITY | open D4644 |
| `wasmEmit.vl:30326` | emitProgram: a returned string cannot be shown to be a member of the literal union this in… | 1 row, 1 fixture | D4173 | CAPABILITY | open D4173 |
| `wasmEmit.vl:35808` | emitProgram: literal-union string widening with no members | 5 row | D2213 | CAPABILITY | open D2213, D3228, D3239, D4028, D4885 |
| `wasmEmit.vl:35840` | emitProgram: literal-union string widening with no members | 278 corpus | corpus `d3290_r4_gE_e0866_letSNw_coal_gen_KN0` | CAPABILITY | new D12464 |
| `wasmEmit.vl:36550` | emitProgram: a generic function taken as a value reaches no call that fixes its type — ann… | 5 row | D4120 | CAPABILITY | open D4120, D9191, D9722, D10370, D10403 |
| `wasmEmit.vl:36575` | emitProgram: identifier is not a parameter, local, or global | 1 row | D2621 | CAPABILITY | open D2621 |
| `wasmEmit.vl:36996` | emitProgram: bare null needs a struct-typed context | 10 row, 1 fixture | D2665 | CAPABILITY; DESIGN not moved | open D2665, D2667, D2889, D2971, D2964, D3131, D3243, D3691, D8880, D10934 |
| `wasmEmit.vl:38121` | emitProgram: only an identifier assignment is a value expression | 4 row | D2171 | CAPABILITY | open D2171, D2632; D2689, D3052 moved |
| `wasmEmit.vl:38385` | emitProgram: the two operands of this list `+` do not resolve to one list rep | 1 row | D4860 | CAPABILITY | open D4860 |
| `wasmEmit.vl:38511` | emitProgram: struct equality is not supported yet | 2 fixture | `unions/error-arm-struct-equality-mixed.vl` | CAPABILITY | new D12465 |
| `wasmEmit.vl:3875` | emitProgram: a discriminant field of this storage has no membership compare | 1 row | D4086 | CAPABILITY | open D4086 |
| `wasmEmit.vl:3894` | emitProgram: `is` over a record tests a field that is not a literal set narrowed from the … | 1 row | D4082 | CAPABILITY | open D4082 |
| `wasmEmit.vl:39399` | emitProgram: __array_new__ fill type not yet supported natively | 1 row | D3540 | CAPABILITY | open D3540 |
| `wasmEmit.vl:39592` | emitProgram: __array_copy__ supports i32/boolean/f64 lists natively | 1 row | D3549 | CAPABILITY | open D3549 |
| `wasmEmit.vl:40043` | emitProgram: `??` over a list whose default is a list of another storage builds no single … | 2 row, 2 fixture | D2799 | CAPABILITY | open D2799, D4192 |
| `wasmEmit.vl:41676` | emitProgram: `?.` over a map read supports only i32/boolean fields | 1 row | D3459 | CAPABILITY | open D3459 |
| `wasmEmit.vl:41940` | emitProgram: `??` over this nullable value is not supported yet — narrow it first, e.g. `i… | 6 row | D3172 | CAPABILITY | open D3172, D3170, D3245, D3373, D3392, D4341 |
| `wasmEmit.vl:4335` | {} | 1 row | D4964 | CAPABILITY | open D4964 |
| `wasmEmit.vl:6148` | emitProgram: `is` names a declared union member with no interned arm representation (defer… | 2 row | D2958 | CAPABILITY | open D2958, D2975 |
| `wasmEmit.vl:6152` | emitProgram: `is` names a type that is not a union variant | 3 row, 1 fixture | D2781 | CAPABILITY | open D2781, D4089, D4778 |
| `wasmEmit.vl:6184` | emitProgram: `is` receiver is not a union value | 2 row | D2976 | CAPABILITY | open D2976, D3311 |
| `wasmEmit.vl:6414` | emitProgram: `is` test but no union type declared | 1 row | D4937 | CAPABILITY | open D4937 |
| `wasmEmit.vl:6546` | emitProgram: `is` across record arms whose shared field holds a value only some of which f… | 1 row | D4267 | CAPABILITY | open D4267 |
| `wasmEmit.vl:6559` | emitProgram: `is` across record arms whose shared field's box holds a member only some of … | 1 row | D4265 | CAPABILITY | open D4265 |
| `wasmEmit.vl:7006` | emitProgram: a standalone `?.` has no rep for a map or closure leaf field — read it throug… | 1 row | D1680 | CAPABILITY | open D1680 |
| `wasmEmit.vl:8034` | emitProgram: literal-union string widening with no members | 1 fixture | `unions/error-nul-literal-union-element-into-box-list.vl` | CAPABILITY | new D12466 |
| `wasmEmit.vl:8101` | emitProgram: union atom has no value box | 1 row | D12100 | CAPABILITY | open D12100 |
| `wasmEmit.vl:8467` | emitProgram: a record value delivered into a union box this program never registered has n… | 1 row | D3519 | CAPABILITY | open D3519 |
| `wasmEmit.vl:8520` | emitProgram: a map value is not a supported union member — use a struct member instead | 1 row | D2649 | CAPABILITY | open D2649 |
