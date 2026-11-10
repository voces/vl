# Step 7 L2 §7: where mono keys by a rendered spelling, measured against the type, 2026-11-10

The render classification (`2026-11-10-step7-l2-render-classes.md`) left 17 mono pin and instance
key renders. They were expected to go once mono instances are keyed by type. This census lists
every place mono keys an instance or a pin by a spelling. For each one it records the type in
hand and asks whether a canonical type key gives the same partition. It also proposes the cut
order.

The base is master `2e71e5a1`, with a fixpoint seed. The population is the whole sweep: 23,862
programs (`cases`, `distilled` and `inventory`). Of those, 23,861 were graded. D12131 is the one
left out: it exhausts the call stack on master as well.

## Method

The probes are an accumulator in a scratch compiler that was never refreshed into a seed, the
same method as `2026-11-10-step7-l2-mv-value-ladder-of-ty.md`. A probe either pairs two keys or
compares a parse against a type twin. Each pairing records, per program, whether one key of the
first kind meets two of the second, and the converse. At the end of `emitProgram`, a program that
fired any probe fails with every id it fired, so one `vl check --batch --json --codegen` pass reads
every site at once. The reach ids are the positive control: every site that a program reaches
fires its own reach id.

Two canonical type keys were tried:

- `tyCanonKey`: the arena type's canonical spelling, with union members in order.
- `repCanonId`: the emitter's interned id.

At the instance level, the shadow key is the template slot, the call frame, the instance's
parameter types (`pinOwn`), the widened result's type and the baked-callback names. Mono's own
keys use the same parts.

## The instance key

9,294 programs build at least one instance through `monoMakeInstance`. The paths are counted by
the programs that take each one (a program can take several):

| path | programs | keyed by |
| --- | --- | --- |
| `call` | 7,481 | the elaboration's call key + the canonical key of the pinned types |
| `value` | 3,131 | the elaboration's value key + the pinned types |
| `pins` | 116 | the elaboration's member key at the pin types |
| `lam` | 60 | the enclosing instance + the pinned types |
| `sig` | 31 | the closed signature |
| `spelled` | 24 | **the pins' spelling** (`monoMakeInstanceKeyOf`); the step 2 closing census names all 25 such builds as REP |

The partitions are compared per program, over the same 9,294 programs:

| keys compared | one A, two B | one B, two A |
| --- | --- | --- |
| A = mono's instance, B = `repCanonId` key | **3**: one instance at two ids | 124: one id, two instances |
| A = mono's instance, B = `tyCanonKey` key | 13 | 187 |
| A = the pin spelling key, B = `tyCanonKey` key | 30: one spelling, two types | 44: one type, two spellings |
| A = the pin spelling key, B = `repCanonId` key | 109 | 58 |
| A = mono's instance, B = the pin spelling key | 40 | 198 |

Mono's instance set is already not the spelling's partition. One instance takes two pin spellings
in 40 programs, and one spelling builds two instances in 198. It parts from the spelling toward
the type: it splits a Set from its boolean map where the body tests a type
parameter (D15171), and it merges member orders (`i32|string` with `string|i32`). Neither
canonical key reproduces it:

- **`repCanonId` is a rep id, not a type id.** It merges `Set<i32>` with `{[i32]:boolean}`
  (D14573, D15109, D15171, D2720), `Box<Set<i32>>` with `Box<{[i32]:boolean}>` (D2722), and two
  string literal unions (`("p"|"q")` and `("p"|"r")`, D4893). Mono builds those apart, as the
  checker's types require. Most of its other splits have an identity beyond the type: 38 programs
  are callback bundles (`{c0: (i32) => i32, ...}`), 23 hole functions (`(_, _) => _`), 13 closed
  function lists and records built per delivered function, and 3 type-variable functions. The
  elaboration key carries that identity, and the type cannot.
- **`tyCanonKey` keeps declared record names.** It splits same-shape records that mono merges by
  row class (`C`/`D` D15107, `Circle`/`{r: i32}`, `K`/`{r: null}` D15262), and it cannot see the
  identity of an open function (`(_, _) => _`). Those account for most of its 13 merges and
  about half of its 187 splits.

The instance key is canonical-type keyed on five of the six paths, with the elaboration's
identity beside the type. There, the canonical type is `tyCanonKey` with records taken by row
class. Measured that way, mono's partition disagrees with the canonical type in three programs:

- **`literal-unions/generic-pin-nullable-string-atom-arg.vl`.** One instance serves the pins
  `("a"|"b")` and `null|string`. Under the step 7 ruling (one instance per canonical type), these
  are two instances. That is a bytes change, so it is not made here.
- **D5001 and `generics/closure-calls-generic-at-enclosing-explicit-type-arg.vl`.** A request
  with no parameter type (`pinOwn` is -1) reuses the `[i32]` instance by its spelling. The
  partition does not disagree here. The type is missing.

The pin-type column (#6740) is missing a type in 3 programs: `fn-value-generic-nullable-fn-param.vl`,
`generic-fn-value-at-enclosing-type-param.vl` and `generic-function-to-generic-callback-parameter.vl`.

## `monoInstanceFor`

`monoInstanceFor` takes pin names and types. Two of its decisions read spellings:

| decision | spelling | type twin | reached | disagree |
| --- | --- | --- | --- | --- |
| concrete annotation agrees with the boundary | `normTypeAtom(ann) == normTypeAtom(pin)` | `monoPinNamesTy(pinTy, annTy)` | 21 programs | 0 decided by the spelling alone; 1 (`fn-value-generic-nullable-fn-param.vl`) has spellings apart and types equal, which the type arm already passes |
| the substituted result differs from the slot's | `normTypeAtom(rs) != monoInstanceRetName` | `!tyEq(rsTy, want)` | 49 | 25 have spellings apart and types equal, and the widening fires in none of them; 0 have no type |
| the widened result's key part | `monoInstanceRetName` | `tyToStr(want)` | 8 fire | 0 (one-to-one in all 8) |

All three twins agree with the spelling's outcome everywhere they are reached.

## The 19 renders in `emit_mono`

The 17 pin and instance key renders, plus the two renders left in the pin decisions
(`monoNarrowedPinName`, `monoNicheWidenedPinName`), whose render is the returned pin. Each is
paired with its type's `tyCanonKey`. "Spelling merges" means one render stands for two types, so
a type key would split it. "Type merges" means one type renders two ways, so a type key would
merge it. "Product" is where the render's string goes.

| render | reached | spelling merges | type merges | product |
| --- | --- | --- | --- | --- |
| `monoI32AtomPinName` | 6,504 | 18 (13 Set/map, 5 alias or shape) | 8 member order | pin text, `monoRegisterElabJoinRows` row name |
| `monoNarrowedPinName` | 4,849 | 25 (17 Set/map, 4 literal union, 4 alias or shape) | 4 member order | argument pin text |
| `monoNicheWidenedPinName` | 4,461 | 132 (74 no render: an open type renders `""`; 40 literal union; 16 Set/map) | 4 member order | argument pin text |
| `monoPinAnnSpelling` | 2,810 | 27 (10 Set/map, 11 nominal records spelled by shape, 6 literal unions) | 2 member order | annotation text for 40 callers: the clone's TypeRefs |
| `monoConcreteFnPinName` | 859 | 0 | 0 | function-value pin text (`tname`) |
| `monoPinUnionNameOfTy` | 357 | 4 Set/map | 14 member order | union registry name |
| `monoInstanceRetSpelling` | 172 | 33 (all no render: a record holding a hole function) | 0 | instance result annotation |
| `monoSigFnTyNameAt` | 103 | 0 | 0 | stored-slot function pin text |
| `monoPinUnionBoxed` | 71 | 0 | 2 member order | union registry name (`monoRegisterPinUnion`) |
| `monoMakerTwin` | 29 | 4 (3 literal-union alias `K`, 1 record alias) | 0 | widened result's TypeRef text; the key reads `tyToStr` (D14941) |
| `monoLamPinName` | 11 | 1 (two records spelled by shape) | 0 | lambda pin text |
| `monoAnnPinNameOfTy` | 10 | 0 | 0 | argument ladder pin |
| `monoPinLamAtTys` | 10 | 0 | 0 | lambda pin text |
| `monoSubstAnonShapes` | 7 | 0 | 0 | substituted `let` annotation |
| `monoFnTyPin` | 4 | 0 | 0 | nullable function pin text |
| `monoListUnionRowName` | 3 | 0 | 0 | union registry row name |
| `monoHoleMapPinName` | 2 | 0 | 0 | argument pin text |
| `monoPreBindNumJoin` | 2 | 0 | 0 | `tvV` binding spelling, substituted into the body's annotations |
| `monoLitUnionPinOfTy` | 1 | 0 | 0 | literal-union pin text |

Where a render merges two types, mono's instance key already separates them (the exact-type
segment, the typed fallback and the literal-union discriminator). That is why the instance-level
table shows 3 merges and not the 132 of `monoNicheWidenedPinName`. A render's partition is not
what decides the instance any more. What keeps each render is its product, and the products fall
into three consumers:

1. **The clone's annotation text**: `monoPinAnnSpelling`, `monoInstanceRetSpelling`,
   `monoSubstAnonShapes`, `monoPreBindNumJoin` and `monoMakerTwin`. Each pin also becomes the
   instance parameter's TypeRef through `monoMakeInstanceParams`. A synthesized TypeRef carries
   its type, but the body rewrite reads the text back (the 40 + 18 readers in step 2's status).
2. **Registry names**: `monoListUnionRowName`, `monoPinUnionNameOfTy`, `monoPinUnionBoxed` and
   `monoI32AtomPinName` in `monoRegisterElabJoinRows`. These name union rows (L6), and an anon pin
   resolves by its handle (`anonHandleTyIx`, D6).
3. **The `spelled` path's key**: the argument ladder's pins are the key only on the 24 programs'
   `spelled` builds, and the step 2 closing census names those as rep twins.

## The parses in `emit_mono`

The render-parse baseline holds 8 parses in `emit_mono.vl` (the brief counted 9).

| parse | in | type in hand | measured |
| --- | --- | --- | --- |
| `nameIsArray(name)` | `monoAnnPinName` | no: 24 callers hand a spelling | the annotation ladder; goes with it |
| `nullablePartOf(name)` | `monoNulAnnName` | no | the annotation ladder |
| `nameIsArray(elem)` | `monoCompositeListAnnName` | no | the annotation ladder |
| `nullablePartOf(wide) == narrow` | `monoNameNarrowsFrom` | the narrow side only | compares against a spelled pin `wide` |
| `nullablePartOf(wide) == inom` | `monoNulRecNamesNarrow` | the narrow side only | the same |
| `an >= 3 && nameIsArray(arrTy)` | `monoArgTyNameProjected` | `arrOut[0]` | reached in 2 programs (D3900, `un-annotated-inline-record-callback-beside-box-list.vl`), with no type in both |
| `annArrowAt(tname0) < 1` | `monoCoerceWrittenLetTys` | `tnameTy0` | reached in 5,764 programs, no type in 29; the `TyFunc` twin is wider in 5 (`collapsing-union-closure-param.vl`, `permuted-object-closure-arms.vl`, …) |
| `annArrowAt(tname) < 1` | `monoCoerceWrittenCell` | none threaded | reached in 913 programs; its five callers would have to pass the type |

No parse is a clean cut today. Two need a type threaded to them, and the written-`let` twin is
wider than the spelling, so it would be a behaviour change.

## Cut order

1. **`monoInstanceFor` asks the type** (this lane's next PR). This covers the concrete-annotation
   check, the widened-result decision and the widened key part. All three are measured above at 0
   disagreements. The PR leaves the render-parse counts unchanged (`annRetNameOf` and
   `normTypeAtom` are outside the ratchet), and it takes the last spelling decision out of the
   function-value instance path.
2. **The `spelled` path, 24 programs**: it goes with the rep twins it builds (step 7's
   built-container and wider-row twins), not on its own.
3. **The clone's parameter and result TypeRefs read by type**: the 40 + 18 body-rewrite readers.
   When no reader takes the text, `monoPinAnnSpelling` (2,810 programs), `monoInstanceRetSpelling`,
   `monoSubstAnonShapes`, `monoPreBindNumJoin` and the argument ladder's pin text stop being
   products, and the ladder's five annotation parses go with them.
4. **Union rows keyed by type (L6)**: `monoListUnionRowName`, `monoPinUnionNameOfTy` and
   `monoPinUnionBoxed`. The 14 member-order merges agree with the ruling (one row per canonical
   type). The 4 Set/map splits are the D4320 question again, which is the union registry's own.
5. **The ruling's one instance change**: `generic-pin-nullable-string-atom-arg.vl` built at two
   instances. It is a bytes mover and needs its own PR with a sweep.

## Proof

This is a docs-only change: no compiler source changes, and the seed is byte-identical by
construction. The probe compiler and its accumulator were built in a scratch worktree, and
neither was committed or refreshed into a seed.
